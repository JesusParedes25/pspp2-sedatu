/**
 * ARCHIVO: PasoMapeo.jsx
 * PROPÓSITO: Paso 3 del wizard — Mapeo de Propiedades.
 *
 * Presenta un dropdown por cada columna del Excel con:
 *   1. Propiedades universales (hardcoded)
 *   2. Propiedades existentes de campos_extra (dinámicas, del backend)
 *   3. Opción "Crear nueva propiedad (Campo extra)"
 *
 * Produce un columnMap JSON para el backend.
 */
import { useState, useEffect, useMemo } from 'react';
import { ChevronRight, Info, CheckCircle2, Plus, Loader2 } from 'lucide-react';
import client from '../../api/client';

// ─── Propiedades universales (hardcoded) ─────────────────────────
const PROPIEDADES_UNIVERSALES = [
  { value: '', label: '— No usar —', grupo: null },
  { value: 'nombre', label: 'Nombre', grupo: 'Datos básicos' },
  { value: 'descripcion', label: 'Descripción', grupo: 'Datos básicos' },
  { value: '_extra:clave_folio', label: 'Clave, Folio o identificador', grupo: 'Datos básicos' },
  { value: 'fecha_inicio', label: 'Fecha de inicio', grupo: 'Fechas' },
  { value: 'fecha_fin', label: 'Fecha de entrega', grupo: 'Fechas' },
  { value: 'responsable', label: 'Responsable', grupo: 'Asignación' },
  { value: 'estado', label: 'Estatus', grupo: 'Estado' },
  { value: '_extra:estado_original', label: 'Estado original (texto libre)', grupo: 'Estado' },
  { value: 'entidad_federativa', label: 'Entidad Federativa (nombre o clave)', grupo: 'Geografía' },
  { value: 'municipio', label: 'Municipio (nombre o clave)', grupo: 'Geografía' },
  { value: 'semaforo_explicito', label: 'Semaforización', grupo: 'Avance' },
  { value: 'porcentaje_avance', label: '% de avance', grupo: 'Avance' },
  { value: 'evidencia_link', label: 'Evidencia link', grupo: 'Relacional' },
  { value: 'comentario', label: 'Comentarios', grupo: 'Relacional' },
  { value: '_extra:indicador', label: 'Indicador', grupo: 'Avance' },
];

const ETIQUETAS_NIVEL = {
  etapa: 'componente',
  accion: 'acción',
  subaccion: 'tarea',
};

