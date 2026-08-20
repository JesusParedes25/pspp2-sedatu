/**
 * ARCHIVO: Layout.jsx
 * PROPÓSITO: Layout principal con sidebar y header que envuelve todas las páginas.
 *
 * MINI-CLASE: Outlet de React Router
 * ─────────────────────────────────────────────────────────────────
 * React Router v6 usa <Outlet /> para renderizar la ruta hija activa
 * dentro de un layout compartido. El Layout define la estructura
 * visual (sidebar + header + contenido) y el Outlet se reemplaza
 * dinámicamente por la página correspondiente a la URL actual.
 * Esto evita duplicar sidebar y header en cada página.
 *
 * MINI-CLASE: una sola fuente para el contador de la campanita
 * ─────────────────────────────────────────────────────────────────
 * El resumen de pendientes (useCentroNotificaciones) se pide UNA vez
 * aquí, no dentro de Header. Si cada quien lo pidiera por su cuenta, al
 * aceptar una invitación desde el modal el número de la campanita
 * seguiría mostrando el valor viejo hasta el siguiente polling (30s) —
 * el usuario acaba de resolver algo y el aviso que se lo recordaba
 * sigue ahí, como si no hubiera pasado nada. Con una sola instancia,
 * cualquiera que resuelva algo llama a `recargarResumen` y la campanita
 * se pone al día al instante. Outlet context lo lleva hasta las páginas
 * (Notificaciones, por ejemplo) sin tener que pasarlo prop por prop a
 * través de rutas que no lo necesitan.
 * ─────────────────────────────────────────────────────────────────
 */
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import { useUI } from '../../context/UIContext';
import { useCentroNotificaciones } from '../../hooks/useCentroNotificaciones';
import ModalPendientesInicioSesion from '../notificaciones/ModalPendientesInicioSesion';

export default function Layout() {
  const { sidebarAbierto } = useUI();
  const { total, recargar: recargarResumen } = useCentroNotificaciones();

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: '#F5F5F0' }}>
      <Sidebar />
      <div className={`flex-1 min-w-0 flex flex-col transition-all duration-300 ${sidebarAbierto ? 'ml-64' : 'ml-16'}`}>
        <Header pendientes={total} />
        <main className="flex-1 min-w-0 p-6 overflow-auto">
          <Outlet context={{ recargarResumen }} />
        </main>
      </div>
      <ModalPendientesInicioSesion onResuelto={recargarResumen} />
    </div>
  );
}
