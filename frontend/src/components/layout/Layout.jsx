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
 * ─────────────────────────────────────────────────────────────────
 */
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import { useUI } from '../../context/UIContext';

export default function Layout() {
  const { sidebarAbierto } = useUI();

  return (
    <div className="min-h-screen flex bg-gray-50">
      <Sidebar />
      <div className={`flex-1 flex flex-col transition-all duration-300 ${sidebarAbierto ? 'ml-64' : 'ml-16'}`}>
        <Header />
        <main className="flex-1 p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