export default function PasoMapeo({ headers, superHeaders, sampleRows, config, totalDataRows: totalDataRowsProp, onCambiar, onAvanzar, proyectoId }) {
  const [columnMap, setColumnMap] = useState(() => config.columnMap || {});
  const [extraNames, setExtraNames] = useState(() => {
    const names = {};
    for (const [k, v] of Object.entries(config.columnMap || {})) {
      if (String(v).startsWith('_extra:') && !PROPIEDADES_UNIVERSALES.some(p => p.value === v)) {
        names[k] = v.replace('_extra:', '');
      }
    }
    return names;
  });
  const [newPropInputs, setNewPropInputs] = useState({});
  const [errorValidacion, setErrorValidacion] = useState(null);

  // Campos extra existentes cargados dinámicamente
  const [camposExtraExistentes, setCamposExtraExistentes] = useState([]);
  const [cargandoSchema, setCargandoSchema] = useState(false);

  const rowLevel = config.rowLevel || 'etapa';
  const etiquetaNivel = ETIQUETAS_NIVEL[rowLevel] || 'componente';

  // Cargar campos_extra existentes del proyecto
  useEffect(() => {
    if (!proyectoId) return;
    setCargandoSchema(true);
    client.get(`/proyectos/${proyectoId}/campos-extra-schema`)
      .then(res => {
        const claves = res.data?.datos || [];
        setCamposExtraExistentes(claves);
      })
      .catch(() => {})
      .finally(() => setCargandoSchema(false));
  }, [proyectoId]);

  // Construir lista completa de opciones para el dropdown
  const opcionesDropdown = useMemo(() => {
    const opciones = [...PROPIEDADES_UNIVERSALES];

    // Agregar campos_extra existentes que no estén ya en las universales
    const valoresUniversales = new Set(PROPIEDADES_UNIVERSALES.map(p => p.value));
    const extraExistentes = camposExtraExistentes
      .filter(clave => !valoresUniversales.has(`_extra:${clave}`))
      .map(clave => ({
        value: `_extra:${clave}`,
        label: clave,
        grupo: 'Propiedades existentes',
      }));

    if (extraExistentes.length > 0) {
      opciones.push(...extraExistentes);
    }

    // Opción para crear nueva propiedad
    opciones.push({
      value: '__nueva_propiedad__',
      label: '➕ Crear nueva propiedad (Campo extra)',
      grupo: 'Nuevo',
    });

    return opciones;
  }, [camposExtraExistentes]);

  // Agrupar opciones para <optgroup>
  const gruposDropdown = useMemo(() => {
    const grupos = {};
    for (const opt of opcionesDropdown) {
      if (!opt.grupo) {
        if (!grupos['_sin_grupo']) grupos['_sin_grupo'] = [];
        grupos['_sin_grupo'].push(opt);
        continue;
      }
      if (!grupos[opt.grupo]) grupos[opt.grupo] = [];
      grupos[opt.grupo].push(opt);
    }
    return grupos;
  }, [opcionesDropdown]);

  // ─── Validaciones ──────────────────────────────────────────────
  const tieneNombre = Object.values(columnMap).includes('nombre');
  const puedeAvanzar = tieneNombre;

  // ─── Handlers ──────────────────────────────────────────────────
  const actualizarMapeo = (colIdx, valor) => {
    const nuevo = { ...columnMap };

    if (valor === '') {
      delete nuevo[colIdx];
      setNewPropInputs(prev => { const n = { ...prev }; delete n[colIdx]; return n; });
      setExtraNames(prev => { const n = { ...prev }; delete n[colIdx]; return n; });
    } else if (valor === '__nueva_propiedad__') {
      // Mostrar input para nombre de la nueva propiedad, default al header
      const defaultName = headers[colIdx] || '';
      nuevo[colIdx] = `_extra:${defaultName}`;
      setNewPropInputs(prev => ({ ...prev, [colIdx]: defaultName }));
    } else {
      nuevo[colIdx] = valor;
      setNewPropInputs(prev => { const n = { ...prev }; delete n[colIdx]; return n; });
      setExtraNames(prev => { const n = { ...prev }; delete n[colIdx]; return n; });
    }
    setColumnMap(nuevo);
    setErrorValidacion(null);
  };

  const actualizarNombreNuevaProp = (colIdx, nombre) => {
    setNewPropInputs(prev => ({ ...prev, [colIdx]: nombre }));
    setColumnMap(prev => ({ ...prev, [colIdx]: `_extra:${nombre}` }));
  };

  const guardar = () => {
    if (!tieneNombre) {
      setErrorValidacion('Debes asignar al menos una columna a la propiedad "Nombre".');
      return;
    }
    // Limpiar pivotBlocks (ya no se usan)
    onCambiar({ columnMap, pivotBlocks: [] });
    onAvanzar();
  };

  // ─── Calcular resumen ──────────────────────────────────────────
  const camposAsignados = Object.values(columnMap)
    .map(v => {
      const opt = opcionesDropdown.find(o => o.value === v);
      if (opt) return opt.label;
      if (v.startsWith('_extra:')) return v.replace('_extra:', '');
      return v;
    })
    .filter(Boolean);

  const totalDataRows = totalDataRowsProp || sampleRows?.length || 0;

  // ─── Determinar el valor actual del select para cada columna ───
  const getSelectValue = (colIdx) => {
    if (newPropInputs[colIdx] !== undefined) return '__nueva_propiedad__';
    const mapped = columnMap[colIdx];
    if (!mapped) return '';
    // Si es un _extra: que no está en las opciones de dropdown, es una nueva
    if (mapped.startsWith('_extra:')) {
      const existeEnDropdown = opcionesDropdown.some(o => o.value === mapped);
      if (!existeEnDropdown) return '__nueva_propiedad__';
    }
    return mapped;
  };

  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-sm font-semibold text-gray-800">
          Mapeo de propiedades
        </h3>
        <p className="text-xs text-gray-500 mt-1 flex items-start gap-1.5">
          <Info size={12} className="text-blue-400 mt-0.5 flex-shrink-0" />
          <span>
            Asigna cada columna de tu archivo a una propiedad del sistema.
            Las que dejes en «No usar» se ignorarán.
            {cargandoSchema && <Loader2 size={12} className="inline animate-spin ml-1" />}
          </span>
        </p>

        <div className="mt-3 border rounded-lg overflow-hidden">
          <div className="max-h-[420px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-500 w-40">Columna del archivo</th>
                  {superHeaders && (
                    <th className="px-3 py-2 text-left font-medium text-gray-500 w-28">Grupo</th>
                  )}
                  <th className="px-3 py-2 text-left font-medium text-gray-500 w-36">Ejemplo</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">Asignar a propiedad</th>
                </tr>
              </thead>
              <tbody>
                {headers.map((h, i) => {
                  const selectVal = getSelectValue(i);
                  const esNuevaProp = newPropInputs[i] !== undefined;
                  const estaAsignado = columnMap[i] && columnMap[i] !== '';

                  return (
                    <tr key={i} className={`border-t ${estaAsignado ? 'bg-green-50/40' : ''}`}>
                      <td className="px-3 py-2 font-medium text-gray-700">
                        {h || <span className="italic text-gray-400">Columna {i + 1}</span>}
                      </td>
                      {superHeaders && (
                        <td className="px-3 py-2 text-purple-600 text-xs">
                          {superHeaders[i] || '—'}
                        </td>
                      )}
                      <td className="px-3 py-2 text-gray-500 max-w-36 truncate" title={sampleRows[0]?.[i] || ''}>
                        {sampleRows[0]?.[i] || '—'}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1.5 items-center">
                          <select
                            value={selectVal}
                            onChange={e => actualizarMapeo(i, e.target.value)}
                            className={`border rounded px-2 py-1.5 text-xs flex-1 min-w-0 ${
                              estaAsignado ? 'border-green-300 bg-green-50' : ''
                            }`}
                          >
                            {Object.entries(gruposDropdown).map(([grupo, opts]) => {
                              if (grupo === '_sin_grupo') {
                                return opts.map(o => (
                                  <option key={o.value} value={o.value}>{o.label}</option>
                                ));
                              }
                              return (
                                <optgroup key={grupo} label={grupo}>
                                  {opts.map(o => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                  ))}
                                </optgroup>
                              );
                            })}
                          </select>
                          {esNuevaProp && (
                            <input
                              type="text"
                              value={newPropInputs[i]}
                              onChange={e => actualizarNombreNuevaProp(i, e.target.value)}
                              placeholder="Nombre de la propiedad"
                              className="border border-blue-300 rounded px-2 py-1.5 text-xs w-36 bg-blue-50"
                              autoFocus
                            />
                          )}
                        </div>
                        {esNuevaProp && (
                          <p className="text-[10px] text-blue-500 mt-0.5 ml-0.5">
                            Esta propiedad se guardará como campo extra y estará disponible para todos en futuras importaciones.
                          </p>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {errorValidacion && (
          <p className="text-xs text-red-500 mt-2 font-medium">{errorValidacion}</p>
        )}
      </section>

      {/* ═══ RESUMEN ═══ */}
      <section className="bg-gray-50 border rounded-lg p-4">
        <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
          Resumen del mapeo
        </h4>
        <div className="space-y-1 text-sm">
          {tieneNombre ? (
            <>
              <p className="flex items-center gap-1.5 text-green-700">
                <CheckCircle2 size={14} />
                Se creará 1 {etiquetaNivel} por fila con: {camposAsignados.join(', ')}
              </p>
              {totalDataRows > 0 && (
                <p className="text-xs text-gray-500 mt-2 pt-2 border-t border-gray-200">
                  Total estimado: <strong>{totalDataRows} {etiquetaNivel}(s)</strong>
                </p>
              )}
            </>
          ) : (
            <p className="text-gray-400 italic text-xs">
              Asigna al menos una columna a «Nombre» para continuar.
            </p>
          )}
        </div>
      </section>

      {/* ═══ BOTÓN SIGUIENTE ═══ */}
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
