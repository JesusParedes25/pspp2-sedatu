/**
 * ARCHIVO: Header.jsx
 * PROPÓSITO: Barra superior con breadcrumb, búsqueda y badge de notificaciones.
 *
 * MINI-CLASE: useLocation de React Router
 * ─────────────────────────────────────────────────────────────────
 * useLocation() devuelve el objeto de la URL actual con pathname,
 * search y hash. Lo usamos para generar el breadcrumb dinámicamente:
 * /proyectos/abc-123 → ["Inicio", "Proyectos", "Detalle"]. Esto
 * le da contexto visual al usuario sobre dónde está dentro de la
 * plataforma sin necesidad de un sistema de breadcrumbs complejo.
 * ─────────────────────────────────────────────────────────────────
 */
import { useState, useEffect } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { Bell, Search, FolderKanban } from 'lucide-react';
import * as proyectosApi from '../../api/proyectos';

// Mapeo de segmentos de URL a nombres legibles
const nombresRutas = {
  '': 'Inicio',
  'proyectos': 'Proyectos',
  'carteras': 'Carteras',
  'nuevo': 'Nuevo proyecto',
  'mapa': 'Territorio',
  'agenda': 'Agenda',
  'notificaciones': 'Notificaciones',
};

export default function Header({ pendientes = 0 }) {
  const location = useLocation();
  const navigate = useNavigate();

  // Generar breadcrumb desde la URL actual
  const segmentos = location.pathname.split('/').filter(Boolean);
  const breadcrumbs = segmentos.map((segmento, indice) => {
    const ruta = '/' + segmentos.slice(0, indice + 1).join('/');
    const nombre = nombresRutas[segmento] || 'Detalle';
    return { nombre, ruta };
  });

  // Búsqueda de proyectos — antes este input no tenía value/onChange ni
  // ningún manejador, era puramente decorativo (no hacía nada al escribir
  // ni al dar Enter). Mismo patrón de debounce + dropdown que ya usa el
  // buscador de Territorio (MapaTerritorial.jsx): 300ms, mínimo 2
  // caracteres, contra el mismo endpoint de listado con `busqueda` que ya
  // filtra en el servidor (ILIKE sobre nombre/descripción).
  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [mostrarResultados, setMostrarResultados] = useState(false);

  useEffect(() => {
    const q = busqueda.trim();
    if (q.length < 2) { setResultados([]); return; }
    setBuscando(true);
    const t = setTimeout(() => {
      proyectosApi.listarProyectos({ busqueda: q, limite: 6 })
        .then(res => setResultados(res.datos?.proyectos || []))
        .catch(() => setResultados([]))
        .finally(() => setBuscando(false));
    }, 300);
    return () => clearTimeout(t);
  }, [busqueda]);

  function irAProyecto(id) {
    navigate(`/proyectos/${id}`);
    setBusqueda('');
    setResultados([]);
    setMostrarResultados(false);
  }

  // Enter navega al primer resultado — mismo criterio que el reporte
  // esperaba ("presioné Enter; no apareció ningún resultado ni ocurrió
  // ninguna navegación").
  function alPresionarEnter(e) {
    if (e.key === 'Enter' && resultados.length > 0) {
      irAProyecto(resultados[0].id);
    }
  }

  return (
    <header className="h-16 bg-white flex items-center justify-between px-6 flex-shrink-0" style={{ borderBottom: '1px solid #E5E5E5' }}>
      {/* Breadcrumb */}
      <div className="flex items-center text-sm">
        <Link to="/" className="transition-colors" style={{ color: '#98989A' }} onMouseEnter={e => e.target.style.color='#7B1C3E'} onMouseLeave={e => e.target.style.color='#98989A'}>
          Inicio
        </Link>
        {breadcrumbs.map((bc, i) => (
          <span key={i} className="flex items-center">
            <span className="mx-2" style={{ color: '#E5E5E5' }}>/</span>
            {i === breadcrumbs.length - 1 ? (
              <span className="font-semibold" style={{ color: '#545454' }}>{bc.nombre}</span>
            ) : (
              <Link to={bc.ruta} className="transition-colors" style={{ color: '#98989A' }} onMouseEnter={e => e.target.style.color='#7B1C3E'} onMouseLeave={e => e.target.style.color='#98989A'}>
                {bc.nombre}
              </Link>
            )}
          </span>
        ))}
      </div>

      {/* Acciones del header */}
      <div className="flex items-center space-x-4">
        {/* Búsqueda rápida */}
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={busqueda}
            onChange={e => { setBusqueda(e.target.value); setMostrarResultados(true); }}
            onFocus={() => setMostrarResultados(true)}
            onBlur={() => setTimeout(() => setMostrarResultados(false), 150)}
            onKeyDown={alPresionarEnter}
            placeholder="Buscar proyecto..."
            className="pl-9 pr-4 py-1.5 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-guinda-500"
            style={{ border: '1px solid #E5E5E5', borderRadius: '6px', color: '#545454', fontFamily: 'Noto Sans' }}
          />
          {mostrarResultados && busqueda.trim().length >= 2 && (
            <div className="absolute z-[1100] top-full mt-1 right-0 w-72 bg-white border border-gray-200 rounded-lg shadow-lg max-h-72 overflow-y-auto">
              {buscando && <div className="px-3 py-2 text-xs text-gray-400">Buscando…</div>}
              {!buscando && resultados.length === 0 && (
                <div className="px-3 py-2 text-xs text-gray-400">Sin resultados</div>
              )}
              {resultados.map(p => (
                <button key={p.id} onMouseDown={() => irAProyecto(p.id)}
                  className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                  <FolderKanban size={13} className="text-gray-400 flex-shrink-0" />
                  <span className="truncate">{p.nombre}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Badge de notificaciones */}
        <Link
          to="/notificaciones"
          className="relative p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-guinda-500 transition-colors"
        >
          <Bell size={20} />
          {pendientes > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
              {pendientes > 9 ? '9+' : pendientes}
            </span>
          )}
        </Link>
      </div>
    </header>
  );
}
