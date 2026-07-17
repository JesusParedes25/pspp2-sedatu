/**
 * ARCHIVO: PasoMultiHoja.jsx
 * PROPÓSITO: Flujo de importación multi-hoja con mapeo completo de columnas.
 *
 * Pasos:
 *   1. resumen — Hojas detectadas, selección de columnas clave (ID, nombre, ref)
 *   2. mapeo   — Mapeo completo de columnas Excel → propiedades destino
 *   3. preview — Árbol jerárquico con datos mapeados
 *   4. importando / exito
 */
import { useState } from 'react';
import { Layers, Zap, ListChecks, ChevronDown, ChevronRight, AlertTriangle, CheckCircle2, Loader2, ArrowRight } from 'lucide-react';
import * as importarApi from '../../api/importar';

// ─── Propiedades destino por nivel ─────────────────────────────
const PROPS_CONTENEDOR = [
  { key: 'id_enlace', label: 'ID (llave de enlace)', requerido: true },
  { key: 'nombre', label: 'Nombre', requerido: true },
  { key: 'descripcion', label: 'Descripción' },
  { key: 'categoria', label: 'Categoría' },
  { key: 'instrumento', label: 'Instrumento' },
  { key: 'escala_territorial', label: 'Escala territorial' },
  { key: 'aplicacion_geografica', label: 'Aplicación geográfica' },
  { key: 'enlace_responsable', label: 'Enlace responsable' },
  { key: 'prioridad', label: 'Prioridad' },
  { key: 'estatus', label: 'Estatus' },
  { key: 'fecha_inicio', label: 'Fecha inicio' },
  { key: 'fecha_final', label: 'Fecha final' },
  { key: 'comentarios', label: 'Comentarios' },
];

const PROPS_ITEM = [
  { key: 'id_enlace', label: 'ID', requerido: true },
  { key: 'id_padre', label: 'ID Padre (llave al contenedor)', requerido: true },
  { key: 'nombre', label: 'Nombre', requerido: true },
  { key: 'tipo', label: 'Tipo' },
  { key: 'estatus', label: 'Estatus' },
  { key: 'prioridad', label: 'Prioridad' },
  { key: 'responsable', label: 'Responsable' },
  { key: 'fecha_inicio', label: 'Fecha inicio' },
  { key: 'fecha_limite', label: 'Fecha límite' },
  { key: 'aplicacion_geografica', label: 'Aplicación geográfica' },
  { key: 'evidencia', label: 'Evidencia' },
  { key: 'riesgos', label: 'Riesgos' },
];

const PROPS_SUBITEM = [
  { key: 'id_enlace', label: 'ID' },
  { key: 'id_padre', label: 'ID Padre (llave a la acción)', requerido: true },
  { key: 'nombre', label: 'Nombre', requerido: true },
  { key: 'estatus', label: 'Estatus' },
  { key: 'prioridad', label: 'Prioridad' },
  { key: 'responsable', label: 'Responsable' },
  { key: 'fecha_inicio', label: 'Fecha inicio' },
  { key: 'fecha_limite', label: 'Fecha límite' },
];

const PROPS_POR_NIVEL = {
  etapa: PROPS_CONTENEDOR,
  accion: PROPS_ITEM,
  subaccion: PROPS_SUBITEM,
};

const ESTILOS_NIVEL = {
  etapa: { card: 'border-blue-200 bg-blue-50/50', badge: 'bg-blue-100', icon: 'text-blue-600' },
  accion: { card: 'border-amber-200 bg-amber-50/50', badge: 'bg-amber-100', icon: 'text-amber-600' },
  subaccion: { card: 'border-purple-200 bg-purple-50/50', badge: 'bg-purple-100', icon: 'text-purple-600' },
};

const ICONOS_NIVEL = { etapa: Layers, accion: Zap, subaccion: ListChecks };

