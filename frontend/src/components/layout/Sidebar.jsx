/**
 * ARCHIVO: Sidebar.jsx
 * PROPÓSITO: Barra lateral de navegación con menú principal de PSPP.
 *
 * MINI-CLASE: Navegación con NavLink de React Router, y subsecciones
 * ─────────────────────────────────────────────────────────────────
 * NavLink es como Link pero con awareness de la ruta activa: agrega
 * automáticamente una clase CSS cuando la URL coincide con su "to".
 * Esto permite resaltar visualmente la sección actual del menú sin
 * lógica condicional manual. El sidebar se colapsa a solo íconos
 * cuando sidebarAbierto es false.
 *
 * Cuatro ítems (Mis actividades, Proyectos, Notificaciones,
 * Administración) tienen `children` (o `groups` de children, en el
 * caso de Administración) — al hacer clic se expanden mostrando sus
 * subsecciones indentadas, que navegan a la misma ruta que ya usa la
 * página (con `?tab=`/`?vista=`, el mismo query param que cada página
 * ya lee vía useSearchParams) — no son rutas nuevas, solo se expone en
 * el sidebar un atajo directo a un tab que antes solo vivía dentro del
 * contenido. El resto de ítems (Tablero, Territorio, Documentos) se
 * quedan como enlaces simples: no tienen vistas de contenido distintas
 * que valga la pena exponer como subsección — forzarlo ahí generaría
 * ruido sin ningún beneficio real.
 *
 * NavLink no compara query strings para decidir "isActive" (solo
 * pathname), así que las subsecciones NO usan NavLink — su estado
 * activo se calcula a mano contra `useLocation()` (pathname + el query
 * param que le corresponda a cada ítem). El ítem padre sigue usando la
 * misma idea: activo si el pathname actual es su `base` o cae debajo
 * de ella.
 * ─────────────────────────────────────────────────────────────────
 */
import { useState, useEffect } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { useUI } from '../../context/UIContext';
import { useAuth } from '../../context/AuthContext';
import { useMisPendientes } from '../../hooks/useMisPendientes';
import { usePermisosGlobales } from '../../hooks/usePermisos';
import {
  LayoutDashboard, FolderKanban, Bell, PlusCircle, ChevronLeft, ChevronRight,
  ChevronDown, LogOut, FileText, Map, Shield, ListChecks, ListTodo, CalendarDays,
  List, Briefcase, Inbox, History, Users, Building2, Landmark, BarChart3, KeyRound,
  Trash2, Settings,
} from 'lucide-react';

