/**
 * ARCHIVO: MapaTerritorialInicio.jsx
 * PROPÓSITO: Mapa de incidencia territorial del dashboard Inicio, personalizado
 *            a los proyectos del usuario. Mismo componente y patrón de
 *            drill-down (Estado → Municipios) que Seguimiento → Mapa, pero
 *            agregando TODOS los proyectos del usuario en vez de uno solo.
 *            Panel ligero (no el sidebar rico del módulo Territorio).
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import L from 'leaflet';
import { Link } from 'react-router-dom';
import { MapPin, X, ChevronRight, ChevronLeft } from 'lucide-react';
import client from '../../api/client';
import MapaDrillDown from '../mapa/MapaDrillDown';
import 'leaflet/dist/leaflet.css';

const GUINDA = '#7B1C3E';
const SEM = { verde: '#22c55e', ambar: '#f59e0b', rojo: '#ef4444', gris: '#9ca3af' };
const TIPO_LABEL = { etapa: 'Etapa', accion: 'Acción', tarea: 'Tarea' };
const TIPO_COLOR = { etapa: 'text-indigo-500 bg-indigo-50', accion: 'text-blue-500 bg-blue-50', tarea: 'text-teal-600 bg-teal-50' };

function TipoBadge({ tipo }) {
  return (
    <span className={`text-[9px] font-semibold uppercase tracking-wide px-1 py-0.5 rounded flex-shrink-0 ${TIPO_COLOR[tipo] || 'text-gray-500 bg-gray-100'}`}>
      {TIPO_LABEL[tipo] || tipo}
    </span>
  );
}

export default function MapaTerritorialInicio() {
  const [geoJSON, setGeoJSON] = useState(null);
  const [mapaData, setMapaData] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [hovered, setHovered] = useState(null);
  const [hoveredMuni, setHoveredMuni] = useState(null);

  const [estadoActivo, setEstadoActivo] = useState(null);
  const [detalleEstado, setDetalleEstado] = useState(null);
  const [municipiosGeoJSON, setMunicipiosGeoJSON] = useState(null);
  const [municipiosActividad, setMunicipiosActividad] = useState([]);
  const [municipioActivo, setMunicipioActivo] = useState(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);

  useEffect(() => {
    setCargando(true);
    Promise.all([client.get('/geo/estados/geojson'), client.get('/inicio/mapa')])
      .then(([geoRes, mapaRes]) => { setGeoJSON(geoRes.data); setMapaData(mapaRes.data.datos || []); })
      .catch(console.error)
      .finally(() => setCargando(false));
  }, []);

  const estadosMap = useMemo(() => Object.fromEntries(mapaData.map(e => [e.cve_ent, e])), [mapaData]);
  const maxProy = useMemo(() => Math.max(1, ...mapaData.map(e => e.proyectos?.length || 0)), [mapaData]);
  const estadoIntensidad = useCallback(
    (cve) => (estadosMap[cve] ? (estadosMap[cve].proyectos?.length || 0) / maxProy : 0),
    [estadosMap, maxProy]
  );
  const municipiosActivosSet = useMemo(() => new Set(municipiosActividad.map(m => m.cvegeo)), [municipiosActividad]);
  const municipiosActividadMap = useMemo(() => Object.fromEntries(municipiosActividad.map(m => [m.cvegeo, m])), [municipiosActividad]);

  async function seleccionarEstado(cve_ent, nombre, layer) {
    setEstadoActivo({ cve_ent, nombre, bounds: layer.getBounds() });
    setMunicipioActivo(null);
    setCargandoDetalle(true);
    setDetalleEstado(null);
    setMunicipiosGeoJSON(null);
    setMunicipiosActividad([]);
    try {
      const [detRes, muniGeoRes, muniActRes] = await Promise.all([
        client.get(`/geo/territorio/estado/${cve_ent}/detalle`),
        client.get('/geo/municipios/geojson', { params: { cve_ent } }),
        client.get(`/geo/territorio/estado/${cve_ent}/municipios-actividad`),
      ]);
      setDetalleEstado(detRes.data.datos);
      setMunicipiosGeoJSON(muniGeoRes.data);
      setMunicipiosActividad(muniActRes.data.datos || []);
    } catch (e) { console.error('Error cargando detalle:', e); }
    finally { setCargandoDetalle(false); }
  }

  function volverANacional() {
    setEstadoActivo(null); setDetalleEstado(null);
    setMunicipiosGeoJSON(null); setMunicipiosActividad([]); setMunicipioActivo(null);
  }
  function volverAEstado() { setMunicipioActivo(null); }
  function clickMunicipio(cvegeo, nombre, layer, activo) {
    if (!activo) return;
    setMunicipioActivo({ cvegeo, nombre, etapas: municipiosActividadMap[cvegeo]?.etapas || [] });
  }

  if (cargando) return <div className="h-72 bg-gray-100 rounded-lg animate-pulse" />;

  if (!mapaData.length) {
    return (
      <div className="flex flex-col items-center justify-center h-56 gap-2 text-gray-400">
        <MapPin size={28} className="text-gray-200" />
        <p className="text-xs text-center">Sin cobertura territorial registrada en tus proyectos.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {estadoActivo && (
        <button onClick={volverANacional} className="flex items-center gap-1 text-[11px] text-[#7B1C3E] font-medium hover:underline">
          <ChevronLeft size={12} /> Volver a vista nacional
        </button>
      )}

      <div className="relative border border-gray-200 rounded-lg overflow-hidden" style={{ height: 300 }}>
        {geoJSON && (
          <MapaDrillDown
            estadosGeoJSON={geoJSON}
            estadoActivo={estadoActivo}
            estadoIntensidad={estadoIntensidad}
            onClickEstado={seleccionarEstado}
            onHoverEstado={(data) => {
              if (!data) { setHovered(null); return; }
              setHovered({ nombre: data.nombre, proyectos: estadosMap[data.cve_ent]?.proyectos || [], x: data.x, y: data.y });
            }}
            municipiosGeoJSON={municipiosGeoJSON}
            municipiosActivos={municipiosActivosSet}
            onClickMunicipio={clickMunicipio}
            onHoverMunicipio={(data) => {
              if (!data) { setHoveredMuni(null); return; }
              setHoveredMuni({ ...data, etapas: municipiosActividadMap[data.cvegeo]?.etapas || [] });
            }}
          />
        )}

        {hovered && (
          <div className="fixed z-[9999] bg-white border border-gray-200 rounded-lg shadow-lg p-3 w-52 pointer-events-none"
            style={{ left: Math.min(hovered.x + 12, window.innerWidth - 224), top: Math.min(hovered.y + 12, window.innerHeight - 180) }}>
            <p className="text-xs font-bold text-[#7B1C3E] mb-1">{hovered.nombre}</p>
            {hovered.proyectos.length === 0 ? <p className="text-xs text-gray-400 italic">Sin proyectos</p> : (
              <ul className="space-y-0.5 max-h-32 overflow-y-auto">
                {hovered.proyectos.slice(0, 5).map(p => (
                  <li key={p.id} className="flex items-center gap-1 text-[11px]">
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: GUINDA }} />
                    <span className="truncate text-gray-700">{p.nombre}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {hoveredMuni && hoveredMuni.activo && (
          <div className="fixed z-[9999] bg-white border border-gray-200 rounded-lg shadow-lg p-3 w-64 pointer-events-none"
            style={{ left: Math.min(hoveredMuni.x + 12, window.innerWidth - 260), top: Math.min(hoveredMuni.y + 12, window.innerHeight - 220) }}>
            <p className="text-xs font-bold text-[#7B1C3E] mb-1.5">{hoveredMuni.nombre}</p>
            <ul className="space-y-1.5 max-h-32 overflow-y-auto">
              {hoveredMuni.etapas.slice(0, 5).map((et, i) => (
                <li key={i} className="flex items-start gap-1.5 text-[11px]">
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1" style={{ backgroundColor: SEM[et.semaforo || 'gris'] }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <TipoBadge tipo={et.tipo} />
                      <span className="truncate text-gray-700">{et.nombre}</span>
                    </div>
                    {et.nombre_padre && <p className="text-[10px] text-gray-400 italic truncate">de {et.nombre_padre}</p>}
                  </div>
                  <span className="text-gray-400 tabular-nums flex-shrink-0">{et.avance}%</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="absolute bottom-3 left-3 z-[1000] bg-white/90 backdrop-blur-sm rounded-md px-2.5 py-1.5 border border-gray-200 text-[10px]">
          <p className="font-semibold text-gray-600 mb-1">Proyectos por estado</p>
          <div className="flex items-center gap-1">
            {[0.15, 0.35, 0.55, 0.75].map((op, i) => <div key={i} className="w-4 h-3 rounded-sm" style={{ backgroundColor: GUINDA, opacity: op }} />)}
            <span className="ml-1 text-gray-400">1 → {maxProy}</span>
          </div>
        </div>
      </div>

      {/* Panel ligero: municipio > estado > chips nacionales */}
      {cargandoDetalle ? (
        <div className="flex items-center justify-center h-20 gap-2 text-gray-400 text-xs">
          <div className="animate-spin w-3.5 h-3.5 border-2 border-[#7B1C3E] border-t-transparent rounded-full" /> Cargando…
        </div>
      ) : municipioActivo ? (
        <div className="border border-[#7B1C3E]/20 rounded-lg bg-white p-3">
          <div className="flex items-start justify-between mb-2">
            <div>
              <button onClick={volverAEstado} className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-[#7B1C3E] mb-1">
                <ChevronLeft size={10} /> Volver a {estadoActivo.nombre}
              </button>
              <h3 className="text-xs font-bold text-[#7B1C3E]">{municipioActivo.nombre}</h3>
            </div>
            <button onClick={() => setMunicipioActivo(null)} className="p-1 rounded hover:bg-gray-100 text-gray-400"><X size={12} /></button>
          </div>
          <div className="space-y-1">
            {municipioActivo.etapas.map((et, i) => (
              <Link key={i} to={`/proyectos/${et.id_proyecto}`} className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-[#fbf3f6] transition-colors group">
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: SEM[et.semaforo || 'gris'] }} />
                <TipoBadge tipo={et.tipo} />
                <span className="text-[11px] text-gray-700 group-hover:text-[#7B1C3E] truncate flex-1">{et.nombre}</span>
                <span className="text-[10px] text-gray-400 tabular-nums flex-shrink-0">{et.avance}%</span>
                <ChevronRight size={11} className="text-gray-300 group-hover:text-[#7B1C3E] flex-shrink-0" />
              </Link>
            ))}
          </div>
        </div>
      ) : detalleEstado ? (
        <div className="border border-[#7B1C3E]/20 rounded-lg bg-white p-3">
          <h3 className="text-xs font-bold text-[#7B1C3E] mb-1.5">{detalleEstado.nombre}</h3>
          {detalleEstado.etapas.length === 0 ? (
            <p className="text-[11px] text-gray-400 italic">Sin actividad tuya en este estado.</p>
          ) : (
            <div className="space-y-1">
              {detalleEstado.etapas.slice(0, 6).map((et, i) => (
                <Link key={i} to={`/proyectos/${et.id_proyecto}`} className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-[#fbf3f6] transition-colors group">
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: SEM[et.semaforo || 'gris'] }} />
                  <TipoBadge tipo={et.tipo} />
                  <span className="text-[11px] text-gray-700 group-hover:text-[#7B1C3E] truncate flex-1">{et.nombre}</span>
                  <span className="text-[10px] text-gray-400 tabular-nums flex-shrink-0">{et.avance}%</span>
                </Link>
              ))}
              {Object.keys(municipiosActividadMap).length > 0 && (
                <p className="text-[10px] text-gray-400 pt-1">Haz clic en un municipio en guinda para ver su detalle.</p>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {mapaData.map(e => (
            <div key={e.cve_ent}
              className="group relative px-2.5 py-1 rounded-lg border text-xs cursor-default"
              style={{ backgroundColor: `rgba(123, 28, 62, ${Math.min(0.08 + (e.proyectos?.length || 0) * 0.08, 0.5)})`, borderColor: 'rgba(123, 28, 62, 0.25)', color: '#4a0e23' }}>
              <span className="font-medium">{e.nombre_estado}</span>
              <span className="ml-1 opacity-60">({e.proyectos?.length || 0})</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
