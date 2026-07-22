/**
 * ARCHIVO: MapaProyecto.jsx
 * PROPÓSITO: Mapa territorial acotado a UN proyecto (tab Seguimiento → Mapa).
 *            Reutiliza MapaDrillDown (el mismo componente del módulo
 *            Territorio) con datos y sidebar ligero propios del proyecto.
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import L from 'leaflet';
import { MapPin, Layers, X, ChevronRight, ChevronLeft } from 'lucide-react';
import client from '../../api/client';
import MapaDrillDown from '../mapa/MapaDrillDown';
import 'leaflet/dist/leaflet.css';

const GUINDA = '#7B1C3E';
const SEM_COLORS = { verde: '#22c55e', ambar: '#f59e0b', rojo: '#ef4444', gris: '#9ca3af' };
const TIPO_LABEL = { etapa: 'Etapa', accion: 'Acción', tarea: 'Tarea' };
const TIPO_COLOR = { etapa: 'text-indigo-500 bg-indigo-50', accion: 'text-blue-500 bg-blue-50', tarea: 'text-teal-600 bg-teal-50' };

function TipoBadge({ tipo }) {
  return (
    <span className={`text-[9px] font-semibold uppercase tracking-wide px-1 py-0.5 rounded flex-shrink-0 ${TIPO_COLOR[tipo] || 'text-gray-500 bg-gray-100'}`}>
      {TIPO_LABEL[tipo] || tipo}
    </span>
  );
}

export default function MapaProyecto({ proyectoId, onNavegarEtapas }) {
  const [geoJSON, setGeoJSON] = useState(null);
  const [mapaData, setMapaData] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [hovered, setHovered] = useState(null);
  const [hoveredMuni, setHoveredMuni] = useState(null);
  const [estadoActivo, setEstadoActivo] = useState(null);
  const [municipiosGeoJSON, setMunicipiosGeoJSON] = useState(null);
  const [municipioActivo, setMunicipioActivo] = useState(null);

  useEffect(() => {
    if (!proyectoId) return;
    setCargando(true);
    Promise.all([
      client.get('/geo/estados/geojson'),
      client.get(`/proyectos/${proyectoId}/mapa-territorial`),
    ])
      .then(([geoRes, mapaRes]) => {
        setGeoJSON(geoRes.data);
        setMapaData(mapaRes.data.datos || mapaRes.data);
      })
      .catch(console.error)
      .finally(() => setCargando(false));
  }, [proyectoId]);

  const nodosMap = useMemo(() => {
    if (!mapaData?.por_estado) return {};
    return Object.fromEntries(mapaData.por_estado.map(e => [e.cve_ent, e]));
  }, [mapaData]);

  const maxNodos = useMemo(() => {
    if (!mapaData?.por_estado?.length) return 1;
    return Math.max(1, ...mapaData.por_estado.map(e => e.nodos.length));
  }, [mapaData]);

  const totalNodos = useMemo(() => {
    if (!mapaData?.por_estado) return 0;
    return mapaData.por_estado.reduce((s, e) => s + e.nodos.length, 0);
  }, [mapaData]);

  const estadoIntensidad = useCallback(
    (cve) => (nodosMap[cve] ? nodosMap[cve].nodos.length / maxNodos : 0),
    [nodosMap, maxNodos]
  );

  // Nodos del estado activo que tienen municipio asignado, agrupados por cvegeo
  // (el propio payload de mapa-territorial ya trae el cvegeo por nodo).
  const municipiosActividadMap = useMemo(() => {
    if (!estadoActivo) return {};
    const nodos = nodosMap[estadoActivo.cve_ent]?.nodos || [];
    const acc = {};
    for (const n of nodos) {
      if (!n.cvegeo) continue;
      if (!acc[n.cvegeo]) acc[n.cvegeo] = [];
      acc[n.cvegeo].push(n);
    }
    return acc;
  }, [estadoActivo, nodosMap]);
  const municipiosActivosSet = useMemo(
    () => new Set(Object.keys(municipiosActividadMap)),
    [municipiosActividadMap]
  );

  async function seleccionarEstado(cve_ent, nombre_estado, bounds) {
    const est = nodosMap[cve_ent];
    if (!est) return;
    setEstadoActivo({ cve_ent, nombre_estado, nodos: est.nodos, bounds, clave_inegi: cve_ent });
    setMunicipioActivo(null);
    setMunicipiosGeoJSON(null);
    try {
      const res = await client.get('/geo/municipios/geojson', { params: { cve_ent } });
      setMunicipiosGeoJSON(res.data);
    } catch (e) { console.error('Error cargando municipios:', e); }
  }

  function volverAProyecto() {
    setEstadoActivo(null);
    setMunicipiosGeoJSON(null);
    setMunicipioActivo(null);
  }

  function volverAEstado() {
    setMunicipioActivo(null);
  }

  function clickMunicipio(cvegeo, nombre, layer, activo) {
    if (!activo) return;
    setMunicipioActivo({ cvegeo, nombre, nodos: municipiosActividadMap[cvegeo] || [] });
  }

  if (cargando) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-gray-400">
        <div className="animate-spin w-5 h-5 border-2 border-[#7B1C3E] border-t-transparent rounded-full mr-2" />
        Cargando mapa territorial…
      </div>
    );
  }

  const estadosConActividad = mapaData?.por_estado?.length || 0;

  if (estadosConActividad === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-gray-400">
        <MapPin size={40} className="text-gray-200" />
        <p className="text-sm">Sin cobertura territorial registrada.</p>
        <p className="text-xs text-gray-400">
          Asigna un Estado a las etapas o acciones desde el panel de propiedades.
        </p>
        {onNavegarEtapas && (
          <button
            onClick={onNavegarEtapas}
            className="mt-1 text-xs px-3 py-1.5 bg-[#7B1C3E] text-white rounded-md hover:bg-[#611232] transition-colors"
          >
            Ir a Etapas y avances
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Métricas + volver */}
      <div className="flex items-center gap-5 px-1 flex-wrap">
        {estadoActivo ? (
          <button onClick={volverAProyecto} className="flex items-center gap-1 text-xs text-[#7B1C3E] font-medium hover:underline">
            <ChevronLeft size={13} /> Volver a vista del proyecto
          </button>
        ) : (
          <>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: GUINDA }} />
              <span className="text-xs text-gray-600">
                <strong>{estadosConActividad}</strong> estado{estadosConActividad !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Layers size={12} className="text-gray-400" />
              <span className="text-xs text-gray-600">
                <strong>{totalNodos}</strong> nodo{totalNodos !== 1 ? 's' : ''} con territorio
              </span>
            </div>
          </>
        )}
        {onNavegarEtapas && (
          <button onClick={onNavegarEtapas} className="ml-auto text-xs text-[#7B1C3E] hover:underline">
            Ver en Etapas →
          </button>
        )}
      </div>

      {/* Mapa */}
      <div className="relative border border-gray-200 rounded-lg overflow-hidden" style={{ height: 440 }}>
        {geoJSON && (
          <MapaDrillDown
            estadosGeoJSON={geoJSON}
            estadoActivo={estadoActivo ? { cve_ent: estadoActivo.cve_ent, bounds: estadoActivo.bounds } : null}
            estadoIntensidad={estadoIntensidad}
            onClickEstado={(cve, nombre, layer) => seleccionarEstado(cve, nombre, layer.getBounds())}
            onHoverEstado={(data) => {
              if (!data) { setHovered(null); return; }
              setHovered({ nombre: data.nombre, nodos: nodosMap[data.cve_ent]?.nodos || [], x: data.x, y: data.y });
            }}
            municipiosGeoJSON={municipiosGeoJSON}
            municipiosActivos={municipiosActivosSet}
            onClickMunicipio={clickMunicipio}
            onHoverMunicipio={(data) => {
              if (!data) { setHoveredMuni(null); return; }
              setHoveredMuni({ ...data, nodos: municipiosActividadMap[data.cvegeo] || [] });
            }}
          />
        )}

        {/* Tooltip estado */}
        {hovered && (
          <div className="fixed z-[9999] bg-white border border-gray-200 rounded-lg shadow-lg p-3 w-72 pointer-events-none"
            style={{ left: Math.min(hovered.x + 14, window.innerWidth - 300), top: Math.min(hovered.y + 14, window.innerHeight - 220) }}>
            <p className="text-xs font-bold text-[#7B1C3E] mb-1.5">{hovered.nombre}</p>
            {hovered.nodos.length === 0 ? (
              <p className="text-xs text-gray-400 italic">Sin actividad registrada</p>
            ) : (
              <ul className="space-y-1.5 max-h-40 overflow-y-auto">
                {hovered.nodos.slice(0, 8).map(n => (
                  <li key={n.id} className="flex items-start gap-1.5 text-[11px]">
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1" style={{ backgroundColor: SEM_COLORS[n.semaforo || 'gris'] }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <TipoBadge tipo={n.tipo} />
                        <span className="truncate text-gray-700">{n.nombre}</span>
                      </div>
                      {n.nombre_padre && <p className="text-[10px] text-gray-400 italic truncate">de {n.nombre_padre}</p>}
                    </div>
                    <span className="text-gray-400 tabular-nums flex-shrink-0">{Math.round(n.avance)}%</span>
                  </li>
                ))}
                {hovered.nodos.length > 8 && (
                  <li className="text-[10px] text-gray-400 text-center pt-0.5">+{hovered.nodos.length - 8} más…</li>
                )}
              </ul>
            )}
          </div>
        )}

        {/* Tooltip municipio */}
        {hoveredMuni && hoveredMuni.activo && (
          <div className="fixed z-[9999] bg-white border border-gray-200 rounded-lg shadow-lg p-3 w-64 pointer-events-none"
            style={{ left: Math.min(hoveredMuni.x + 14, window.innerWidth - 260), top: Math.min(hoveredMuni.y + 14, window.innerHeight - 220) }}>
            <p className="text-xs font-bold text-[#7B1C3E] mb-1">{hoveredMuni.nombre}</p>
            <ul className="space-y-1.5 max-h-32 overflow-y-auto">
              {hoveredMuni.nodos.slice(0, 5).map(n => (
                <li key={n.id} className="flex items-start gap-1.5 text-[11px]">
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1" style={{ backgroundColor: SEM_COLORS[n.semaforo || 'gris'] }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <TipoBadge tipo={n.tipo} />
                      <span className="truncate text-gray-700">{n.nombre}</span>
                    </div>
                    {n.nombre_padre && <p className="text-[10px] text-gray-400 italic truncate">de {n.nombre_padre}</p>}
                  </div>
                  <span className="text-gray-400 tabular-nums flex-shrink-0">{Math.round(n.avance)}%</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Leyenda */}
        <div className="absolute bottom-3 left-3 z-[1000] bg-white/90 backdrop-blur-sm rounded-md px-2.5 py-1.5 border border-gray-200 text-[10px]">
          <p className="font-semibold text-gray-600 mb-1">Actividad</p>
          <div className="flex items-center gap-1">
            {[0.2, 0.4, 0.6, 0.75].map((op, i) => (
              <div key={i} className="w-4 h-3 rounded-sm" style={{ backgroundColor: GUINDA, opacity: op }} />
            ))}
            <span className="ml-1 text-gray-400">baja → alta</span>
          </div>
          {municipiosGeoJSON && (
            <div className="flex items-center gap-1 mt-1 pt-1 border-t border-gray-100">
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: GUINDA, opacity: 0.7 }} />
              <span className="text-gray-400">municipio con actividad</span>
            </div>
          )}
        </div>
      </div>

      {/* Panel de detalle: municipio > estado > grid nacional */}
      {municipioActivo ? (
        <div className="border border-[#7B1C3E]/20 rounded-xl bg-white p-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <button onClick={volverAEstado} className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-[#7B1C3E] mb-1">
                <ChevronLeft size={11} /> Volver a {estadoActivo.nombre_estado}
              </button>
              <span className="text-[10px] font-bold tracking-widest text-[#a8864b] uppercase block mb-0.5">Municipio</span>
              <h3 className="text-sm font-bold text-[#7B1C3E]">{municipioActivo.nombre}</h3>
              <span className="text-[10px] text-gray-400 font-mono">CVEGEO: {municipioActivo.cvegeo}</span>
            </div>
            <button onClick={() => setMunicipioActivo(null)} className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
              <X size={14} />
            </button>
          </div>
          <p className="text-[11px] text-gray-500 mb-2">
            {municipioActivo.nodos.length} nodo{municipioActivo.nodos.length !== 1 ? 's' : ''} de este proyecto en este municipio
          </p>
          <div className="space-y-1.5">
            {municipioActivo.nodos.map(n => (
              <button key={n.id} onClick={onNavegarEtapas}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-[#fbf3f6] transition-colors text-left group">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: SEM_COLORS[n.semaforo || 'gris'] }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <TipoBadge tipo={n.tipo} />
                    <span className="text-xs font-medium text-gray-800 group-hover:text-[#7B1C3E] truncate">{n.nombre}</span>
                  </div>
                  {n.nombre_padre && <span className="text-[10px] text-gray-400 italic truncate block">de {n.nombre_padre}</span>}
                </div>
                <span className="text-[11px] text-gray-500 tabular-nums flex-shrink-0">{Math.round(n.avance)}%</span>
                <ChevronRight size={12} className="text-gray-300 group-hover:text-[#7B1C3E] flex-shrink-0" />
              </button>
            ))}
          </div>
        </div>
      ) : estadoActivo ? (
        <div className="border border-[#7B1C3E]/20 rounded-xl bg-white p-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <span className="text-[10px] font-bold tracking-widest text-[#a8864b] uppercase block mb-0.5">Estado</span>
              <h3 className="text-sm font-bold text-[#7B1C3E]">{estadoActivo.nombre_estado}</h3>
              <span className="text-[10px] text-gray-400 font-mono">Clave INEGI: {estadoActivo.clave_inegi}</span>
            </div>
            <button onClick={() => setEstadoActivo(null)}
              className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
              <X size={14} />
            </button>
          </div>
          <p className="text-[11px] text-gray-500 mb-2">
            {estadoActivo.nodos.length} nodo{estadoActivo.nodos.length !== 1 ? 's' : ''} de este proyecto en este estado
            {Object.keys(municipiosActividadMap).length > 0 && ' · haz clic en un municipio en guinda para ver el detalle'}
          </p>
          <div className="space-y-1.5">
            {estadoActivo.nodos.map(n => (
              <button key={n.id} onClick={onNavegarEtapas}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-[#fbf3f6] transition-colors text-left group">
                <span className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: SEM_COLORS[n.semaforo || 'gris'] }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <TipoBadge tipo={n.tipo} />
                    <span className="text-xs font-medium text-gray-800 group-hover:text-[#7B1C3E] truncate">{n.nombre}</span>
                  </div>
                  {n.nombre_padre && <span className="text-[10px] text-gray-400 italic truncate block">de {n.nombre_padre}</span>}
                </div>
                <span className="text-[11px] text-gray-500 tabular-nums flex-shrink-0">{Math.round(n.avance)}%</span>
                <ChevronRight size={12} className="text-gray-300 group-hover:text-[#7B1C3E] flex-shrink-0" />
              </button>
            ))}
          </div>
        </div>
      ) : (
        /* Grid de estados (cuando nada está seleccionado) */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {mapaData.por_estado.map(est => (
            <div key={est.cve_ent}
              onClick={() => {
                const feature = geoJSON?.features.find(f => f.properties.cve_ent === est.cve_ent);
                const bounds = feature ? L.geoJSON(feature).getBounds() : null;
                seleccionarEstado(est.cve_ent, est.nombre_estado, bounds);
              }}
              className="border border-gray-100 rounded-lg p-2.5 bg-white hover:border-[#7B1C3E]/30 cursor-pointer transition-colors">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-gray-800 truncate">{est.nombre_estado}</span>
                <span className="text-[11px] text-[#7B1C3E] font-bold ml-2 flex-shrink-0">{est.nodos.length}</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {est.nodos.slice(0, 3).map(n => (
                  <span key={n.id} className="flex items-center gap-0.5 text-[10px] bg-gray-50 px-1.5 py-0.5 rounded-full" title={n.nombre}>
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: SEM_COLORS[n.semaforo || 'gris'] }} />
                    <span className="truncate max-w-[90px]">{n.nombre}</span>
                  </span>
                ))}
                {est.nodos.length > 3 && <span className="text-[10px] text-gray-400 px-1 py-0.5">+{est.nodos.length - 3}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
