/**
 * ARCHIVO: cartoBasemap.js
 * PROPÓSITO: URL del mapa base de CARTO usado por Leaflet en los mapas
 *            interactivos (Territorio, Seguimiento > Mapa).
 *
 * CARTO dejó de servir basemaps.cartocdn.com sin autenticación — las
 * peticiones sin key empezaron a responder 403 (o el tile "API KEY
 * REQUIRED"). El parámetro se llama literalmente "key" (no "api_key" —
 * la doc de CARTO en github.com/CartoDB/basemap-styles lo confirma:
 * "Pass it as ?key=YOUR_KEY on the tile URL"; CARTO además marca los
 * basemaps raster como en vías de retirarse a favor de los vectoriales).
 * La llave se pasa por variable de entorno de build (VITE_CARTO_API_KEY),
 * igual que VITE_API_URL/VITE_BASE_PATH: nunca se hardcodea en el código
 * ni se comitea (frontend/.env está en .gitignore). En producción se
 * define en el servicio frontend-build de docker-compose.prod.yml. Sin
 * la variable definida, la URL queda igual que antes (sin key) — no
 * revienta el build, solo el mapa base no carga hasta que se configure.
 */
const API_KEY = import.meta.env.VITE_CARTO_API_KEY || '';

export const CARTO_TILE_URL = API_KEY
  ? `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(API_KEY)}`
  : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

export const CARTO_ATTRIBUTION = '&copy; <a href="https://carto.com">CARTO</a>';
