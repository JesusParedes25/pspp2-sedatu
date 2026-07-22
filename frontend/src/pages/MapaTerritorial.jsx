import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import L from 'leaflet';
import { Link } from 'react-router-dom';
import {
  Map, AlertTriangle, TrendingUp, Clock, ChevronLeft, ChevronRight,
  Layers, Target, Activity, Search, X, Building2,
} from 'lucide-react';
import client from '../api/client';
import MapaDrillDown, { MEXICO_CENTER, MEXICO_ZOOM } from '../components/mapa/MapaDrillDown';
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

function avanceColor(pct) {
  if (pct >= 80) return '#22c55e';
  if (pct >= 40) return '#f59e0b';
  return '#ef4444';
}

function BarraAvance({ pct, className = '' }) {
  const color = avanceColor(pct);
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="text-[11px] font-semibold tabular-nums" style={{ color }}>{pct}%</span>
    </div>
  );
}

function Seccion({ titulo, icono: I, iconoCls, children }) {
  return (
    <div className="border-t border-gray-100 pt-4 mt-4">
      <div className="flex items-center gap-1.5 mb-3">
        <I size={13} className={iconoCls} />
        <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{titulo}</span>
      </div>
      {children}
    </div>
  );
}

// ─── Encabezado + métricas, común a estado / ZM / municipio ──────
function EncabezadoDetalle({ tipoBadge, nombre, claveLabel, clave, metricas, avancePromedio, onVolver, breadcrumb }) {
  return (
    <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b border-gray-100">
      <button onClick={onVolver} className="flex items-center gap-1 text-xs text-gray-400 hover:text-[#7B1C3E] mb-2 transition-colors">
        <ChevronLeft size={13} /> {breadcrumb}
      </button>
      <div className="flex items-start justify-between mb-1">
        <span className="text-[10px] font-bold tracking-widest text-[#a8864b] uppercase">{tipoBadge}</span>
        {clave && <span className="text-[10px] text-gray-400 font-mono">{claveLabel}: {clave}</span>}
      </div>
      <h2 className="text-lg font-bold text-[#7B1C3E] leading-tight mb-3">{nombre}</h2>
      <div className="grid grid-cols-3 gap-2 mb-3">
        {metricas.map(m => (
          <div key={m.label} className="bg-gray-50 rounded-lg p-2 text-center">
            <div className={`text-xl font-bold ${m.warn ? 'text-amber-600' : 'text-gray-800'}`}>{m.val}</div>
            <div className="text-[10px] text-gray-400">{m.label}</div>
          </div>
        ))}
      </div>
      {avancePromedio !== undefined && (
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-gray-500">Avance promedio aquí</span>
          <div className="flex-1"><BarraAvance pct={avancePromedio} /></div>
        </div>
      )}
    </div>
  );
}

function BloqueProyectos({ proyectos }) {
  if (!proyectos.length) return null;
  return (
    <Seccion titulo="Proyectos" icono={Target} iconoCls="text-[#7B1C3E]">
      <div className="space-y-2.5">
        {proyectos.map(p => (
          <Link key={p.id} to={`/proyectos/${p.id}`}
            className="block p-2.5 rounded-lg border border-gray-100 hover:border-[#7B1C3E]/30 hover:bg-[#fbf3f6] transition-colors group">
            <div className="flex items-start justify-between gap-2 mb-1">
              <span className="text-xs font-medium text-gray-800 group-hover:text-[#7B1C3E] leading-snug">{p.nombre}</span>
              <span className="text-[10px] text-gray-400 flex-shrink-0">{p.num_etapas_aqui} etapa{p.num_etapas_aqui !== 1 ? 's' : ''} aquí</span>
            </div>
            <BarraAvance pct={p.avance} />
          </Link>
        ))}
      </div>
    </Seccion>
  );
}