// Definición de items del menú principal.
// requiereCrear: true = solo visible si el rol puede crear proyectos.
// `base` + `children`/`groups` = ítem expandible: `base` es el pathname
// de la página, cada child trae su propio `to` (con el query param que
// la página ya lee) y `param`/`paramKey` (paramKey por default 'tab')
// para poder calcular cuál subsección está activa. `default: true` en
// un child marca cuál se considera activa cuando el pathname coincide
// pero todavía no hay query param en la URL (la página cae a su propio
// default interno) — Notificaciones no lo usa porque su default es
// dinámico (depende de si hay pendientes), no fijo.
const menuItems = [
  { to: '/', icono: LayoutDashboard, etiqueta: 'Tablero', end: true },
  {
    id: 'actividades', base: '/mis-actividades', icono: ListChecks, etiqueta: 'Mis actividades',
    children: [
      { to: '/mis-actividades?tab=pendientes', param: 'pendientes', etiqueta: 'Pendientes', icono: ListTodo, default: true },
      { to: '/mis-actividades?tab=agenda', param: 'agenda', etiqueta: 'Agenda', icono: CalendarDays },
    ],
  },
  {
    id: 'proyectos', base: '/proyectos', icono: FolderKanban, etiqueta: 'Proyectos',
    children: [
      { to: '/proyectos?vista=todos', param: 'todos', paramKey: 'vista', etiqueta: 'Todos los proyectos', icono: List },
      { to: '/proyectos?vista=agrupado', param: 'agrupado', paramKey: 'vista', etiqueta: 'Carteras de proyectos', icono: Briefcase, default: true },
      { to: '/proyectos/nuevo', esRutaPropia: true, etiqueta: 'Nuevo proyecto', icono: PlusCircle, requiereCrear: true },
    ],
  },
  {
    id: 'indicadores', base: '/indicadores', icono: BarChart3, etiqueta: 'Indicadores',
    children: [
      { to: '/indicadores', param: 'mios', paramKey: 'vista', etiqueta: 'Mis indicadores', icono: BarChart3, default: true },
      { to: '/indicadores?vista=catalogo', param: 'catalogo', paramKey: 'vista', etiqueta: 'Catálogo', icono: List },
    ],
  },
  { to: '/mapa', icono: Map, etiqueta: 'Territorio' },
  { to: '/evidencias', icono: FileText, etiqueta: 'Documentos' },
  {
    id: 'notificaciones', base: '/notificaciones', icono: Bell, etiqueta: 'Notificaciones',
    children: [
      { to: '/notificaciones?tab=pendientes', param: 'pendientes', etiqueta: 'Pendientes', icono: Inbox },
      { to: '/notificaciones?tab=historial', param: 'historial', etiqueta: 'Historial', icono: History },
    ],
  },
  {
    id: 'administracion', base: '/admin/catalogos', icono: Shield, etiqueta: 'Administración', requiereRol: 'superadmin',
    groups: [
      {
        titulo: 'Personas', children: [
          { to: '/admin/catalogos?tab=usuarios', param: 'usuarios', etiqueta: 'Usuarios', icono: Users },
          { to: '/admin/catalogos?tab=areas', param: 'areas', etiqueta: 'Áreas', icono: Building2 },
        ],
      },
      {
        titulo: 'Datos y catálogos', children: [
          { to: '/admin/catalogos?tab=catalogos', param: 'catalogos', etiqueta: 'Catálogos', icono: Shield, default: true },
          { to: '/admin/catalogos?tab=programas', param: 'programas', etiqueta: 'Programas', icono: Landmark },
          { to: '/admin/catalogos?tab=indicadores', param: 'indicadores', etiqueta: 'Indicadores', icono: BarChart3 },
          { to: '/admin/catalogos?tab=api', param: 'api', etiqueta: 'API', icono: KeyRound },
        ],
      },
      {
        titulo: 'Sistema', children: [
          { to: '/admin/catalogos?tab=papelera', param: 'papelera', etiqueta: 'Papelera', icono: Trash2 },
          { to: '/admin/catalogos?tab=config', param: 'config', etiqueta: 'Configuración', icono: Settings },
        ],
      },
    ],
  },
];

// Aplana groups→children para poder filtrar por rol/permiso y calcular
// la subsección activa sin duplicar esa lógica entre Administración
// (agrupada) y el resto (plana).
function hijosDe(item) {
  if (item.children) return item.children;
  if (item.groups) return item.groups.flatMap(g => g.children);
  return [];
}

function childActivo(child, pathname, searchParams) {
  const key = child.paramKey || 'tab';
  const valorUrl = searchParams.get(key);
  if (valorUrl) return valorUrl === child.param;
  if (child.esRutaPropia) return pathname === child.to.split('?')[0];
  return !!child.default;
}

