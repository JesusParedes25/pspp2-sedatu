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
import {
  LayoutDashboard, FolderKanban, CalendarDays, Bell,
  PlusCircle, ChevronLeft, ChevronRight, LogOut, FileText
} from 'lucide-react';

// Definición de items del menú principal
// requiereCrear: true = solo visible si el rol puede crear proyectos
const menuItems = [
  { to: '/', icono: LayoutDashboard, etiqueta: 'Inicio', end: true },
  { to: '/proyectos', icono: FolderKanban, etiqueta: 'Proyectos' },
  { to: '/proyectos/nuevo', icono: PlusCircle, etiqueta: 'Nuevo proyecto', requiereCrear: true },
  { to: '/agenda', icono: CalendarDays, etiqueta: 'Agenda' },
  { to: '/evidencias', icono: FileText, etiqueta: 'Evidencias' },
  { to: '/notificaciones', icono: Bell, etiqueta: 'Notificaciones' },
];

export default function Sidebar() {
  const { sidebarAbierto, toggleSidebar } = useUI();
  const { usuario, logout } = useAuth();

  return (
    <aside className={`fixed top-0 left-0 h-screen bg-guinda-700 text-white flex flex-col transition-all duration-300 z-30 ${sidebarAbierto ? 'w-64' : 'w-16'}`}>
      {/* Logo y título */}
      <div className="flex items-center h-16 px-4 border-b border-guinda-600">
        <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center flex-shrink-0">
          <span className="text-guinda-700 font-bold text-sm">PS</span>
        </div>
        {sidebarAbierto && (
          <div className="ml-3 overflow-hidden">
            <p className="font-bold text-sm leading-tight">PSPP v2.0</p>
            <p className="text-guinda-200 text-xs">SEDATU</p>
          </div>
        )}
      </div>

      {/* Navegación principal */}
      <nav className="flex-1 py-4 space-y-1 px-2">
        {menuItems.filter(item => !item.requiereCrear || usuario?.rol !== 'Operativo').map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex items-center px-3 py-2.5 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-guinda-500 text-white font-medium'
                  : 'text-guinda-100 hover:bg-guinda-600 hover:text-white'
              }`
            }
          >
            <item.icono size={20} className="flex-shrink-0" />
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
          className="flex items-center w-full px-3 py-2 rounded-lg text-sm text-guinda-100 hover:bg-guinda-600 hover:text-white transition-colors"
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
