/**
 * ARCHIVO: client.js
 * PROPÓSITO: Instancia central de axios con JWT y manejo de errores.
 *
 * MINI-CLASE: Interceptores de Axios
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

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
  timeout: 30000,
});

// Antes de cada petición: inyectar el JWT si existe en localStorage
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('pspp_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Después de cada respuesta: si el token expiró, limpiar sesión y redirigir
client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('pspp_token');
      localStorage.removeItem('pspp_usuario');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default client;
