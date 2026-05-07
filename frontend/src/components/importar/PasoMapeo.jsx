/**
 * ARCHIVO: PasoMapeo.jsx
 * PROPÓSITO: Paso 3 del wizard — Mapeo de columnas con UX de 3 secciones.
 *
 * Sección A: Campos del nivel base (etapa/acción/subacción por fila).
 * Sección B: Acciones derivadas (pivot blocks) — opcional.
 * Sección C: Subacciones — diferido (TODO futuro).
 * Vista previa en tiempo real al final.
 *
 * Produce el mismo JSON (columnMap + pivotBlocks) que consume el backend.
 */
import { useState, useMemo } from 'react';
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

const ETIQUETAS_NIVEL = {
  etapa: 'etapa',
  accion: 'acción',
  subaccion: 'subacción',
};

export default function PasoMapeo({ headers, superHeaders, sampleRows, config, totalDataRows: totalDataRowsProp, onCambiar, onAvanzar }) {
  const [columnMap, setColumnMap] = useState(() => config.columnMap || {});
  const [pivotBlocks, setPivotBlocks] = useState(() => config.pivotBlocks || []);
  const [errorValidacion, setErrorValidacion] = useState(null);

  const rowLevel = config.rowLevel || 'etapa';
  const etiquetaNivel = ETIQUETAS_NIVEL[rowLevel] || 'etapa';

  // ─── Columnas asignadas en Sección A ───────────────────────────
  const columnasSeccionA = useMemo(() => {
    return new Set(Object.keys(columnMap).map(Number));
  }, [columnMap]);

  // ─── Columnas usadas en todas las acciones (Sección B) ────────
  const columnasSeccionB = useMemo(() => {
    const set = new Set();
    for (const block of pivotBlocks) {
      for (const col of (block.columns || [])) {
        set.add(col);
      }
    }
    return set;
  }, [pivotBlocks]);

  // ─── Columnas disponibles para Sección B (no usadas en A) ─────
  const columnasParaAcciones = useMemo(() => {
    return headers
      .map((_, i) => i)
      .filter(i => !columnasSeccionA.has(i));
  }, [headers, columnasSeccionA]);

  // ─── Columnas disponibles para una acción específica ───────────
  const columnasParaAccion = (accionIdx) => {
    const usadasPorOtras = new Set();
    pivotBlocks.forEach((block, idx) => {
      if (idx !== accionIdx) {
        for (const col of (block.columns || [])) {
          usadasPorOtras.add(col);
        }
      }
    });
    return columnasParaAcciones.filter(i => !usadasPorOtras.has(i));
  };

  // ─── Validaciones ──────────────────────────────────────────────
  const tieneNombre = Object.values(columnMap).includes('nombre');

  const erroresAcciones = useMemo(() => {
    const errores = {};
    const nombres = new Set();
    pivotBlocks.forEach((block, idx) => {
      if (!block.name || !block.name.trim()) {
        errores[idx] = 'El nombre es obligatorio';
      } else if (nombres.has(block.name.trim().toLowerCase())) {
        errores[idx] = 'Nombre duplicado';
      }
      nombres.add((block.name || '').trim().toLowerCase());
    });
    return errores;
  }, [pivotBlocks]);

  const puedeAvanzar = tieneNombre && Object.keys(erroresAcciones).length === 0;

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
    setPivotBlocks([...pivotBlocks, {
      name: '',
      columns: [],
      fieldMap: {},
      createsLevel: 'accion',
    }]);
  };

  const actualizarAccion = (idx, block) => {
    const copia = [...pivotBlocks];
    copia[idx] = block;
    setPivotBlocks(copia);
  };

  const eliminarAccion = (idx) => {
    setPivotBlocks(pivotBlocks.filter((_, i) => i !== idx));
  };

  const guardar = () => {
    if (!tieneNombre) {
      setErrorValidacion('Debes asignar al menos una columna al campo "Nombre".');
      return;
    }
    if (Object.keys(erroresAcciones).length > 0) {
      setErrorValidacion('Corrige los errores en las acciones antes de continuar.');
      return;
    }
    onCambiar({ columnMap, pivotBlocks });
    onAvanzar();
  };

  // ─── Vista previa dinámica ─────────────────────────────────────
  const camposAsignados = Object.values(columnMap)
    .map(v => CAMPOS_NIVEL_BASE.find(c => c.value === v)?.label)
    .filter(Boolean);

  const accionesResumen = pivotBlocks
    .filter(b => b.name && b.name.trim())
    .map(b => {
      const campos = Object.values(b.fieldMap || {})
        .map(v => {
          const def = CAMPOS_NIVEL_BASE.find(c => c.value === v);
          return def ? def.label : v;
        })
        .filter(Boolean);
      return { nombre: b.name, campos };
    });

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

      {/* ═══ SECCIÓN B ═══ */}
      <section>
        <h3 className="text-sm font-semibold text-gray-800">
          (Opcional) Crear acciones automáticamente
        </h3>
        <p className="text-xs text-gray-500 mt-1 flex items-start gap-1.5">
          <Info size={12} className="text-blue-400 mt-0.5 flex-shrink-0" />
          <span>
            Si tu archivo tiene columnas agrupadas que representan acciones dentro de cada {etiquetaNivel}
            (por ejemplo, fases de un proceso con su propio estado y fechas), créalas aquí.
            Si tu archivo solo tiene una {etiquetaNivel} por fila sin acciones internas, salta esta sección.
          </span>
        </p>

        <div className="mt-3 space-y-2">
          {pivotBlocks.map((block, idx) => (
            <TarjetaAccion
              key={idx}
              accion={block}
              index={idx}
              columnasDisponibles={columnasParaAccion(idx)}
              headers={headers}
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

      {/* ═══ SECCIÓN C — Diferida ═══ */}
      {/* TODO: Subacciones en sprint futuro */}

      {/* ═══ VISTA PREVIA DINÁMICA ═══ */}
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
                  <ul className="ml-7 text-xs text-gray-600 space-y-0.5">
                    {accionesResumen.map((a, i) => (
                      <li key={i}>• {a.nombre} ({a.campos.length > 0 ? a.campos.join(', ') : 'sin campos'})</li>
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
