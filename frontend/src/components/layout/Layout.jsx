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

  // h-screen + overflow-hidden (no min-h-screen): con "min", el alto real
  // de todo esto termina dependiendo del contenido — cualquier página con
  // contenido "alto" empuja TODO el shell más allá de 100vh y es la
  // ventana la que termina scrolleando, en vez de que main() recorte y
  // scrollee internamente. Con un alto fijo real, main sí actúa como el
  // contenedor con scroll que su overflow-auto siempre quiso ser, y cada
  // página puede apoyarse en flex-1/h-full de verdad para ocupar el resto
  // del viewport (en vez de medir con JavaScript, que es frágil).
  return (
    <div className="h-screen flex overflow-hidden" style={{ backgroundColor: '#F5F5F0' }}>
      <Sidebar />
      <div className={`flex-1 min-w-0 min-h-0 flex flex-col h-screen transition-all duration-300 ${sidebarAbierto ? 'ml-64' : 'ml-16'}`}>
        <Header />
        <main className="flex-1 min-w-0 min-h-0 p-6 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
