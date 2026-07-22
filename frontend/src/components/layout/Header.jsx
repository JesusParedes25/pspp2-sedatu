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
import { useLocation, Link } from 'react-router-dom';
import { Bell, Search } from 'lucide-react';
import { useNotificaciones } from '../../hooks/useNotificaciones';

// Mapeo de segmentos de URL a nombres legibles
const nombresRutas = {
  '': 'Inicio',
  'proyectos': 'Proyectos',
  'nuevo': 'Nuevo proyecto',
  'mapa': 'Territorio',
  'agenda': 'Agenda',
  'notificaciones': 'Notificaciones',
};

export default function Header() {
  const location = useLocation();
  const { noLeidas } = useNotificaciones();

  // Generar breadcrumb desde la URL actual
  const segmentos = location.pathname.split('/').filter(Boolean);
  const breadcrumbs = segmentos.map((segmento, indice) => {
    const ruta = '/' + segmentos.slice(0, indice + 1).join('/');
    const nombre = nombresRutas[segmento] || 'Detalle';
    return { nombre, ruta };
  });

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
            placeholder="Buscar proyecto..."
            className="pl-9 pr-4 py-1.5 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-guinda-500"
            style={{ border: '1px solid #E5E5E5', borderRadius: '6px', color: '#545454', fontFamily: 'Noto Sans' }}
          />
        </div>

        {/* Badge de notificaciones */}
        <Link
          to="/notificaciones"
          className="relative p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-guinda-500 transition-colors"
        >
          <Bell size={20} />
          {noLeidas > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
              {noLeidas > 9 ? '9+' : noLeidas}
            </span>
          )}
        </Link>
      </div>
    </header>
  );
}
