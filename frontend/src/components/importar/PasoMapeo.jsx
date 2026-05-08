/**
 * ARCHIVO: PasoMapeo.jsx
 * PROPÓSITO: Paso 3 del wizard — Mapeo de columnas con UX de 2 secciones + subacciones anidadas.
 *
 * Sección A: Campos del nivel base (etapa/acción/subacción por fila).
 * Sección B: Acciones derivadas (pivot blocks) con subacciones anidadas.
 * Vista previa jerárquica en tiempo real al final.
 *
 * Produce el mismo JSON (columnMap + pivotBlocks) que consume el backend.
 * Las subacciones se almacenan como pivotBlocks con createsLevel="subaccion"
 * y parentBlockName referenciando la acción padre.
 */
import { useState, useMemo, useCallback } from 'react';
import { ChevronRight, Plus, Info, CheckCircle2 } from 'lucide-react';
import TarjetaAccion from './TarjetaAccion';

const CAMPOS_NIVEL_BASE = [
  { value: '', label: '— No usar —' },
  { value: 'nombre', label: 'Nombre' },
  { value: 'descripcion', label: 'Descripción' },
  { value: 'clave', label: 'Clave' },
  { value: 'fecha_inicio', label: 'Fecha inicio' },
  { value: 'fecha_fin', label: 'Fecha fin' },
  { value: 'responsable', label: 'Responsable' },
  { value: 'entregable', label: 'Entregable' },
  { value: 'estado', label: 'Estado' },
  { value: 'peso', label: 'Peso' },
  { value: 'orden', label: 'Orden' },
  { value: 'dependencia_externa', label: 'Dependencia externa' },
];

const CAMPOS_LABELS = Object.fromEntries(CAMPOS_NIVEL_BASE.filter(c => c.value).map(c => [c.value, c.label]));

const ETIQUETAS_NIVEL = {
  etapa: 'etapa',
  accion: 'acción',
  subaccion: 'subacción',
};

// ─── Helpers para separar acciones y subacciones de pivotBlocks ──
function separarBlocks(pivotBlocks) {
  const acciones = [];
  const subsPorAccion = {}; // accionName → [subBlock, ...]
  for (const block of (pivotBlocks || [])) {
    if ((block.createsLevel || 'accion') === 'subaccion') {
      const parent = block.parentBlockName || '__sin_padre__';
      if (!subsPorAccion[parent]) subsPorAccion[parent] = [];
      subsPorAccion[parent].push(block);
    } else {
      acciones.push(block);
    }
  }
  return { acciones, subsPorAccion };
}

function aplanarBlocks(acciones, subsPorAccion) {
  const resultado = [];
  for (const accion of acciones) {
    resultado.push(accion);
    const subs = subsPorAccion[accion.name] || [];
    for (const sub of subs) {
      resultado.push({ ...sub, parentBlockName: accion.name });
    }
  }
  // Subacciones huérfanas (sin padre válido)
  for (const [parent, subs] of Object.entries(subsPorAccion)) {
    if (!acciones.some(a => a.name === parent)) {
      resultado.push(...subs);
    }
  }
  return resultado;
}