// ─── Normalización para auto-sugerencia ────────────────────────
function normalizar(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quitar acentos
    .replace(/[()[\]{}]/g, '') // quitar paréntesis
    .replace(/[_\-./]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function calcularSimilitud(a, b) {
  const na = normalizar(a);
  const nb = normalizar(b);
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.8;
  // Palabras en común
  const wa = new Set(na.split(' '));
  const wb = new Set(nb.split(' '));
  const inter = [...wa].filter(x => wb.has(x)).length;
  return inter / Math.max(wa.size, wb.size);
}

function autoSugerirMapeo(headers, props) {
  const mapeo = {}; // key de prop → índice de header
  const usados = new Set();

  // Primera pasada: coincidencias fuertes
  for (const prop of props) {
    let mejorScore = 0;
    let mejorIdx = -1;
    for (let i = 0; i < headers.length; i++) {
      if (usados.has(i)) continue;
      const score = calcularSimilitud(headers[i], prop.label) * 0.5 + calcularSimilitud(headers[i], prop.key) * 0.5;
      if (score > mejorScore) { mejorScore = score; mejorIdx = i; }
    }
    if (mejorScore >= 0.5 && mejorIdx !== -1) {
      mapeo[prop.key] = mejorIdx;
      usados.add(mejorIdx);
    }
  }
  return mapeo;
}

// ─── Componente principal ──────────────────────────────────────
export default function PasoMultiHoja({ fileId, multiHoja, proyectoId, onImportado, onCerrar }) {
  const [config, setConfig] = useState(() => {
    // Inicializar con auto-mapeo
    const hojas = multiHoja.hojas.map(hoja => {
      const props = PROPS_POR_NIVEL[hoja.nivel] || PROPS_CONTENEDOR;
      const mapeoAuto = autoSugerirMapeo(hoja.headers, props);
      // Pre-asignar ID y Ref si ya estaban detectados
      if (hoja.idCol !== undefined && !mapeoAuto.id_enlace) mapeoAuto.id_enlace = hoja.idCol;
      if (hoja.nombreCol !== undefined && !mapeoAuto.nombre) mapeoAuto.nombre = hoja.nombreCol;
      if (hoja.refCol !== undefined && !mapeoAuto.id_padre) mapeoAuto.id_padre = hoja.refCol;
      return { ...hoja, mapeo: mapeoAuto };
    });
    return { ...multiHoja, hojas };
  });
  const [paso, setPaso] = useState('mapeo'); // mapeo | preview | importando | exito
  const [preview, setPreview] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);
  const [resultado, setResultado] = useState(null);

  // Actualizar mapeo de una hoja
  function actualizarMapeo(hojaIdx, propKey, colIdx) {
    setConfig(prev => {
      const nuevasHojas = [...prev.hojas];
      const nuevoMapeo = { ...nuevasHojas[hojaIdx].mapeo };
      if (colIdx === '' || colIdx === '-1') {
        delete nuevoMapeo[propKey];
      } else {
        nuevoMapeo[propKey] = parseInt(colIdx);
      }
      nuevasHojas[hojaIdx] = { ...nuevasHojas[hojaIdx], mapeo: nuevoMapeo };
      return { ...prev, hojas: nuevasHojas };
    });
  }

  // Validar mapeo mínimo
  function validarMapeo() {
    for (const hoja of config.hojas) {
      const props = PROPS_POR_NIVEL[hoja.nivel] || [];
      const requeridos = props.filter(p => p.requerido);
      for (const r of requeridos) {
        if (hoja.mapeo[r.key] === undefined || hoja.mapeo[r.key] === -1) {
          return `Hoja "${hoja.nombre}": falta mapear "${r.label}" (requerido).`;
        }
      }
    }
    return null;
  }

  async function cargarPreview() {
    const err = validarMapeo();
    if (err) { setError(err); return; }
    setCargando(true);
    setError(null);
    try {
      const res = await importarApi.previewMultiHoja({ fileId, configMultiHoja: config, proyectoId });
      setPreview(res.datos);
      setPaso('preview');
    } catch (e) {
      setError(e.response?.data?.mensaje || 'Error generando preview.');
    } finally { setCargando(false); }
  }

  async function ejecutarImportacion() {
    setPaso('importando');
    setError(null);
    try {
      const res = await importarApi.confirmarMultiHoja({ fileId, configMultiHoja: config, proyectoId });
      setResultado(res.datos);
      setPaso('exito');
    } catch (e) {
      setError(e.response?.data?.mensaje || 'Error durante la importación.');
      setPaso('preview');
    }
  }

  // ─── MAPEO: tabla de asignación de columnas ────────────────
  if (paso === 'mapeo') {
    return (
      <div className="space-y-5">
        <div>
          <h3 className="text-sm font-semibold text-gray-700">Mapeo de columnas</h3>
          <p className="text-xs text-gray-500 mt-1">
            Asigna cada columna del Excel a la propiedad destino. Las columnas sin mapear se ignoran.
          </p>
        </div>

        {config.hojas.map((hoja, hojaIdx) => {
          const Icono = ICONOS_NIVEL[hoja.nivel];
          const estilos = ESTILOS_NIVEL[hoja.nivel];
          const props = PROPS_POR_NIVEL[hoja.nivel] || [];

          return (
            <div key={hojaIdx} className={`border-2 ${estilos.card} rounded-lg p-4`}>
              <div className="flex items-center gap-2 mb-3">
                <div className={`w-7 h-7 rounded-lg ${estilos.badge} flex items-center justify-center`}>
                  <Icono size={14} className={estilos.icon} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">
                    Hoja {hojaIdx + 1}: "{hoja.nombre}" — {hoja.nivel === 'etapa' ? 'Contenedor' : hoja.nivel === 'accion' ? 'Ítems' : 'Sub-ítems'}
                  </p>
                  <p className="text-[11px] text-gray-500">{hoja.totalFilas} filas · {hoja.headers.length} columnas</p>
                </div>
              </div>

              {/* Tabla de mapeo */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
                {props.map(prop => (
                  <div key={prop.key} className="flex items-center gap-2">
                    <label className={`text-[11px] w-[140px] shrink-0 truncate ${prop.requerido ? 'font-semibold text-gray-700' : 'text-gray-500'}`}>
                      {prop.label}{prop.requerido ? ' *' : ''}
                    </label>
                    <ArrowRight size={10} className="text-gray-300 shrink-0" />
                    <select
                      value={hoja.mapeo[prop.key] ?? '-1'}
                      onChange={e => actualizarMapeo(hojaIdx, prop.key, e.target.value)}
                      className={`input-base text-[11px] py-0.5 flex-1 ${hoja.mapeo[prop.key] !== undefined ? 'border-green-300 bg-green-50' : ''}`}
                    >
                      <option value="-1">— sin asignar —</option>
                      {hoja.headers.map((h, hi) => (
                        <option key={hi} value={hi}>{h || `Col ${hi + 1}`}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              {/* Mini preview de datos */}
              {hoja.sample && hoja.sample.length > 0 && (
                <details className="mt-2">
                  <summary className="text-[10px] text-gray-400 cursor-pointer hover:text-gray-600">
                    Ver muestra de datos ({hoja.sample.length} filas)
                  </summary>
                  <div className="mt-1 overflow-x-auto">
                    <table className="text-[10px] text-gray-600 border-collapse w-full">
                      <thead>
                        <tr>
                          {hoja.headers.slice(0, 8).map((h, hi) => (
                            <th key={hi} className="px-1 py-0.5 bg-gray-100 border border-gray-200 text-left font-medium truncate max-w-[80px]">
                              {h || `Col ${hi + 1}`}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {hoja.sample.slice(0, 3).map((fila, fi) => (
                          <tr key={fi}>
                            {fila.slice(0, 8).map((celda, ci) => (
                              <td key={ci} className="px-1 py-0.5 border border-gray-200 truncate max-w-[80px]">{String(celda || '')}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              )}
            </div>
          );
        })}

        {error && (
          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
            <AlertTriangle size={16} className="text-red-500 mt-0.5 shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onCerrar} className="btn-secondary text-sm">Cancelar</button>
          <button
            onClick={cargarPreview}
            disabled={cargando}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {cargando ? <Loader2 size={14} className="animate-spin" /> : <ChevronRight size={14} />}
            Generar preview
          </button>
        </div>
      </div>
    );
  }

  // ─── PREVIEW: árbol jerárquico ─────────────────────────────
  if (paso === 'preview') {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-700">Vista previa de importación</h3>
          <p className="text-xs text-gray-500 mt-1">Revisa la estructura que se creará en el proyecto.</p>
        </div>

        <div className="flex gap-4 text-sm flex-wrap">
          <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded font-medium">
            {preview.conteo.etapas} etapa(s)
          </span>
          <span className="px-2 py-1 bg-amber-50 text-amber-700 rounded font-medium">
            {preview.conteo.acciones} acción(es)
          </span>
          {preview.conteo.subacciones > 0 && (
            <span className="px-2 py-1 bg-purple-50 text-purple-700 rounded font-medium">
              {preview.conteo.subacciones} tarea(s)
            </span>
          )}
        </div>

        {preview.warnings && preview.warnings.length > 0 && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg max-h-32 overflow-y-auto">
            <p className="text-xs font-medium text-amber-700 mb-1">
              {preview.warnings.length} advertencia(s):
            </p>
            {preview.warnings.slice(0, 10).map((w, i) => (
              <p key={i} className="text-[10px] text-amber-600">
                [{w.hoja || 'Hoja'}:{w.fila}] {w.mensaje}
              </p>
            ))}
            {preview.warnings.length > 10 && (
              <p className="text-[10px] text-amber-500 italic">…y {preview.warnings.length - 10} más</p>
            )}
          </div>
        )}

        <div className="border border-gray-200 rounded-lg max-h-[360px] overflow-y-auto p-3 space-y-1">
          {preview.arbol.map((etapa, ei) => (
            <NodoArbol key={ei} etapa={etapa} />
          ))}
          {preview.arbol.length === 0 && (
            <p className="text-xs text-gray-400 italic text-center py-4">No se detectaron registros válidos.</p>
          )}
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
            <AlertTriangle size={16} className="text-red-500 mt-0.5 shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <div className="flex justify-between pt-2">
          <button onClick={() => setPaso('mapeo')} className="btn-secondary text-sm">← Ajustar mapeo</button>
          <button
            onClick={ejecutarImportacion}
            disabled={preview.arbol.length === 0}
            className="px-4 py-2 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 disabled:opacity-50 font-medium"
          >
            Confirmar importación
          </button>
        </div>
      </div>
    );
  }

  // ─── IMPORTANDO ────────────────────────────────────────────
  if (paso === 'importando') {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <Loader2 size={32} className="animate-spin text-blue-500" />
        <p className="text-sm text-gray-600">Importando estructura…</p>
        <p className="text-xs text-gray-400">Esto puede tomar unos segundos.</p>
      </div>
    );
  }

  // ─── ÉXITO ─────────────────────────────────────────────────
  if (paso === 'exito') {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-4">
        <CheckCircle2 size={48} className="text-green-500" />
        <h3 className="text-lg font-semibold text-gray-800">Importación completada</h3>
        <div className="text-sm text-gray-600 text-center space-y-1">
          {resultado.etapas_creadas > 0 && <p>{resultado.etapas_creadas} etapa(s) creada(s)</p>}
          {resultado.acciones_creadas > 0 && <p>{resultado.acciones_creadas} acción(es) creada(s)</p>}
          {resultado.subacciones_creadas > 0 && <p>{resultado.subacciones_creadas} tarea(s) creada(s)</p>}
        </div>
        <button
          onClick={() => { if (onImportado) onImportado(); else onCerrar(); }}
          className="mt-2 px-5 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 font-medium"
        >
          Cerrar
        </button>
      </div>
    );
  }

  return null;
}

// ─── Sub-componentes del árbol ─────────────────────────────────
function NodoArbol({ etapa }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <div>
      <button onClick={() => setAbierto(!abierto)} className="flex items-center gap-2 w-full text-left py-1 px-1 rounded hover:bg-gray-50">
        {etapa.acciones?.length > 0 ? (
          abierto ? <ChevronDown size={12} className="text-gray-400" /> : <ChevronRight size={12} className="text-gray-400" />
        ) : <span className="w-3" />}
        <Layers size={13} className="text-blue-500 shrink-0" />
        <span className="text-xs font-medium text-gray-800 truncate">{etapa.nombre}</span>
        {etapa.estatus && <span className="text-[9px] px-1 py-0.5 rounded bg-gray-100 text-gray-500">{etapa.estatus}</span>}
        <span className="text-[10px] text-gray-400 ml-auto shrink-0">{etapa.acciones?.length || 0} acc.</span>
      </button>
      {abierto && etapa.acciones?.length > 0 && (
        <div className="ml-5 pl-2 border-l border-gray-200 space-y-0.5">
          {etapa.acciones.map((acc, ai) => <NodoAccion key={ai} accion={acc} />)}
        </div>
      )}
    </div>
  );
}

function NodoAccion({ accion }) {
  const [abierto, setAbierto] = useState(false);
  const tieneTareas = accion.tareas && accion.tareas.length > 0;
  return (
    <div>
      <button onClick={() => tieneTareas && setAbierto(!abierto)} className="flex items-center gap-2 w-full text-left py-0.5 px-1 rounded hover:bg-gray-50">
        {tieneTareas ? (
          abierto ? <ChevronDown size={10} className="text-gray-400" /> : <ChevronRight size={10} className="text-gray-400" />
        ) : <span className="w-2.5" />}
        <Zap size={11} className="text-amber-500 shrink-0" />
        <span className="text-[11px] text-gray-700 truncate">{accion.nombre}</span>
        {accion.estatus && <span className="text-[9px] px-1 py-0.5 rounded bg-gray-100 text-gray-500">{accion.estatus}</span>}
        {tieneTareas && <span className="text-[9px] text-gray-400 ml-auto shrink-0">{accion.tareas.length} tar.</span>}
      </button>
      {abierto && tieneTareas && (
        <div className="ml-4 pl-2 border-l border-gray-100 space-y-0.5">
          {accion.tareas.map((tarea, ti) => (
            <div key={ti} className="flex items-center gap-2 py-0.5 px-1">
              <ListChecks size={10} className="text-purple-400 shrink-0" />
              <span className="text-[10px] text-gray-600 truncate">{tarea.nombre}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
