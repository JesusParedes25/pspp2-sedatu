/**
 * ARCHIVO: MapaCartera.jsx
 * PROPÓSITO: Mapa territorial de una cartera — coropletas nacionales de
 *            los proyectos de esta cartera, vía GET /carteras/:id/mapa
 *            (incidencia territorial ya acotada a los proyectos de la
 *            cartera en el propio backend — a diferencia de /inicio/mapa,
 *            que solo devuelve "mis proyectos" y por eso el mapa salía
 *            vacío para cualquier cartera con proyectos ajenos al usuario
 *            en sesión). Versión simplificada de MapaTerritorial.jsx: sin
 *            escala ZM ni drill-down a municipio, solo estado → lista de
 *            proyectos de la cartera activos ahí.
 */
import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Map, Loader2 } from 'lucide-react';
import client from '../../api/client';
import MapaDrillDown from '../mapa/MapaDrillDown';
import 'leaflet/dist/leaflet.css';

const GUINDA = '#7B1C3E';

export default function MapaCartera({ carteraId }) {
  const [geoJSON, setGeoJSON] = useState(null);
  const [mapaDataFiltrada, setMapaDataFiltrada] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [estadoSeleccionado, setEstadoSeleccionado] = useState(null);
  const [hovered, setHovered] = useState(null);

  useEffect(() => {
    setCargando(true);
    Promise.all([
      client.get('/geo/estados/geojson'),
      client.get(`/carteras/${carteraId}/mapa`),
    ])
      .then(([geoRes, mapaRes]) => {
        setGeoJSON(geoRes.data);
        setMapaDataFiltrada(mapaRes.data.datos || []);
      })
      .catch(console.error)
      .finally(() => setCargando(false));
  }, [carteraId]);

  const estadosMap = useMemo(
    () => Object.fromEntries(mapaDataFiltrada.map(e => [e.cve_ent, e])),
    [mapaDataFiltrada]
  );
  const maxProy = useMemo(
    () => Math.max(1, ...mapaDataFiltrada.map(e => e.proyectos?.length || 0)),
    [mapaDataFiltrada]
  );
  const estadoIntensidad = (cve) => (estadosMap[cve] ? (estadosMap[cve].proyectos?.length || 0) / maxProy : 0);

  if (cargando) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400 gap-2">
        <Loader2 size={16} className="animate-spin" /> Cargando mapa...
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
        <span className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
          <Map size={14} className="text-guinda-500" /> Territorio de la cartera
        </span>
        <span className="text-xs text-gray-400">{mapaDataFiltrada.length} estado(s) con actividad</span>
      </div>
      <div className="flex" style={{ height: 440 }}>
        <div className="relative flex-[3] min-w-0">
          {geoJSON && (
            <MapaDrillDown
              estadosGeoJSON={geoJSON}
              estadoActivo={estadoSeleccionado ? { cve_ent: estadoSeleccionado.clave } : null}
              estadoIntensidad={estadoIntensidad}
              onClickEstado={(clave, nombre) => setEstadoSeleccionado({ clave, nombre })}
              onHoverEstado={setHovered}
              municipiosGeoJSON={null}
              municipiosActivos={new Set()}
              onClickMunicipio={() => {}}
              onHoverMunicipio={() => {}}
            />
          )}
          {hovered && (
            <div className="fixed z-[9999] bg-white border border-gray-200 rounded-lg shadow-lg p-3 w-56 pointer-events-none"
              style={{ left: Math.min(hovered.x + 12, window.innerWidth - 230), top: Math.min(hovered.y + 12, window.innerHeight - 180) }}>
              <p className="text-xs font-bold mb-1" style={{ color: GUINDA }}>{hovered.nombre}</p>
              {(() => {
                const proys = estadosMap[hovered.cve_ent]?.proyectos || [];
                return proys.length === 0
                  ? <p className="text-xs text-gray-400 italic">Sin actividad de esta cartera</p>
                  : <ul className="space-y-0.5">
                    {proys.slice(0, 5).map(p => (
                      <li key={p.id} className="text-[11px] text-gray-600 truncate">{p.nombre}</li>
                    ))}
                    {proys.length > 5 && <li className="text-[10px] text-gray-400">+{proys.length - 5} más</li>}
                  </ul>;
              })()}
            </div>
          )}
        </div>
        <div className="flex-[2] min-w-0 border-l border-gray-100 overflow-y-auto p-4">
          {!estadoSeleccionado ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <Map size={28} className="text-gray-200 mb-3" />
              <p className="text-sm text-gray-500">Selecciona un estado del mapa</p>
              <p className="text-xs text-gray-400 mt-1">Verás los proyectos de esta cartera activos ahí.</p>
            </div>
          ) : (
            <div>
              <p className="text-xs font-bold text-gray-700 mb-3">{estadoSeleccionado.nombre}</p>
              {(estadosMap[estadoSeleccionado.clave]?.proyectos || []).length === 0 ? (
                <p className="text-xs text-gray-400 italic">Sin proyectos de esta cartera aquí.</p>
              ) : (
                <div className="space-y-2">
                  {estadosMap[estadoSeleccionado.clave].proyectos.map(p => (
                    <Link key={p.id} to={`/proyectos/${p.id}`} className="block text-xs text-gray-700 hover:text-guinda-600 p-2 rounded-lg hover:bg-gray-50">
                      {p.nombre}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
