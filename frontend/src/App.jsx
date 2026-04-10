/**
 * ARCHIVO: App.jsx
 * PROPÓSITO: Componente raíz que decide si mostrar Login o la app principal.
 *
 * MINI-CLASE: Componente raíz y redirección condicional
 * ─────────────────────────────────────────────────────────────────
 * App.jsx es el primer componente que React renderiza. Consulta
 * AuthContext para saber si hay un usuario autenticado. Si no hay
 * sesión, muestra Login. Si hay sesión, muestra el Layout principal
 * con el router de páginas internas. Este patrón evita que usuarios
 * no autenticados accedan a rutas protegidas.
 * ─────────────────────────────────────────────────────────────────
 */
import { useAuth } from './context/AuthContext';
import { useUI } from './context/UIContext';
import AppRouter from './router';
import Login from './pages/Login';
import Toast from './components/common/Toast';

export default function App() {
  const { usuario, cargando } = useAuth();
  const { toast } = useUI();

  // Pantalla de carga mientras verifica si hay sesión activa
  if (cargando) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-guinda-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 text-sm">Cargando PSPP...</p>
        </div>
      </div>
    );
  }

  // Si no hay usuario autenticado, mostrar login
  if (!usuario) {
    return (
      <>
        <Login />
        {toast && <Toast mensaje={toast.mensaje} tipo={toast.tipo} />}
      </>
    );
  }

  // Usuario autenticado: mostrar la app principal con router
  return (
    <>
      <AppRouter />
      {toast && <Toast mensaje={toast.mensaje} tipo={toast.tipo} />}
    </>
  );
}