export default function PasoMapeo({ headers, superHeaders, sampleRows, config, totalDataRows: totalDataRowsProp, onCambiar, onAvanzar }) {
  // Separar acciones y subacciones del config.pivotBlocks inicial
  const inicial = useMemo(() => separarBlocks(config.pivotBlocks), []);

  const [columnMap, setColumnMap] = useState(() => config.columnMap || {});
  const [acciones, setAcciones] = useState(() => inicial.acciones);
  const [subsPorAccion, setSubsPorAccion] = useState(() => inicial.subsPorAccion);
  const [errorValidacion, setErrorValidacion] = useState(null);

  const rowLevel = config.rowLevel || 'etapa';
  const etiquetaNivel = ETIQUETAS_NIVEL[rowLevel] || 'etapa';

  // ─── Todas las columnas usadas por subacciones (flat set) ──────
  const columnasEnSubacciones = useMemo(() => {
    const set = new Set();
    for (const subs of Object.values(subsPorAccion)) {
      for (const sub of subs) {
        for (const col of (sub.columns || [])) set.add(col);
      }
    }
    return set;
  }, [subsPorAccion]);

  // ─── Columnas asignadas en Sección A ───────────────────────────
  const columnasSeccionA = useMemo(() => {
    return new Set(Object.keys(columnMap).map(Number));
  }, [columnMap]);

  // ─── Columnas usadas en acciones + subacciones (Sección B) ────
  const columnasSeccionB = useMemo(() => {
    const set = new Set();
    for (const block of acciones) {
      for (const col of (block.columns || [])) set.add(col);
    }
    for (const col of columnasEnSubacciones) set.add(col);
    return set;
  }, [acciones, columnasEnSubacciones]);

  // ─── Columnas disponibles para Sección B (no usadas en A) ─────
  const columnasParaAcciones = useMemo(() => {
    return headers
      .map((_, i) => i)
      .filter(i => !columnasSeccionA.has(i));
  }, [headers, columnasSeccionA]);

  // ─── Columnas disponibles para una acción específica ───────────
  // Excluye columnas usadas por OTRAS acciones y ALL subacciones de OTRAS acciones
  const columnasParaAccion = useCallback((accionIdx) => {
    const usadasPorOtras = new Set();
    acciones.forEach((block, idx) => {
      if (idx !== accionIdx) {
        for (const col of (block.columns || [])) usadasPorOtras.add(col);
      }
    });
    // Excluir subacciones de OTRAS acciones
    const thisName = acciones[accionIdx]?.name;
    for (const [parent, subs] of Object.entries(subsPorAccion)) {
      if (parent !== thisName) {
        for (const sub of subs) {
          for (const col of (sub.columns || [])) usadasPorOtras.add(col);
        }
      }
    }
    return columnasParaAcciones.filter(i => !usadasPorOtras.has(i));
  }, [acciones, subsPorAccion, columnasParaAcciones]);

  // ─── Columnas disponibles para una subacción específica ────────
  // Excluye cols de: Section A, other actions, parent action's own fieldMap, other subs
  const columnasParaSubaccionFactory = useCallback((accionIdx) => {
    return (subIdx) => {
      const accion = acciones[accionIdx];
      if (!accion) return [];
      // Columnas del pool de esta acción (no usadas en A ni otras acciones)
      const poolAccion = columnasParaAccion(accionIdx);
      // Excluir columnas usadas por la acción misma
      const usadasPorAccion = new Set(Object.keys(accion.fieldMap || {}).map(Number));
      // Excluir columnas usadas por OTRAS subacciones de esta acción
      const subs = subsPorAccion[accion.name] || [];
      const usadasPorOtrasSubs = new Set();
      subs.forEach((sub, idx) => {
        if (idx !== subIdx) {
          for (const col of (sub.columns || [])) usadasPorOtrasSubs.add(col);
        }
      });
      return poolAccion.filter(i => !usadasPorAccion.has(i) && !usadasPorOtrasSubs.has(i));
    };
  }, [acciones, subsPorAccion, columnasParaAccion]);

  // ─── Validaciones ──────────────────────────────────────────────
  const tieneNombre = Object.values(columnMap).includes('nombre');

  const erroresAcciones = useMemo(() => {
    const errores = {};
    const nombres = new Set();
    acciones.forEach((block, idx) => {
      if (!block.name || !block.name.trim()) {
        errores[idx] = 'El nombre es obligatorio';
      } else if (nombres.has(block.name.trim().toLowerCase())) {
        errores[idx] = 'Nombre duplicado';
      }
      nombres.add((block.name || '').trim().toLowerCase());
    });
    return errores;
  }, [acciones]);

  const erroresSubaccionesPorAccion = useMemo(() => {
    const resultado = {};
    for (const [parent, subs] of Object.entries(subsPorAccion)) {
      const errores = {};
      const nombres = new Set();
      subs.forEach((sub, idx) => {
        if (!sub.name || !sub.name.trim()) {
          errores[idx] = 'El nombre es obligatorio';
        } else if (nombres.has(sub.name.trim().toLowerCase())) {
          errores[idx] = 'Nombre duplicado';
        }
        nombres.add((sub.name || '').trim().toLowerCase());
      });
      if (Object.keys(errores).length > 0) resultado[parent] = errores;
    }
    return resultado;
  }, [subsPorAccion]);

  const tieneErroresSubs = Object.keys(erroresSubaccionesPorAccion).length > 0;
  const puedeAvanzar = tieneNombre && Object.keys(erroresAcciones).length === 0 && !tieneErroresSubs;

  // ─── Handlers ──────────────────────────────────────────────────
  const actualizarMapeo = (colIdx, campo) => {
    const nuevo = { ...columnMap };
    if (campo === '') {
      delete nuevo[colIdx];
    } else {
      nuevo[colIdx] = campo;
    }
    setColumnMap(nuevo);
    setErrorValidacion(null);
  };

  const agregarAccion = () => {
    setAcciones([...acciones, {
      name: '',
      columns: [],
      fieldMap: {},
      createsLevel: 'accion',
    }]);
  };

  const actualizarAccion = (idx, block) => {
    const oldName = acciones[idx]?.name;
    const newName = block.name;
    const copia = [...acciones];
    copia[idx] = block;
    setAcciones(copia);
    // Si el nombre cambió, actualizar parentBlockName en subacciones
    if (oldName && oldName !== newName && subsPorAccion[oldName]) {
      const nuevoSubs = { ...subsPorAccion };
      nuevoSubs[newName] = (nuevoSubs[oldName] || []).map(s => ({ ...s, parentBlockName: newName }));
      delete nuevoSubs[oldName];
      setSubsPorAccion(nuevoSubs);
    }
  };

  const eliminarAccion = (idx) => {
    const nombre = acciones[idx]?.name;
    setAcciones(acciones.filter((_, i) => i !== idx));
    // Eliminar subacciones de esta acción
    if (nombre && subsPorAccion[nombre]) {
      const nuevoSubs = { ...subsPorAccion };
      delete nuevoSubs[nombre];
      setSubsPorAccion(nuevoSubs);
    }
  };

  const actualizarSubaccionesDeAccion = (accionName, subs) => {
    setSubsPorAccion(prev => ({ ...prev, [accionName]: subs }));
  };

  const guardar = () => {
    if (!tieneNombre) {
      setErrorValidacion('Debes asignar al menos una columna al campo "Nombre".');
      return;
    }
    if (Object.keys(erroresAcciones).length > 0 || tieneErroresSubs) {
      setErrorValidacion('Corrige los errores en las acciones/subacciones antes de continuar.');
      return;
    }
    const pivotBlocks = aplanarBlocks(acciones, subsPorAccion);
    onCambiar({ columnMap, pivotBlocks });
    onAvanzar();
  };

  // ─── Vista previa dinámica (jerárquica) ────────────────────────
  const camposAsignados = Object.values(columnMap)
    .map(v => CAMPOS_LABELS[v])
    .filter(Boolean);

  const accionesResumen = acciones
    .filter(b => b.name && b.name.trim())
    .map(b => {
      const campos = Object.values(b.fieldMap || {})
        .map(v => CAMPOS_LABELS[v] || v)
        .filter(Boolean);
      const subs = (subsPorAccion[b.name] || [])
        .filter(s => s.name && s.name.trim())
        .map(s => ({
          nombre: s.name,
          campos: Object.values(s.fieldMap || {}).map(v => CAMPOS_LABELS[v] || v).filter(Boolean),
        }));
      return { nombre: b.name, campos, subs };
    });

  const totalSubacciones = accionesResumen.reduce((sum, a) => sum + a.subs.length, 0);
  const totalDataRows = totalDataRowsProp || sampleRows?.length || 0;

  return (
    <div className="space-y-6">
      {/* ═══ SECCIÓN A ═══ */}
      <section>
        <h3 className="text-sm font-semibold text-gray-800">
          Datos de la {etiquetaNivel} de cada fila
        </h3>
        <p className="text-xs text-gray-500 mt-1 flex items-start gap-1.5">
          <Info size={12} className="text-blue-400 mt-0.5 flex-shrink-0" />
          <span>
            Las columnas que selecciones aquí describen la {etiquetaNivel} que se creará por cada
            fila del archivo. Las que dejes en "No usar" las puedes asignar más abajo a acciones.
          </span>
        </p>

        <div className="mt-3 border rounded-lg overflow-hidden">
          <div className="max-h-56 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-1.5 text-left font-medium text-gray-500">Columna</th>
                  {superHeaders && (
                    <th className="px-3 py-1.5 text-left font-medium text-gray-500">Grupo</th>
                  )}
                  <th className="px-3 py-1.5 text-left font-medium text-gray-500">Ejemplo</th>
                  <th className="px-3 py-1.5 text-left font-medium text-gray-500 w-44">Asignar a</th>
                </tr>
              </thead>
              <tbody>
                {headers.map((h, i) => {
                  const enAccion = columnasSeccionB.has(i);
                  return (
                    <tr key={i} className={`border-t ${enAccion ? 'bg-amber-50/50' : ''}`}>
                      <td className="px-3 py-1.5 font-medium text-gray-700">
                        {h || <span className="italic text-gray-400">Col {i}</span>}
                      </td>
                      {superHeaders && (
                        <td className="px-3 py-1.5 text-purple-600 text-xs">
                          {superHeaders[i] || '—'}
                        </td>
                      )}
                      <td className="px-3 py-1.5 text-gray-500 max-w-28 truncate">
                        {sampleRows[0]?.[i] || '—'}
                      </td>
                      <td className="px-3 py-1.5">
                        {enAccion ? (
                          <span className="text-xs text-amber-600 italic">→ en acción</span>
                        ) : (
                          <select
                            value={columnMap[i] || ''}
                            onChange={e => actualizarMapeo(i, e.target.value)}
                            className="w-full border rounded px-2 py-1 text-xs"
                          >
                            {CAMPOS_NIVEL_BASE.map(c => (
                              <option key={c.value} value={c.value}>{c.label}</option>
                            ))}
                          </select>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {!tieneNombre && errorValidacion && (
          <p className="text-xs text-red-500 mt-2 font-medium">{errorValidacion}</p>
        )}
      </section>

      {/* ═══ SECCIÓN B — Acciones con subacciones anidadas ═══ */}
      <section>
        <h3 className="text-sm font-semibold text-gray-800">
          (Opcional) Crear acciones automáticamente
        </h3>
        <p className="text-xs text-gray-500 mt-1 flex items-start gap-1.5">
          <Info size={12} className="text-blue-400 mt-0.5 flex-shrink-0" />
          <span>
            Si tu archivo tiene columnas agrupadas que representan acciones dentro de cada {etiquetaNivel}
            (por ejemplo, fases de un proceso con su propio estado y fechas), créalas aquí.
            Dentro de cada acción puedes crear subacciones si necesitas un nivel más de detalle.
          </span>
        </p>

        <div className="mt-3 space-y-2">
          {acciones.map((block, idx) => (
            <TarjetaAccion
              key={idx}
              accion={block}
              index={idx}
              columnasDisponibles={columnasParaAccion(idx)}
              headers={headers}
              subacciones={subsPorAccion[block.name] || []}
              onSubaccionesChange={(subs) => actualizarSubaccionesDeAccion(block.name, subs)}
              columnasParaSubaccion={columnasParaSubaccionFactory(idx)}
              erroresSubacciones={erroresSubaccionesPorAccion[block.name] || {}}
              onChange={(b) => actualizarAccion(idx, b)}
              onDelete={() => eliminarAccion(idx)}
              errorNombre={erroresAcciones[idx] || null}
            />
          ))}

          <button
            onClick={agregarAccion}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-blue-600 border border-dashed border-blue-300 rounded-lg hover:bg-blue-50 w-full justify-center"
          >
            <Plus size={14} /> Agregar acción
          </button>
        </div>
      </section>

      {/* ═══ VISTA PREVIA DINÁMICA (JERÁRQUICA) ═══ */}
      <section className="bg-gray-50 border rounded-lg p-4">
        <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
          Vista previa de lo que se importará por cada fila
        </h4>
        <div className="space-y-1 text-sm">
          {tieneNombre ? (
            <>
              <p className="flex items-center gap-1.5 text-green-700">
                <CheckCircle2 size={14} />
                1 {etiquetaNivel} con campos: {camposAsignados.join(', ')}
              </p>
              {accionesResumen.length > 0 && (
                <>
                  <p className="flex items-center gap-1.5 text-green-700">
                    <CheckCircle2 size={14} />
                    {accionesResumen.length} {accionesResumen.length === 1 ? 'acción derivada' : 'acciones derivadas'}:
                  </p>
                  <ul className="ml-7 text-xs text-gray-600 space-y-1">
                    {accionesResumen.map((a, i) => (
                      <li key={i}>
                        <span>• {a.nombre} ({a.campos.length > 0 ? a.campos.join(', ') : 'sin campos'})</span>
                        {a.subs.length > 0 && (
                          <ul className="ml-4 mt-0.5 space-y-0.5 text-indigo-600">
                            <li className="text-xs">└─ {a.subs.length} {a.subs.length === 1 ? 'subacción' : 'subacciones'}:</li>
                            {a.subs.map((s, j) => (
                              <li key={j} className="ml-5 text-xs text-gray-500">
                                • {s.nombre} ({s.campos.length > 0 ? s.campos.join(', ') : 'sin campos'})
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {totalDataRows > 0 && (
                <p className="text-xs text-gray-500 mt-2 pt-2 border-t border-gray-200">
                  Total estimado al importar: <strong>{totalDataRows} {etiquetaNivel}s</strong>
                  {accionesResumen.length > 0 && (
                    <> + <strong>{totalDataRows * accionesResumen.length} acciones</strong></>
                  )}
                  {totalSubacciones > 0 && (
                    <> + <strong>{totalDataRows * totalSubacciones} subacciones</strong></>
                  )}
                </p>
              )}
            </>
          ) : (
            <p className="text-gray-400 italic text-xs">
              Asigna al menos una columna a "Nombre" para ver la vista previa.
            </p>
          )}
        </div>
      </section>

      {/* ═══ BOTÓN SIGUIENTE ═══ */}
      {errorValidacion && (
        <p className="text-xs text-red-500 font-medium">{errorValidacion}</p>
      )}
      <div className="flex justify-end pt-1">
        <button
          onClick={guardar}
          disabled={!puedeAvanzar}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm rounded-md font-medium transition-colors ${
            puedeAvanzar
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
        >
          Siguiente <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