export default function Sidebar({ pendientesNotificaciones = 0 }) {
  const { sidebarAbierto, toggleSidebar } = useUI();
  const { usuario, logout } = useAuth();
  const { puedeCrearProyecto } = usePermisosGlobales();
  const { vencidas } = useMisPendientes();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const BADGES = { actividades: vencidas, notificaciones: pendientesNotificaciones };

  const itemsVisibles = menuItems
    .filter(item => {
      if (item.requiereRol && usuario?.rol !== item.requiereRol) return false;
      return true;
    })
    .map(item => {
      if (!item.children && !item.groups) return item;
      const filtrarChild = c => !(c.requiereCrear && !puedeCrearProyecto);
      if (item.children) return { ...item, children: item.children.filter(filtrarChild) };
      return { ...item, groups: item.groups.map(g => ({ ...g, children: g.children.filter(filtrarChild) })).filter(g => g.children.length > 0) };
    });

  function itemEsActivo(item) {
    if (!item.base) return false;
    return location.pathname === item.base || location.pathname.startsWith(item.base + '/');
  }

  const idActivoPorRuta = itemsVisibles.find(it => (it.children || it.groups) && itemEsActivo(it))?.id ?? null;

  // Acordeón: un ítem expandido a la vez. `undefined` = "sigue lo que
  // diga la ruta actual"; string|null = forzado manualmente por un
  // clic, hasta que se navegue a otra sección de primer nivel.
  const [expandidoManual, setExpandidoManual] = useState(undefined);
  useEffect(() => { setExpandidoManual(undefined); }, [location.pathname]);
  const expandidoId = expandidoManual !== undefined ? expandidoManual : idActivoPorRuta;

  function alternarExpandido(id) {
    setExpandidoManual(prev => {
      const actual = prev !== undefined ? prev : idActivoPorRuta;
      return actual === id ? null : id;
    });
  }

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
      <nav className="flex-1 py-4 space-y-1 px-2 overflow-y-auto">
        {itemsVisibles.map(item => {
          const hijos = hijosDe(item);
          const badge = BADGES[item.id] ?? BADGES[item.to];

          if (hijos.length === 0) {
            return (
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
                  {badge > 0 && (
                    <span className={`absolute bg-red-500 text-white rounded-full flex items-center justify-center font-bold ${
                      sidebarAbierto ? '-top-1 -right-1.5 text-[9px] w-4 h-4' : '-top-1 -right-1 text-[8px] w-3.5 h-3.5'
                    }`}>
                      {badge > 9 ? '9+' : badge}
                    </span>
                  )}
                </span>
                {sidebarAbierto && <span className="ml-3">{item.etiqueta}</span>}
              </NavLink>
            );
          }

          const activo = itemEsActivo(item);
          const expandido = sidebarAbierto && expandidoId === item.id;

          return (
            <div key={item.id}>
              <button
                onClick={() => alternarExpandido(item.id)}
                className={`flex items-center w-full px-3 py-2.5 rounded-md text-sm font-medium transition-colors text-left ${
                  activo
                    ? 'bg-white/15 text-white border-l-2 border-white'
                    : 'text-white/80 hover:bg-white/10 hover:text-white'
                }`}
              >
                <span className="relative flex-shrink-0">
                  <item.icono size={20} />
                  {badge > 0 && (
                    <span className={`absolute bg-red-500 text-white rounded-full flex items-center justify-center font-bold ${
                      sidebarAbierto ? '-top-1 -right-1.5 text-[9px] w-4 h-4' : '-top-1 -right-1 text-[8px] w-3.5 h-3.5'
                    }`}>
                      {badge > 9 ? '9+' : badge}
                    </span>
                  )}
                </span>
                {sidebarAbierto && (
                  <>
                    <span className="ml-3 flex-1">{item.etiqueta}</span>
                    <ChevronDown size={15} className={`flex-shrink-0 opacity-70 transition-transform ${expandido ? 'rotate-180' : ''}`} />
                  </>
                )}
              </button>

              {expandido && (
                <div className="mt-0.5 mb-1.5 ml-[26px] pl-3 border-l border-white/15 flex flex-col gap-0.5">
                  {item.groups
                    ? item.groups.map(grupo => (
                        <div key={grupo.titulo}>
                          <p className="px-2.5 pt-1.5 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/40">{grupo.titulo}</p>
                          {grupo.children.map(child => (
                            <SubItem key={child.to} child={child} activo={childActivo(child, location.pathname, searchParams)} />
                          ))}
                        </div>
                      ))
                    : item.children.map(child => (
                        <SubItem key={child.to} child={child} activo={childActivo(child, location.pathname, searchParams)} />
                      ))}
                </div>
              )}
            </div>
          );
        })}
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

function SubItem({ child, activo }) {
  return (
    <Link
      to={child.to}
      className={`flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs font-medium transition-colors ${
        activo ? 'bg-white/15 text-white' : 'text-white/65 hover:bg-white/10 hover:text-white'
      }`}
    >
      <child.icono size={14} className="flex-shrink-0" />
      <span className="truncate">{child.etiqueta}</span>
    </Link>
  );
}
