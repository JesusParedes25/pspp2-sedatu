/**
 * ARCHIVO: Sidebar.jsx
 * PROPÓSITO: Barra lateral de navegación con menú principal de PSPP.
 *
 * MINI-CLASE: Navegación con NavLink de React Router
 * ─────────────────────────────────────────────────────────────────
 * NavLink es como Link pero con awareness de la ruta activa: agrega
 * automáticamente una clase CSS cuando la URL coincide con su "to".
 * Esto permite resaltar visualmente la sección actual del menú sin
 * lógica condicional manual. El sidebar se colapsa a solo íconos
 * cuando sidebarAbierto es false.
 * ─────────────────────────────────────────────────────────────────
 */
import { NavLink } from 'react-router-dom';
import { useUI } from '../../context/UIContext';
import { useAuth } from '../../context/AuthContext';
import { useMisPendientes } from '../../hooks/useMisPendientes';
import {
  LayoutDashboard, FolderKanban, Bell,
  PlusCircle, ChevronLeft, ChevronRight, LogOut, FileText, Map, Shield, ListChecks
} from 'lucide-react';

// Definición de items del menú principal
// requiereCrear: true = solo visible si el rol puede crear proyectos
const menuItems = [
  { to: '/', icono: LayoutDashboard, etiqueta: 'Tablero', end: true },
  { to: '/mis-actividades', icono: ListChecks, etiqueta: 'Mis actividades' },
  { to: '/proyectos', icono: FolderKanban, etiqueta: 'Proyectos' },
  { to: '/proyectos/nuevo', icono: PlusCircle, etiqueta: 'Nuevo proyecto', requiereCrear: true },
  { to: '/mapa', icono: Map, etiqueta: 'Territorio' },
  { to: '/evidencias', icono: FileText, etiqueta: 'Evidencias' },
  { to: '/notificaciones', icono: Bell, etiqueta: 'Notificaciones' },
  { to: '/admin/catalogos', icono: Shield, etiqueta: 'Administración', requiereRol: 'superadmin' },
];

export default function Sidebar() {
  const { sidebarAbierto, toggleSidebar } = useUI();
  const { usuario, logout } = useAuth();
  const { vencidas } = useMisPendientes();

  return (
    <aside className={`fixed top-0 left-0 h-screen bg-guinda-700 text-white flex flex-col transition-all duration-300 z-30 ${sidebarAbierto ? 'w-64' : 'w-16'}`}>
      {/* Logo SEDATU */}
      <div className={`flex flex-col items-center justify-center border-b border-guinda-600 transition-all duration-300 ${
        sidebarAbierto ? 'h-28 px-4 py-3' : 'h-16 px-2'
      }`}>
        {sidebarAbierto ? (
          <>
            <img
              src="/sedatu-logo.png"
              alt="SEDATU"
              className="w-40 object-contain"
              style={{ filter: 'brightness(0) invert(1)' }}
            />
            <p className="text-white text-[11px] mt-1" style={{ opacity: 0.7 }}>PSPP v2.0</p>
          </>
        ) : (
          <img
            src="/sedatu-logo.png"
            alt="SEDATU"
            className="w-10 object-contain"
            style={{ filter: 'brightness(0) invert(1)' }}
          />
        )}
      </div>

      {/* Navegación principal */}
      <nav className="flex-1 py-4 space-y-1 px-2">
        {menuItems.filter(item => {
          if (item.requiereRol && usuario?.rol !== item.requiereRol) return false;
          if (item.requiereCrear && usuario?.rol === 'Operativo') return false;
          return true;
        }).map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex items-center px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-white/15 text-white border-l-2 border-white'
                  : 'text-white/80 hover:bg-white/10 hover:text-white'
              }`
            }
          >
            <span className="relative flex-shrink-0">
              <item.icono size={20} />
              {item.to === '/mis-actividades' && vencidas > 0 && (
                <span className={`absolute bg-red-500 text-white rounded-full flex items-center justify-center font-bold ${
                  sidebarAbierto ? '-top-1 -right-1.5 text-[9px] w-4 h-4' : '-top-1 -right-1 text-[8px] w-3.5 h-3.5'
                }`}>
                  {vencidas > 9 ? '9+' : vencidas}
                </span>
              )}
            </span>
            {sidebarAbierto && <span className="ml-3">{item.etiqueta}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Info del usuario y logout */}
      <div className="border-t border-guinda-600 p-3">
        {sidebarAbierto && usuario && (
          <div className="mb-3 px-1">
            <p className="text-sm font-medium truncate">{usuario.nombre_completo}</p>
            <p className="text-guinda-200 text-xs truncate">{usuario.dg_siglas}{usuario.direccion_area_siglas ? ` / ${usuario.direccion_area_siglas}` : ''}</p>
            <p className="text-guinda-300 text-xs truncate">{usuario.cargo}</p>
          </div>
        )}
        <button
          onClick={logout}
          className="flex items-center w-full px-3 py-2 rounded-md text-sm font-medium text-white/75 hover:bg-white/10 hover:text-white transition-colors"
        >
          <LogOut size={20} className="flex-shrink-0" />
          {sidebarAbierto && <span className="ml-3">Cerrar sesión</span>}
        </button>
      </div>

      {/* Botón colapsar/expandir */}
      <button
        onClick={toggleSidebar}
        className="absolute -right-3 top-20 w-6 h-6 bg-guinda-500 rounded-full flex items-center justify-center text-white shadow-md hover:bg-guinda-400 transition-colors"
      >
        {sidebarAbierto ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
      </button>
    </aside>
  );
}
