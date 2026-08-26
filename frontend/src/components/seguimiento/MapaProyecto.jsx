/**
 * ARCHIVO: MapaProyecto.jsx
 * PROPÓSITO: Mapa territorial acotado a UN proyecto (tab Seguimiento → Mapa).
 *            Reutiliza MapaDrillDown (el mismo componente del módulo
 *            Territorio) con datos y sidebar ligero propios del proyecto.
 *
 * MINI-CLASE: dos escalas, un mismo dibujo
 * ─────────────────────────────────────────────────────────────────
 * Un nodo se territorializa en Modo A (Estado + Municipios) o Modo B
 * (Zona Metropolitana) — son excluyentes, nunca los dos a la vez
 * (TerritorioSelector.jsx). Por eso este mapa tiene un selector de
 * escala igual al del módulo Territorio nacional (MapaTerritorial.jsx):
 * "Estados" dibuja por cve_ent con drill-down a municipios; "Zonas
 * metropolitanas" dibuja por id_zm, sin drill-down adicional (una ZM ya
 * es su propio polígono, no hace falta bajar a municipio). MapaDrillDown
 * es agnóstico a cuál escala está activa — solo necesita el geojson, la
 * intensidad y el nombre de la propiedad (cve_ent vs gid) correctos.
 * ─────────────────────────────────────────────────────────────────
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import L from 'leaflet';
import { MapPin, Layers, X, ChevronRight, ChevronLeft, Building2 } from 'lucide-react';
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

// Lista de nodos de un área activa (estado, ZM o municipio) — reusada en
// los tres paneles de detalle, que solo difieren en encabezado.
function ListaNodos({ nodos, onNavegarEtapas }) {
  return (
    <div className="space-y-1.5">
      {nodos.map(n => (
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
  );
}

export default function MapaProyecto({ proyectoId, onNavegarEtapas }) {
  const [geoJSON, setGeoJSON] = useState(null);
  const [zmGeoJSON, setZmGeoJSON] = useState(null);
  const [mapaData, setMapaData] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [escala, setEscala] = useState('estados'); // 'estados' | 'zm'
  const [hovered, setHovered] = useState(null);
  const [hoveredMuni, setHoveredMuni] = useState(null);
  const [estadoActivo, setEstadoActivo] = useState(null);
  const [municipiosGeoJSON, setMunicipiosGeoJSON] = useState(null);
  const [municipioActivo, setMunicipioActivo] = useState(null);
  const [zmActiva, setZmActiva] = useState(null);

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

  // El geojson de ZM es nacional (no cambia por proyecto) — se carga una
  // sola vez, la primera vez que se entra a esa escala.
  useEffect(() => {
    if (escala === 'zm' && !zmGeoJSON) {
      client.get('/geo/zm/geojson').then(res => setZmGeoJSON(res.data)).catch(console.error);
    }
  }, [escala, zmGeoJSON]);

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

  // Mismo patrón que nodosMap/estadoIntensidad, indexado por gid de ZM.
  const nodosMapZm = useMemo(() => {
    if (!mapaData?.por_zm) return {};
    return Object.fromEntries(mapaData.por_zm.map(z => [String(z.gid), z]));
  }, [mapaData]);

  const maxNodosZm = useMemo(() => {
    if (!mapaData?.por_zm?.length) return 1;
    return Math.max(1, ...mapaData.por_zm.map(z => z.nodos.length));
  }, [mapaData]);

  const totalNodosZm = useMemo(() => {
    if (!mapaData?.por_zm) return 0;
    return mapaData.por_zm.reduce((s, z) => s + z.nodos.length, 0);
  }, [mapaData]);

  const zmIntensidad = useCallback(
    (gid) => (nodosMapZm[gid] ? nodosMapZm[gid].nodos.length / maxNodosZm : 0),
    [nodosMapZm, maxNodosZm]
  );

  // Nodos del estado activo que tienen municipio(s) asignado(s), agrupados por
  // cvegeo (un nodo puede aparecer bajo varios municipios si tiene más de uno).
  const municipiosActividadMap = useMemo(() => {
    if (!estadoActivo) return {};
    const nodos = nodosMap[estadoActivo.cve_ent]?.nodos || [];
    const acc = {};
    for (const n of nodos) {
      for (const cvegeo of (n.cvegeos || [])) {
        if (!acc[cvegeo]) acc[cvegeo] = [];
        acc[cvegeo].push(n);
      }
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

  // Una ZM ya es su propio polígono (agrega varios municipios de uno o más
  // estados) — a diferencia de Estado, aquí no hay un nivel más abajo al
  // que hacer drill-down; el detalle es directo, igual que en el módulo
  // Territorio nacional (MapaTerritorial.jsx › cargarDetalleZM).
  function seleccionarZM(gid, nombre_zm, bounds) {
    const z = nodosMapZm[String(gid)];
    if (!z) return;
    setZmActiva({ gid: String(gid), nombre_zm, cve_met: z.cve_met, nodos: z.nodos, bounds });
  }

  function volverAProyecto() {
    setEstadoActivo(null);
    setMunicipiosGeoJSON(null);
    setMunicipioActivo(null);
    setZmActiva(null);
  }

  function volverAEstado() {
    setMunicipioActivo(null);
  }

  function cambiarEscala(nueva) {
    if (nueva === escala) return;
    setEscala(nueva);
    volverAProyecto();
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
  const zmConActividad = mapaData?.por_zm?.length || 0;

  if (estadosConActividad === 0 && zmConActividad === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-gray-400">
        <MapPin size={40} className="text-gray-200" />
        <p className="text-sm">Sin cobertura territorial registrada.</p>
        <p className="text-xs text-gray-400">
          Asigna un Estado o Zona Metropolitana a las etapas o acciones desde el panel de propiedades.
        </p>
        {onNavegarEtapas && (
          <button
            onClick={onNavegarEtapas}
            className="mt-1 text-xs px-3 py-1.5 bg-[#7B1C3E] text-white rounded-md hover:bg-[#611232] transition-colors"
          >
            Ir a Detalle
          </button>
        )}
      </div>
    );
  }

  const enZM = escala === 'zm';
  const areaActiva = enZM ? zmActiva : estadoActivo;

  return (
    <div className="space-y-3">
      {/* Métricas + escala + volver */}
      <div className="flex items-center gap-3 px-1 flex-wrap">
        {areaActiva ? (
          <button onClick={volverAProyecto} className="flex items-center gap-1 text-xs text-[#7B1C3E] font-medium hover:underline">
            <ChevronLeft size={13} /> Volver a vista del proyecto
          </button>
        ) : (
          <>
            <div className="flex items-center bg-gray-100 rounded-full p-0.5 text-[11px]">
              {[
                { id: 'estados', label: 'Estados' },
                { id: 'zm', label: 'Zonas metropolitanas' },
              ].map(o => (
                <button key={o.id} onClick={() => cambiarEscala(o.id)}
                  className={`px-2.5 py-1 rounded-full font-medium transition-colors ${escala === o.id ? 'bg-[#7B1C3E] text-white' : 'text-gray-500 hover:text-gray-700'}`}>
                  {o.label}
                </button>
              ))}
            </div>
            <div className="h-4 w-px bg-gray-200" />
            {enZM ? (
              <div className="flex items-center gap-1.5">
                <Building2 size={12} className="text-gray-400" />
                <span className="text-xs text-gray-600">
                  <strong>{zmConActividad}</strong> zona{zmConActividad !== 1 ? 's' : ''} metropolitana{zmConActividad !== 1 ? 's' : ''}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: GUINDA }} />
                <span className="text-xs text-gray-600">
                  <strong>{estadosConActividad}</strong> estado{estadosConActividad !== 1 ? 's' : ''}
                </span>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <Layers size={12} className="text-gray-400" />
              <span className="text-xs text-gray-600">
                <strong>{enZM ? totalNodosZm : totalNodos}</strong> nodo{(enZM ? totalNodosZm : totalNodos) !== 1 ? 's' : ''} con territorio
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
        {(enZM ? zmGeoJSON : geoJSON) && (
          <MapaDrillDown
            estadosGeoJSON={enZM ? zmGeoJSON : geoJSON}
            propEstado={enZM ? 'gid' : 'cve_ent'}
            estadoActivo={
              enZM
                ? (zmActiva ? { cve_ent: zmActiva.gid, bounds: zmActiva.bounds } : null)
                : (estadoActivo ? { cve_ent: estadoActivo.cve_ent, bounds: estadoActivo.bounds } : null)
            }
            estadoIntensidad={enZM ? zmIntensidad : estadoIntensidad}
            onClickEstado={(clave, nombre, layer) =>
              enZM ? seleccionarZM(clave, nombre, layer.getBounds()) : seleccionarEstado(clave, nombre, layer.getBounds())
            }
            onHoverEstado={(data) => {
              if (!data) { setHovered(null); return; }
              const nodos = enZM ? (nodosMapZm[data.cve_ent]?.nodos || []) : (nodosMap[data.cve_ent]?.nodos || []);
              setHovered({ nombre: data.nombre, nodos, x: data.x, y: data.y });
            }}
            municipiosGeoJSON={enZM ? null : municipiosGeoJSON}
            municipiosActivos={enZM ? undefined : municipiosActivosSet}
            onClickMunicipio={enZM ? undefined : clickMunicipio}
            onHoverMunicipio={enZM ? undefined : (data) => {
              if (!data) { setHoveredMuni(null); return; }
              setHoveredMuni({ ...data, nodos: municipiosActividadMap[data.cvegeo] || [] });
            }}
          />
        )}

        {/* Tooltip estado / ZM */}
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

        {/* Tooltip municipio (solo escala Estados) */}
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
          {municipiosGeoJSON && !enZM && (
            <div className="flex items-center gap-1 mt-1 pt-1 border-t border-gray-100">
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: GUINDA, opacity: 0.7 }} />
              <span className="text-gray-400">municipio con actividad</span>
            </div>
          )}
        </div>
      </div>

      {/* Panel de detalle: municipio > estado > grid nacional  (escala Estados)
          ó  zona metropolitana > grid de ZM  (escala Zonas metropolitanas) */}
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
          <ListaNodos nodos={municipioActivo.nodos} onNavegarEtapas={onNavegarEtapas} />
        </div>
      ) : enZM && zmActiva ? (
        <div className="border border-[#7B1C3E]/20 rounded-xl bg-white p-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <span className="text-[10px] font-bold tracking-widest text-[#a8864b] uppercase block mb-0.5">Zona Metropolitana</span>
              <h3 className="text-sm font-bold text-[#7B1C3E]">{zmActiva.nombre_zm}</h3>
              {zmActiva.cve_met && <span className="text-[10px] text-gray-400 font-mono">CVE_MET: {zmActiva.cve_met}</span>}
            </div>
            <button onClick={() => setZmActiva(null)}
              className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
              <X size={14} />
            </button>
          </div>
          <p className="text-[11px] text-gray-500 mb-2">
            {zmActiva.nodos.length} nodo{zmActiva.nodos.length !== 1 ? 's' : ''} de este proyecto en esta zona metropolitana
          </p>
          <ListaNodos nodos={zmActiva.nodos} onNavegarEtapas={onNavegarEtapas} />
        </div>
      ) : !enZM && estadoActivo ? (
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
          <ListaNodos nodos={estadoActivo.nodos} onNavegarEtapas={onNavegarEtapas} />
        </div>
      ) : enZM ? (
        /* Grid de zonas metropolitanas (cuando nada está seleccionado) */
        zmConActividad === 0 ? (
          <p className="text-xs text-gray-400 italic text-center py-6">
            Este proyecto no tiene territorio capturado por Zona Metropolitana. Prueba la vista de Estados.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {mapaData.por_zm.map(z => (
              <div key={z.gid}
                onClick={() => {
                  const feature = zmGeoJSON?.features.find(f => String(f.properties.gid) === String(z.gid));
                  const bounds = feature ? L.geoJSON(feature).getBounds() : null;
                  seleccionarZM(z.gid, z.nombre_zm, bounds);
                }}
                className="border border-gray-100 rounded-lg p-2.5 bg-white hover:border-[#7B1C3E]/30 cursor-pointer transition-colors">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-gray-800 truncate">{z.nombre_zm}</span>
                  <span className="text-[11px] text-[#7B1C3E] font-bold ml-2 flex-shrink-0">{z.nodos.length}</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {z.nodos.slice(0, 3).map(n => (
                    <span key={n.id} className="flex items-center gap-0.5 text-[10px] bg-gray-50 px-1.5 py-0.5 rounded-full" title={n.nombre}>
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: SEM_COLORS[n.semaforo || 'gris'] }} />
                      <span className="truncate max-w-[90px]">{n.nombre}</span>
                    </span>
                  ))}
                  {z.nodos.length > 3 && <span className="text-[10px] text-gray-400 px-1 py-0.5">+{z.nodos.length - 3}</span>}
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        /* Grid de estados (cuando nada está seleccionado) */
        estadosConActividad === 0 ? (
          <p className="text-xs text-gray-400 italic text-center py-6">
            Este proyecto no tiene territorio capturado por Estado. Prueba la vista de Zonas metropolitanas.
          </p>
        ) : (
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
        )
      )}
    </div>
  );
}
