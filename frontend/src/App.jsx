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
import { useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { useUI } from './context/UIContext';
import AppRouter from './router';
import Login from './pages/Login';
import ActivarCuenta from './pages/ActivarCuenta';
import SolicitarRecuperacion from './pages/SolicitarRecuperacion';
import RestablecerContrasena from './pages/RestablecerContrasena';
import Toast from './components/common/Toast';

// Rutas alcanzables SIN sesión iniciada, sin importar si hay un usuario
// autenticado en este navegador o no (p. ej. alguien cerró sesión en otra
// pestaña y ahora abre un link de activación/recuperación en esta). Antes de
// este fix, App devolvía <Login/> para CUALQUIER ruta cuando no había
// usuario, ignorando la URL — así que /activar-cuenta y /restablecer-contrasena
// nunca mostraban su formulario para alguien deslogueado.
const RUTAS_PUBLICAS = {
  '/activar-cuenta': ActivarCuenta,
  '/solicitar-recuperacion': SolicitarRecuperacion,
  '/restablecer-contrasena': RestablecerContrasena,
};

export default function App() {
  const { usuario, cargando } = useAuth();
  const { toast } = useUI();
  const location = useLocation();

  const PaginaPublica = RUTAS_PUBLICAS[location.pathname];
  if (PaginaPublica) {
    return (
      <>
        <PaginaPublica />
        {toast && <Toast mensaje={toast.mensaje} tipo={toast.tipo} />}
      </>
    );
  }

  // Pantalla de carga mientras verifica si hay sesión activa
  if (cargando) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F5F5F0' }}>
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
