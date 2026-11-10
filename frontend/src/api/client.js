/**
 * ARCHIVO: client.js
 * PROPÓSITO: Instancia central de axios con JWT y manejo de errores.
 *
 * NOTA TÉCNICA: Interceptores de Axios
 * ─────────────────────────────────────────────────────────────────
 * Los interceptores son middlewares del lado del cliente: funciones
 * que se ejecutan automáticamente antes de cada request o después
 * de cada response. El interceptor de request agrega el JWT header
 * en TODAS las peticiones sin que cada función de api/ lo haga
 * manualmente. El de response captura errores 401 (token expirado)
 * de forma centralizada y redirige al login.
 * ─────────────────────────────────────────────────────────────────
 */
import axios from 'axios';
import { TIEMPO_NORMAL_MS } from './limites';

// TIEMPO_NORMAL_MS (30 s) es el límite de las peticiones normales. Las
// subidas, descargas grandes y operaciones de proceso largo NO usan este
// valor: ver api/limites.js y api/transferencias.js.
const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
  timeout: TIEMPO_NORMAL_MS,
});

// Antes de cada petición: inyectar el JWT si existe en sessionStorage.
// sessionStorage (no localStorage), a pedido de la DGTIC: una pestaña
// nueva no hereda la sesión (hay que iniciar sesión otra vez) y cerrar la
// pestaña la cierra — ver frontend/src/context/AuthContext.jsx.
client.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('pspp_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Mensaje distinto según POR QUÉ se cerró la sesión — ver Login.jsx, que
// lee y borra esta clave en su primer render. "Token inválido"
// (AUTH_TOKEN_INVALID) y la ausencia de token (AUTH_TOKEN_MISSING) caen
// en el aviso genérico: no son algo que la persona pueda entender como
// "pasó tiempo" o "algo cambió en tu cuenta".
const MOTIVOS_SESION = {
  AUTH_TOKEN_EXPIRED: 'inactividad',
  AUTH_SESSION_MAX_AGE: 'maximo',
  AUTH_SESSION_REVOKED: 'revocada',
};

// Después de cada respuesta: si la sesión ya no sirve, limpiarla y redirigir
client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      sessionStorage.removeItem('pspp_token');
      sessionStorage.removeItem('pspp_usuario');
      // Señal de un solo uso para la próxima carga de /login (se borra de
      // inmediato al leerse), no un dato de sesión — por eso siempre en
      // sessionStorage, incluso en el navegador que sí usa localStorage
      // para el token. window.location.href hace una recarga completa,
      // así que no hay forma de pasar esto por estado de React.
      const codigo = error.response?.data?.codigo;
      sessionStorage.setItem('pspp_sesion_expirada', MOTIVOS_SESION[codigo] || 'generico');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default client;