function BloqueIndicadores({ indicadores }) {
  if (!indicadores.length) return null;
  return (
    <Seccion titulo="Indicadores" icono={TrendingUp} iconoCls="text-blue-500">
      <div className="space-y-2.5">
        {indicadores.map((ind, i) => (
          <div key={i} className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-700 truncate">{ind.nombre}</p>
              <p className="text-[10px] text-gray-400">
                {ind.pct_meta !== null ? `${ind.pct_meta}% de meta · ${ind.unidad}` : `Sin meta · numeralía`}
              </p>
            </div>
            <div className="flex-shrink-0 text-right">
              <span className="text-base font-bold" style={{ color: ind.pct_meta !== null ? '#22c55e' : '#a8864b' }}>
                {Number(ind.realizado).toLocaleString('es-MX')}
              </span>
              {ind.pct_meta !== null && (
                <span className="text-[10px] text-gray-400 block">/ {Number(ind.meta_global).toLocaleString('es-MX')}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </Seccion>
  );
}

function BloqueEtapas({ etapas }) {
  if (!etapas.length) return null;
  return (
    <Seccion titulo="Etapas y acciones aquí" icono={Layers} iconoCls="text-indigo-500">
      <div className="space-y-1.5">
        {etapas.map((et, i) => (
          <Link key={i} to={`/proyectos/${et.id_proyecto}`}
            className="flex items-center gap-2 py-1 hover:bg-gray-50 rounded px-1 -mx-1 transition-colors">
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: SEM[et.semaforo || 'gris'] }} />
            <TipoBadge tipo={et.tipo} />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-800 truncate">{et.nombre}</p>
              <p className="text-[10px] text-gray-400 italic truncate">
                {et.nombre_padre ? `${et.nombre_padre} · ` : ''}{et.nombre_proyecto}
              </p>
            </div>
            <span className="text-[10px] text-gray-500 tabular-nums flex-shrink-0">{et.avance}%</span>
          </Link>
        ))}
      </div>
    </Seccion>
  );
}

function BloqueRiesgos({ riesgos }) {
  if (!riesgos.length) return null;
  return (
    <Seccion titulo="Riesgos abiertos" icono={AlertTriangle} iconoCls="text-amber-500">
      <div className="space-y-2">
        {riesgos.map((r, i) => (
          <div key={i} className="flex gap-2">
            <AlertTriangle size={12} className="text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-medium text-gray-700">{r.descripcion || r.titulo}</p>
              <p className="text-[10px] text-gray-400">Nivel: {r.nivel} · {r.estado}</p>
            </div>
          </div>
        ))}
      </div>
    </Seccion>
  );
}

function BloqueVencimientos({ vencidos, por_vencer }) {
  if (!vencidos.length && !por_vencer.length) return null;
  return (
    <Seccion titulo="Vencimientos" icono={Clock} iconoCls="text-red-400">
      <div className="space-y-1.5">
        {vencidos.map((v, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="flex-shrink-0 text-[10px] font-bold bg-red-100 text-red-600 rounded px-1.5 py-0.5 tabular-nums">{v.dias}d</span>
            <div className="min-w-0">
              <p className="text-xs text-gray-700 truncate">{v.nombre}</p>
              <p className="text-[10px] text-gray-400 truncate">{v.nombre_proyecto}</p>
            </div>
          </div>
        ))}
        {por_vencer.map((v, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="flex-shrink-0 text-[10px] font-bold bg-amber-100 text-amber-600 rounded px-1.5 py-0.5 tabular-nums">+{v.dias}d</span>
            <div className="min-w-0">
              <p className="text-xs text-gray-700 truncate">{v.nombre}</p>
              <p className="text-[10px] text-gray-400 truncate">{v.nombre_proyecto}</p>
            </div>
          </div>
        ))}
      </div>
    </Seccion>
  );
}

// ─── Sidebar: detalle de Estado o ZM (rico, viene del backend) ────
function SidebarDetalleEstadoZM({ detalle, tipo, onVolver, breadcrumb }) {
  const { nombre, cve_ent, cve_met, num_proyectos, num_etapas, num_riesgos, avance_promedio,
    proyectos, indicadores, etapas, riesgos, vencidos, por_vencer } = detalle;

  return (
    <div className="flex flex-col h-full">
      <EncabezadoDetalle
        tipoBadge={tipo === 'zm' ? 'Zona Metropolitana' : 'Estado'}
        nombre={nombre}
        claveLabel={tipo === 'zm' ? 'CVE_MET' : 'Clave INEGI'}
        clave={tipo === 'zm' ? cve_met : cve_ent}
        metricas={[
          { label: 'Proyectos', val: num_proyectos },
          { label: 'Etapas/Acc.', val: num_etapas },
          { label: 'Riesgos', val: num_riesgos, warn: num_riesgos > 0 },
        ]}
        avancePromedio={avance_promedio}
        onVolver={onVolver}
        breadcrumb={breadcrumb}
      />
      <div className="flex-1 overflow-y-auto px-4 pb-6">
        <BloqueProyectos proyectos={proyectos} />
        <BloqueIndicadores indicadores={indicadores} />
        <BloqueEtapas etapas={etapas} />
        <BloqueRiesgos riesgos={riesgos} />
        <BloqueVencimientos vencidos={vencidos} por_vencer={por_vencer} />
        {proyectos.length === 0 && etapas.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <Activity size={28} className="mb-2 text-gray-200" />
            <p className="text-sm">Sin actividad registrada aquí</p>
            <p className="text-xs mt-1">Asigna esta ubicación a etapas o acciones.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sidebar: detalle de Municipio (armado en cliente desde municipios-actividad) ──
function SidebarDetalleMunicipio({ municipio, onVolver, breadcrumb }) {
  const { nombre, cvegeo, etapas } = municipio;
  const porProyecto = useMemo(() => {
    const acc = {};
    for (const et of etapas) {
      if (!acc[et.id_proyecto]) acc[et.id_proyecto] = { id: et.id_proyecto, nombre: et.nombre_proyecto, suma: 0, cuenta: 0, num_etapas_aqui: 0 };
      acc[et.id_proyecto].suma += et.avance;
      acc[et.id_proyecto].cuenta++;
      if (et.tipo === 'etapa') acc[et.id_proyecto].num_etapas_aqui++;
    }
    return Object.values(acc).map(p => ({
      id: p.id, nombre: p.nombre,
      avance: p.cuenta ? Math.round(p.suma / p.cuenta) : 0,
      num_etapas_aqui: p.num_etapas_aqui,
    }));
  }, [etapas]);
  const avancePromedio = porProyecto.length
    ? Math.round(porProyecto.reduce((s, p) => s + p.avance, 0) / porProyecto.length) : 0;

  return (
    <div className="flex flex-col h-full">
      <EncabezadoDetalle
        tipoBadge="Municipio"
        nombre={nombre}
        claveLabel="CVEGEO"
        clave={cvegeo}
        metricas={[
          { label: 'Proyectos', val: porProyecto.length },
          { label: 'Etapas/Acc.', val: etapas.length },
        ]}
        avancePromedio={avancePromedio}
        onVolver={onVolver}
        breadcrumb={breadcrumb}
      />
      <div className="flex-1 overflow-y-auto px-4 pb-6">
        <BloqueProyectos proyectos={porProyecto} />
        <BloqueEtapas etapas={etapas} />
        <p className="text-[10px] text-gray-400 mt-4 text-center">
          Indicadores, riesgos y vencimientos se muestran a nivel estado.
        </p>
      </div>
    </div>
  );
}

function SidebarVacia() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8">
      <Map size={40} className="text-gray-200 mb-4" />
      <p className="text-sm font-medium text-gray-600 mb-1">Selecciona un área del mapa</p>
      <p className="text-xs text-gray-400 leading-relaxed">
        Al hacer clic en un estado verás aquí sus proyectos, indicadores, riesgos y vencimientos.
      </p>
    </div>
  );
}

// ─── Toolbar ───────────────────────────────────────────────────
function Toolbar({
  breadcrumb, mostrarVolver, onVolver,
  scale, onScale,
  proyectos, filtroProyecto, onFiltroProyecto,
  busqueda, onBusqueda, resultados, onSeleccionarResultado, buscando,
  estadosOpciones, estadoClaveSel, onSeleccionarEstado,
  municipiosOpciones, municipioClaveSel, onSeleccionarMunicipio,
  zmOpciones, zmClaveSel, onSeleccionarZm,
}) {
  const [menuMasAbierto, setMenuMasAbierto] = useState(false);
  const [mostrarResultados, setMostrarResultados] = useState(false);
  const visibles = proyectos.slice(0, 3);
  const resto = proyectos.slice(3);

  return (
    <div className="flex-shrink-0 border-b bg-white">
      <div className="flex items-center gap-2 px-4 py-2 flex-wrap">
        {/* Breadcrumb + volver */}
        <div className="flex items-center gap-2 text-xs text-gray-500 mr-2">
          {mostrarVolver && (
            <button onClick={onVolver}
              className="flex items-center gap-1 text-[#7B1C3E] font-medium hover:underline">
              <ChevronLeft size={13} /> Volver a vista nacional
            </button>
          )}
          {!mostrarVolver && <span>{breadcrumb}</span>}
        </div>

        <div className="h-4 w-px bg-gray-200" />

        {/* Escala */}
        <div className="flex items-center bg-gray-100 rounded-full p-0.5 text-[11px]">
          {[{ id: 'estados', label: 'Estados' }, { id: 'zm', label: 'Zonas metropolitanas' }].map(o => (
            <button key={o.id} onClick={() => onScale(o.id)}
              className={`px-2.5 py-1 rounded-full font-medium transition-colors ${scale === o.id ? 'bg-[#7B1C3E] text-white' : 'text-gray-500 hover:text-gray-700'}`}>
              {o.label}
            </button>
          ))}
        </div>

        {/* Selects directos: Estado / Municipio / ZM (alternativa a clicar el mapa) */}
        {scale === 'estados' ? (
          <>
            <select value={estadoClaveSel || ''} onChange={e => onSeleccionarEstado(e.target.value)}
              className="text-[11px] border border-gray-200 rounded-full px-2 py-1 bg-white focus:outline-none focus:border-[#7B1C3E] max-w-[130px]">
              <option value="">Estado…</option>
              {estadosOpciones.map(e => <option key={e.cve_ent} value={e.cve_ent}>{e.nombre}</option>)}
            </select>
            <select value={municipioClaveSel || ''} onChange={e => onSeleccionarMunicipio(e.target.value)}
              disabled={!municipiosOpciones.length}
              className="text-[11px] border border-gray-200 rounded-full px-2 py-1 bg-white focus:outline-none focus:border-[#7B1C3E] max-w-[130px] disabled:bg-gray-50 disabled:text-gray-300">
              <option value="">Municipio…</option>
              {municipiosOpciones.map(m => <option key={m.cvegeo} value={m.cvegeo}>{m.nombre}</option>)}
            </select>
          </>
        ) : (
          <select value={zmClaveSel || ''} onChange={e => onSeleccionarZm(e.target.value)}
            className="text-[11px] border border-gray-200 rounded-full px-2 py-1 bg-white focus:outline-none focus:border-[#7B1C3E] max-w-[160px]">
            <option value="">Zona metropolitana…</option>
            {zmOpciones.map(z => <option key={z.gid} value={z.gid}>{z.nombre}</option>)}
          </select>
        )}

        <div className="h-4 w-px bg-gray-200" />

        {/* Filtro de proyecto */}
        <div className="flex items-center gap-1 flex-wrap">
          <button onClick={() => onFiltroProyecto(null)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${!filtroProyecto ? 'bg-[#7B1C3E] text-white' : 'bg-gray-100 text-gray-500 hover:text-gray-700'}`}>
            Todos
          </button>
          {visibles.map(p => (
            <button key={p.id} onClick={() => onFiltroProyecto(p.id)} title={p.nombre}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors max-w-[140px] truncate ${filtroProyecto === p.id ? 'bg-[#7B1C3E] text-white' : 'bg-gray-100 text-gray-500 hover:text-gray-700'}`}>
              {p.nombre}
            </button>
          ))}
          {resto.length > 0 && (
            <div className="relative">
              <button onClick={() => setMenuMasAbierto(v => !v)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${resto.some(p => p.id === filtroProyecto) ? 'bg-[#7B1C3E] text-white' : 'bg-gray-100 text-gray-500 hover:text-gray-700'}`}>
                +{resto.length} más
              </button>
              {menuMasAbierto && (
                <div className="absolute z-[1100] top-full mt-1 left-0 bg-white border border-gray-200 rounded-lg shadow-lg p-1.5 w-56 max-h-64 overflow-y-auto">
                  {resto.map(p => (
                    <label key={p.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer text-xs">
                      <input type="radio" checked={filtroProyecto === p.id}
                        onChange={() => { onFiltroProyecto(p.id); setMenuMasAbierto(false); }} />
                      <span className="truncate">{p.nombre}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Buscador */}
        <div className="relative ml-auto w-64">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={busqueda}
            onChange={e => { onBusqueda(e.target.value); setMostrarResultados(true); }}
            onFocus={() => setMostrarResultados(true)}
            onBlur={() => setTimeout(() => setMostrarResultados(false), 150)}
            placeholder="Buscar estado, municipio o proyecto…"
            className="w-full pl-7 pr-7 py-1.5 text-xs border border-gray-200 rounded-full focus:outline-none focus:border-[#7B1C3E]"
          />
          {busqueda && (
            <button onClick={() => onBusqueda('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500">
              <X size={13} />
            </button>
          )}
          {mostrarResultados && busqueda.trim().length >= 2 && (
            <div className="absolute z-[1100] top-full mt-1 right-0 w-72 bg-white border border-gray-200 rounded-lg shadow-lg max-h-72 overflow-y-auto">
              {buscando && <div className="px-3 py-2 text-[11px] text-gray-400">Buscando…</div>}
              {!buscando && resultados.estados.length === 0 && resultados.municipios.length === 0 && resultados.proyectos.length === 0 && (
                <div className="px-3 py-2 text-[11px] text-gray-400">Sin resultados</div>
              )}
              {resultados.estados.map(e => (
                <button key={'e' + e.cve_ent} onMouseDown={() => onSeleccionarResultado({ tipo: 'estado', ...e })}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 flex items-center gap-2">
                  <Map size={11} className="text-gray-400" /> {e.nombre}
                </button>
              ))}
              {resultados.municipios.map(m => (
                <button key={'m' + m.cvegeo} onMouseDown={() => onSeleccionarResultado({ tipo: 'municipio', ...m })}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 flex items-center gap-2">
                  <Building2 size={11} className="text-gray-400" /> {m.nombre}
                  <span className="text-gray-400 text-[10px]">· {m.nombre_estado}</span>
                </button>
              ))}
              {resultados.proyectos.map(p => (
                <button key={'p' + p.id} onMouseDown={() => onSeleccionarResultado({ tipo: 'proyecto', ...p })}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 flex items-center gap-2">
                  <Target size={11} className="text-gray-400" /> {p.nombre}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function MapaTerritorial() {
  const [geoJSON, setGeoJSON] = useState(null);
  const [zmGeoJSON, setZmGeoJSON] = useState(null);
  const [mapaData, setMapaData] = useState([]);
  const [proyectosDisponibles, setProyectosDisponibles] = useState([]);
  const [cargandoMapa, setCargandoMapa] = useState(true);

  const [scale, setScale] = useState('estados');
  const [filtroProyecto, setFiltroProyecto] = useState(null);

  // seleccion.tipo: 'estado' | 'zm' | 'municipio'
  const [seleccion, setSeleccion] = useState(null);
  const [detalle, setDetalle] = useState(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [municipiosGeoJSON, setMunicipiosGeoJSON] = useState(null);
  const [municipiosActividad, setMunicipiosActividad] = useState([]);
  const [municipioSeleccionado, setMunicipioSeleccionado] = useState(null);

  const [hoveredEstado, setHoveredEstado] = useState(null);
  const [hoveredMuni, setHoveredMuni] = useState(null);

  const [busqueda, setBusqueda] = useState('');
  const [resultadosBusqueda, setResultadosBusqueda] = useState({ estados: [], municipios: [], proyectos: [] });
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    setCargandoMapa(true);
    Promise.all([
      client.get('/geo/estados/geojson'),
      client.get('/inicio/mapa'),
      client.get('/proyectos', { params: { limite: 100 } }),
    ])
      .then(([geoRes, mapaRes, proyRes]) => {
        setGeoJSON(geoRes.data);
        setMapaData(mapaRes.data.datos || []);
        setProyectosDisponibles((proyRes.data.datos?.proyectos || []).map(p => ({ id: p.id, nombre: p.nombre })));
      })
      .catch(console.error)
      .finally(() => setCargandoMapa(false));
  }, []);

  // Cargar ZM sólo la primera vez que se cambia de escala
  useEffect(() => {
    if (scale === 'zm' && !zmGeoJSON) {
      client.get('/geo/zm/geojson').then(res => setZmGeoJSON(res.data)).catch(console.error);
    }
  }, [scale, zmGeoJSON]);

  // ─── Datos nacionales filtrados por proyecto (client-side) ────
  const mapaDataFiltrada = useMemo(() => {
    if (!filtroProyecto) return mapaData;
    return mapaData
      .map(e => ({ ...e, proyectos: e.proyectos.filter(p => p.id === filtroProyecto) }))
      .filter(e => e.proyectos.length > 0);
  }, [mapaData, filtroProyecto]);

  const estadosMap = useMemo(
    () => Object.fromEntries(mapaDataFiltrada.map(e => [e.cve_ent, e])),
    [mapaDataFiltrada]
  );
  const maxProy = useMemo(
    () => Math.max(1, ...mapaDataFiltrada.map(e => e.proyectos?.length || 0)),
    [mapaDataFiltrada]
  );

  const estadoIntensidad = useCallback(
    (cve) => (estadosMap[cve] ? (estadosMap[cve].proyectos?.length || 0) / maxProy : 0),
    [estadosMap, maxProy]
  );

  const municipiosActivosSet = useMemo(
    () => new Set(municipiosActividad.map(m => m.cvegeo)),
    [municipiosActividad]
  );
  const municipiosActividadMap = useMemo(
    () => Object.fromEntries(municipiosActividad.map(m => [m.cvegeo, m])),
    [municipiosActividad]
  );

  // ─── Opciones para los selects directos del toolbar ───────────
  const estadosOpciones = useMemo(
    () => (geoJSON?.features || [])
      .map(f => ({ cve_ent: f.properties.cve_ent, nombre: f.properties.nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [geoJSON]
  );
  const municipiosOpciones = useMemo(
    () => (municipiosGeoJSON?.features || [])
      .map(f => ({ cvegeo: f.properties.cvegeo, nombre: f.properties.nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [municipiosGeoJSON]
  );
  const zmOpciones = useMemo(
    () => (zmGeoJSON?.features || [])
      .map(f => ({ gid: f.properties.gid, nombre: f.properties.nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [zmGeoJSON]
  );

  // ─── Cargar detalle + municipios al seleccionar un estado ─────
  async function cargarDetalleEstado(cve_ent, nombre, bounds) {
    setSeleccion({ tipo: 'estado', clave: cve_ent, nombre, bounds });
    setMunicipioSeleccionado(null);
    setCargandoDetalle(true);
    setDetalle(null);
    setMunicipiosGeoJSON(null);
    setMunicipiosActividad([]);
    try {
      const params = filtroProyecto ? { proyecto_id: filtroProyecto } : {};
      const [detRes, muniGeoRes, muniActRes] = await Promise.all([
        client.get(`/geo/territorio/estado/${cve_ent}/detalle`, { params }),
        client.get('/geo/municipios/geojson', { params: { cve_ent } }),
        client.get(`/geo/territorio/estado/${cve_ent}/municipios-actividad`, { params }),
      ]);
      setDetalle(detRes.data.datos);
      setMunicipiosGeoJSON(muniGeoRes.data);
      setMunicipiosActividad(muniActRes.data.datos || []);
    } catch (e) {
      console.error('Error cargando detalle de estado:', e);
    } finally {
      setCargandoDetalle(false);
    }
  }

  async function cargarDetalleZM(gid, nombre, bounds) {
    setSeleccion({ tipo: 'zm', clave: gid, nombre, bounds });
    setMunicipioSeleccionado(null);
    setCargandoDetalle(true);
    setDetalle(null);
    try {
      const params = filtroProyecto ? { proyecto_id: filtroProyecto } : {};
      const res = await client.get(`/geo/territorio/zm/${gid}/detalle`, { params });
      setDetalle(res.data.datos);
    } catch (e) {
      console.error('Error cargando detalle de ZM:', e);
    } finally {
      setCargandoDetalle(false);
    }
  }

  function seleccionarMunicipio(cvegeo, nombre) {
    // Clic en el mapa: solo los municipios activos (guinda) son clicables.
    // Desde el <select> del toolbar sí se permite elegir uno sin actividad,
    // simplemente se muestra su detalle vacío.
    const actividad = municipiosActividadMap[cvegeo];
    setMunicipioSeleccionado({ cvegeo, nombre, etapas: actividad?.etapas || [] });
  }

  function seleccionarEstadoDesdeSelect(cve_ent) {
    if (!cve_ent) return;
    const feature = geoJSON.features.find(f => f.properties.cve_ent === cve_ent);
    const bounds = feature ? L.geoJSON(feature).getBounds() : null;
    cargarDetalleEstado(cve_ent, feature?.properties.nombre, bounds);
  }

  function seleccionarMunicipioDesdeSelect(cvegeo) {
    if (!cvegeo) return;
    const feature = municipiosGeoJSON?.features.find(f => f.properties.cvegeo === cvegeo);
    seleccionarMunicipio(cvegeo, feature?.properties.nombre);
  }

  function seleccionarZmDesdeSelect(gid) {
    if (!gid) return;
    const feature = zmGeoJSON.features.find(f => String(f.properties.gid) === String(gid));
    const bounds = feature ? L.geoJSON(feature).getBounds() : null;
    cargarDetalleZM(Number(gid), feature?.properties.nombre, bounds);
  }

  function volverANacional() {
    setSeleccion(null);
    setDetalle(null);
    setMunicipiosGeoJSON(null);
    setMunicipiosActividad([]);
    setMunicipioSeleccionado(null);
  }

  function volverAEstado() {
    setMunicipioSeleccionado(null);
  }

  // ─── Buscador ──────────────────────────────────────────────────
  useEffect(() => {
    const q = busqueda.trim();
    if (q.length < 2) { setResultadosBusqueda({ estados: [], municipios: [], proyectos: [] }); return; }
    setBuscando(true);
    const t = setTimeout(() => {
      const qLower = q.toLowerCase();
      const estados = (geoJSON?.features || [])
        .filter(f => f.properties.nombre?.toLowerCase().includes(qLower))
        .slice(0, 5)
        .map(f => ({ cve_ent: f.properties.cve_ent, nombre: f.properties.nombre }));
      const proyectos = proyectosDisponibles
        .filter(p => p.nombre.toLowerCase().includes(qLower))
        .slice(0, 5);
      client.get('/geo/municipios/buscar', { params: { q } })
        .then(res => setResultadosBusqueda({ estados, municipios: res.data.datos || [], proyectos }))
        .catch(() => setResultadosBusqueda({ estados, municipios: [], proyectos }))
        .finally(() => setBuscando(false));
    }, 300);
    return () => clearTimeout(t);
  }, [busqueda, geoJSON, proyectosDisponibles]);

  function seleccionarResultadoBusqueda(resultado) {
    setBusqueda('');
    if (resultado.tipo === 'proyecto') {
      setFiltroProyecto(resultado.id);
      return;
    }
    if (resultado.tipo === 'estado') {
      const feature = geoJSON.features.find(f => f.properties.cve_ent === resultado.cve_ent);
      const bounds = feature ? L.geoJSON(feature).getBounds() : null;
      cargarDetalleEstado(resultado.cve_ent, resultado.nombre, bounds);
      return;
    }
    if (resultado.tipo === 'municipio') {
      const feature = geoJSON.features.find(f => f.properties.cve_ent === resultado.cve_ent);
      const bounds = feature ? L.geoJSON(feature).getBounds() : null;
      cargarDetalleEstado(resultado.cve_ent, resultado.nombre_estado, bounds).then(() => {
        seleccionarMunicipio(resultado.cvegeo, resultado.nombre);
      });
    }
  }

  const breadcrumbTexto = seleccion
    ? `Vista nacional › ${seleccion.nombre}${municipioSeleccionado ? ' › ' + municipioSeleccionado.nombre : ''}`
    : 'Vista nacional';

  if (cargandoMapa) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <div className="animate-spin w-6 h-6 border-2 border-[#7B1C3E] border-t-transparent rounded-full mr-3" />
        <span className="text-sm text-gray-500">Cargando mapa territorial…</span>
      </div>
    );
  }

  const estadosGeoJSONActivo = scale === 'zm' ? zmGeoJSON : geoJSON;
  // El endpoint de detalle de ZM espera el gid (PK numérica de geo_zm), no cve_met.
  const propEstado = scale === 'zm' ? 'gid' : 'cve_ent';

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 border-b bg-white">
        <Map size={16} className="text-[#7B1C3E]" />
        <h1 className="text-sm font-semibold text-gray-800">Territorio</h1>
        <span className="text-xs text-gray-400 ml-1">
          {mapaDataFiltrada.length} estado{mapaDataFiltrada.length !== 1 ? 's' : ''} con actividad
        </span>
      </div>

      <Toolbar
        breadcrumb={breadcrumbTexto}
        mostrarVolver={!!seleccion}
        onVolver={volverANacional}
        scale={scale}
        onScale={(s) => { setScale(s); volverANacional(); }}
        proyectos={proyectosDisponibles}
        filtroProyecto={filtroProyecto}
        onFiltroProyecto={setFiltroProyecto}
        busqueda={busqueda}
        onBusqueda={setBusqueda}
        resultados={resultadosBusqueda}
        onSeleccionarResultado={seleccionarResultadoBusqueda}
        buscando={buscando}
        estadosOpciones={estadosOpciones}
        estadoClaveSel={seleccion?.tipo === 'estado' ? seleccion.clave : ''}
        onSeleccionarEstado={seleccionarEstadoDesdeSelect}
        municipiosOpciones={municipiosOpciones}
        municipioClaveSel={municipioSeleccionado?.cvegeo || ''}
        onSeleccionarMunicipio={seleccionarMunicipioDesdeSelect}
        zmOpciones={zmOpciones}
        zmClaveSel={seleccion?.tipo === 'zm' ? seleccion.clave : ''}
        onSeleccionarZm={seleccionarZmDesdeSelect}
      />

      {/* Body: map + sidebar */}
      <div className="flex flex-1 min-h-0">

        {/* Map panel */}
        <div className="relative flex-[3] min-w-0">
          {estadosGeoJSONActivo && (
            <MapaDrillDown
              estadosGeoJSON={estadosGeoJSONActivo}
              propEstado={propEstado}
              estadoActivo={seleccion?.tipo !== 'municipio' ? { cve_ent: seleccion?.clave, bounds: seleccion?.bounds } : null}
              estadoIntensidad={scale === 'estados' ? estadoIntensidad : () => 0.3}
              onClickEstado={(clave, nombre, layer) => {
                if (scale === 'zm') cargarDetalleZM(clave, nombre, layer.getBounds());
                else cargarDetalleEstado(clave, nombre, layer.getBounds());
              }}
              onHoverEstado={setHoveredEstado}
              municipiosGeoJSON={scale === 'estados' ? municipiosGeoJSON : null}
              municipiosActivos={municipiosActivosSet}
              onClickMunicipio={(cvegeo, nombre) => seleccionarMunicipio(cvegeo, nombre)}
              onHoverMunicipio={setHoveredMuni}
            />
          )}

          {/* Tooltip estado */}
          {hoveredEstado && (
            <div className="fixed z-[9999] bg-white border border-gray-200 rounded-lg shadow-lg p-3 w-52 pointer-events-none"
              style={{ left: Math.min(hoveredEstado.x + 12, window.innerWidth - 224), top: Math.min(hoveredEstado.y + 12, window.innerHeight - 180) }}>
              <p className="text-xs font-bold text-[#7B1C3E] mb-1">{hoveredEstado.nombre}</p>
              {(() => {
                const est = estadosMap[hoveredEstado.cve_ent];
                const proys = est?.proyectos || [];
                return proys.length === 0
                  ? <p className="text-xs text-gray-400 italic">Sin actividad</p>
                  : <ul className="space-y-0.5">
                    {proys.slice(0, 5).map(p => (
                      <li key={p.id} className="text-[11px] text-gray-600 truncate flex items-center gap-1">
                        <span className="w-1 h-1 rounded-full bg-[#7B1C3E] flex-shrink-0" />{p.nombre}
                      </li>
                    ))}
                    {proys.length > 5 && <li className="text-[10px] text-gray-400">+{proys.length - 5} más</li>}
                  </ul>;
              })()}
            </div>
          )}

          {/* Tooltip municipio */}
          {hoveredMuni && hoveredMuni.activo && (
            <div className="fixed z-[9999] bg-white border border-gray-200 rounded-lg shadow-lg p-3 w-72 pointer-events-none"
              style={{ left: Math.min(hoveredMuni.x + 12, window.innerWidth - 300), top: Math.min(hoveredMuni.y + 12, window.innerHeight - 240) }}>
              <p className="text-xs font-bold text-[#7B1C3E] mb-0.5">{hoveredMuni.nombre}</p>
              <p className="text-[10px] text-gray-400 font-mono mb-1.5">CVEGEO: {hoveredMuni.cvegeo}</p>
              {(() => {
                const act = municipiosActividadMap[hoveredMuni.cvegeo];
                const etapas = act?.etapas || [];
                return (
                  <>
                    <p className="text-[10px] text-gray-500 mb-1">{etapas.length} etapa{etapas.length !== 1 ? 's' : ''}/acción(es)</p>
                    <ul className="space-y-1.5">
                      {etapas.slice(0, 5).map((et, i) => (
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
                  </>
                );
              })()}
            </div>
          )}

          {/* Leyenda */}
          <div className="absolute bottom-3 left-3 z-[1000] bg-white/90 backdrop-blur-sm rounded-md px-2.5 py-1.5 border border-gray-200 text-[10px]">
            <p className="font-semibold text-gray-600 mb-1">{scale === 'zm' ? 'Zonas metropolitanas' : 'Proyectos por estado'}</p>
            <div className="flex items-center gap-1">
              {[0.15, 0.35, 0.55, 0.75].map((op, i) => (
                <div key={i} className="w-4 h-3 rounded-sm" style={{ backgroundColor: GUINDA, opacity: op }} />
              ))}
              {scale !== 'zm' && <span className="ml-1 text-gray-400">1 → {maxProy}</span>}
            </div>
            {scale === 'estados' && municipiosGeoJSON && (
              <div className="flex items-center gap-1 mt-1 pt-1 border-t border-gray-100">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: GUINDA, opacity: 0.7 }} />
                <span className="text-gray-400">municipio con actividad</span>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="flex-[2] min-w-0 border-l border-gray-100 bg-white overflow-hidden flex flex-col">
          {cargandoDetalle
            ? <div className="flex items-center justify-center h-full gap-2 text-gray-400">
              <div className="animate-spin w-4 h-4 border-2 border-[#7B1C3E] border-t-transparent rounded-full" />
              <span className="text-sm">Cargando detalle…</span>
            </div>
            : municipioSeleccionado
              ? <SidebarDetalleMunicipio
                  municipio={municipioSeleccionado}
                  onVolver={volverAEstado}
                  breadcrumb={`Volver a ${seleccion?.nombre}`}
                />
              : detalle
                ? <SidebarDetalleEstadoZM
                    detalle={detalle}
                    tipo={seleccion?.tipo}
                    onVolver={volverANacional}
                    breadcrumb="Volver a vista nacional"
                  />
                : <SidebarVacia />
          }
        </div>
      </div>
    </div>
  );
}
