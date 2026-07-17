import { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, WMSTileLayer, GeoJSON, useMap } from 'react-leaflet';
import { Link } from 'react-router-dom';
import { Map, Filter, X, AlertTriangle, TrendingUp, ChevronRight } from 'lucide-react';
import { obtenerResumenEstados, obtenerResumenTerritorial } from '../api/mapa';
import { useAuth } from '../context/AuthContext';
import 'leaflet/dist/leaflet.css';

const GEOSERVER_URL = import.meta.env.VITE_GEOSERVER_URL || 'http://localhost:8600/geoserver';
const MEXICO_CENTER = [23.6345, -102.5528];
const MEXICO_ZOOM = 5;

function getColor(avancePct) {
  if (avancePct >= 80) return '#22c55e';
  if (avancePct >= 60) return '#84cc16';
  if (avancePct >= 40) return '#eab308';
  if (avancePct >= 20) return '#f97316';
  return '#ef4444';
}

function BarraAvance({ completadas, total, className = '' }) {
  const pct = total > 0 ? Math.round((completadas / total) * 100) : 0;
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: getColor(pct) }} />
      </div>
      <span className="text-xs font-medium text-gray-600 w-10 text-right">{pct}%</span>
    </div>
  );
}

function PanelDrillDown({ estado, datos, onClose }) {
  if (!datos) return null;
  const { proyectos, riesgos, indicadores } = datos;

  return (
    <div className="absolute top-4 right-4 w-[420px] max-h-[calc(100vh-8rem)] bg-white rounded-xl shadow-2xl border border-gray-200 z-[1000] overflow-hidden flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
        <h3 className="font-semibold text-gray-900 text-sm">📍 {estado}</h3>
        <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded"><X size={16} /></button>
      </div>

      <div className="overflow-y-auto flex-1 p-4 space-y-4">
        <p className="text-xs text-gray-500">{proyectos.length} proyecto{proyectos.length !== 1 ? 's' : ''} con actividad</p>

        {proyectos.map(proy => (
          <div key={proy.proyecto_id} className="border rounded-lg p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-gray-900">{proy.proyecto_nombre}</p>
                <p className="text-xs text-gray-500">{proy.dg_siglas}</p>
              </div>
              <Link to={`/proyectos/${proy.proyecto_id}`} className="text-xs text-guinda-600 hover:underline flex items-center gap-0.5">
                Ver <ChevronRight size={12} />
              </Link>
            </div>
            <BarraAvance completadas={proy.completadas} total={proy.total} />
            <p className="text-xs text-gray-500">{proy.completadas}/{proy.total} acciones completadas</p>

            {proy.etapas.map((et, i) => (
              <div key={i} className="ml-3 border-l-2 border-gray-200 pl-3">
                <p className="text-xs font-medium text-gray-700">{et.nombre}</p>
                <ul className="mt-1 space-y-0.5">
                  {et.acciones.slice(0, 5).map(a => (
                    <li key={a.id} className="text-xs text-gray-600 flex items-center gap-1">
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        a.estado === 'Completada' ? 'bg-green-500' :
                        a.estado === 'En_proceso' ? 'bg-blue-500' :
                        a.estado === 'Bloqueada' ? 'bg-red-500' : 'bg-gray-400'
                      }`} />
                      <span className="truncate">{a.nombre}</span>
                      {a.municipio && <span className="text-gray-400 ml-auto text-[10px]">{a.municipio}</span>}
                    </li>
                  ))}
                  {et.acciones.length > 5 && (
                    <li className="text-[10px] text-gray-400">+{et.acciones.length - 5} más</li>
                  )}
                </ul>
              </div>
            ))}
          </div>
        ))}

        {riesgos.length > 0 && (
          <div className="border-t pt-3">
            <p className="text-xs font-medium text-red-700 flex items-center gap-1 mb-2">
              <AlertTriangle size={12} /> Riesgos activos
            </p>
            <ul className="space-y-1">
              {riesgos.map((r, i) => (
                <li key={i} className="text-xs text-gray-600">
                  <span className={`font-medium ${r.nivel === 'Critico' ? 'text-red-600' : r.nivel === 'Alto' ? 'text-orange-600' : 'text-yellow-600'}`}>
                    [{r.nivel}]
                  </span>{' '}
                  {r.titulo} <span className="text-gray-400">— {r.proyecto_nombre}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {indicadores.length > 0 && (
          <div className="border-t pt-3">
            <p className="text-xs font-medium text-blue-700 flex items-center gap-1 mb-2">
              <TrendingUp size={12} /> Indicadores
            </p>
            <ul className="space-y-1">
              {indicadores.map((ind, i) => {
                const pct = ind.meta_global > 0 ? Math.round((ind.valor_actual / ind.meta_global) * 100) : 0;
                return (
                  <li key={i} className="text-xs text-gray-600 flex items-center justify-between">
                    <span className="truncate">{ind.nombre}</span>
                    <span className="font-medium ml-2 whitespace-nowrap">{ind.valor_actual}/{ind.meta_global} ({pct}%)</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

export default function MapaTerritorial() {
  const { usuario } = useAuth();
  const [resumenEstados, setResumenEstados] = useState([]);
  const [estadoSeleccionado, setEstadoSeleccionado] = useState(null);
  const [drillDown, setDrillDown] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [filtroDG, setFiltroDG] = useState('');

  useEffect(() => {
    cargarResumen();
  }, [filtroDG]);

  async function cargarResumen() {
    setCargando(true);
    try {
      const filtros = filtroDG ? { id_dg: filtroDG } : {};
      const datos = await obtenerResumenEstados(filtros);
      setResumenEstados(datos);
    } catch (err) {
      console.error('Error cargando resumen territorial:', err);
    } finally {
      setCargando(false);
    }
  }

  async function handleClickEstado(idEstado, nombreEstado) {
    setEstadoSeleccionado(nombreEstado);
    try {
      const filtros = filtroDG ? { id_dg: filtroDG } : {};
      const datos = await obtenerResumenTerritorial(idEstado, filtros);
      setDrillDown(datos);
    } catch (err) {
      console.error('Error cargando drill-down:', err);
    }
  }

  // Build a lookup for WMS CQL filter
  const estadosConActividad = resumenEstados.map(e => e.clave);
  const cqlFilter = estadosConActividad.length > 0
    ? `cve_ent IN (${estadosConActividad.map(c => `'${c}'`).join(',')})`
    : 'cve_ent = \'00\'';

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-white">
        <div className="flex items-center gap-2">
          <Map size={20} className="text-guinda-600" />
          <h1 className="text-lg font-semibold text-gray-900">Mapa Territorial</h1>
          {!cargando && (
            <span className="text-xs text-gray-500 ml-2">
              {resumenEstados.length} estados con actividad · {resumenEstados.reduce((s, e) => s + e.total_acciones, 0)} acciones
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-gray-400" />
          <select
            value={filtroDG}
            onChange={e => { setFiltroDG(e.target.value); setDrillDown(null); }}
            className="text-xs border rounded px-2 py-1"
          >
            <option value="">Todas las DGs</option>
          </select>
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        <MapContainer
          center={MEXICO_CENTER}
          zoom={MEXICO_ZOOM}
          className="h-full w-full z-0"
          zoomControl={true}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          />

          {/* WMS layer: all states outline */}
          <WMSTileLayer
            url={`${GEOSERVER_URL}/wms`}
            layers="pspp:vw_geo_estados"
            format="image/png"
            transparent={true}
            styles=""
            opacity={0.3}
          />

          {/* WMS layer: states with activity (highlighted) */}
          {estadosConActividad.length > 0 && (
            <WMSTileLayer
              url={`${GEOSERVER_URL}/wms`}
              layers="pspp:vw_geo_estados"
              format="image/png"
              transparent={true}
              cql_filter={cqlFilter}
              styles=""
              opacity={0.7}
            />
          )}

          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png"
            attribution=""
          />
        </MapContainer>

        {/* Legend */}
        <div className="absolute bottom-4 left-4 bg-white rounded-lg shadow-lg border p-3 z-[1000]">
          <p className="text-[10px] font-medium text-gray-600 mb-1.5">Avance por estado</p>
          <div className="space-y-1">
            {[
              { color: '#22c55e', label: '≥80%' },
              { color: '#84cc16', label: '60–79%' },
              { color: '#eab308', label: '40–59%' },
              { color: '#f97316', label: '20–39%' },
              { color: '#ef4444', label: '<20%' },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: item.color }} />
                <span className="text-[10px] text-gray-600">{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* States list (clickable) */}
        <div className="absolute top-4 left-4 bg-white rounded-lg shadow-lg border z-[1000] max-h-[calc(100vh-12rem)] overflow-y-auto w-56">
          <div className="px-3 py-2 border-b bg-gray-50">
            <p className="text-xs font-medium text-gray-700">Estados ({resumenEstados.length})</p>
          </div>
          <div className="divide-y">
            {resumenEstados.map(estado => (
              <button
                key={estado.id_estado}
                onClick={() => handleClickEstado(estado.id_estado, estado.nombre)}
                className={`w-full text-left px-3 py-2 hover:bg-gray-50 transition-colors ${
                  estadoSeleccionado === estado.nombre ? 'bg-guinda-50' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-800 truncate">{estado.nombre}</span>
                  <span className="text-[10px] text-gray-500">{estado.total_acciones}</span>
                </div>
                <BarraAvance completadas={estado.completadas} total={estado.total_acciones} className="mt-1" />
              </button>
            ))}
          </div>
        </div>

        {/* Drill-down panel */}
        {drillDown && (
          <PanelDrillDown
            estado={estadoSeleccionado}
            datos={drillDown}
            onClose={() => { setDrillDown(null); setEstadoSeleccionado(null); }}
          />
        )}
      </div>
    </div>
  );
}
