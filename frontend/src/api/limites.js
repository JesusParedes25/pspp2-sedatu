/**
 * ARCHIVO: limites.js
 * PROPÓSITO: Límites de tiempo y tamaño del cliente HTTP, en un solo lugar.
 *
 * NOTA TÉCNICA: tres clases de petición, tres límites
 * ─────────────────────────────────────────────────────────────────
 * Antes había un único `timeout: 30000` en client.js para todo. Una subida
 * de más de medio minuto fallaba ("timeout of 30000ms exceeded") sin
 * importar su tamaño: dependía solo de la velocidad de la conexión.
 *
 * 1. NORMAL (TIEMPO_NORMAL_MS, 30 s): cualquier petición corta. Un límite
 *    corto es sano: si el servidor no responde, la interfaz no se queda
 *    colgada.
 * 2. PROCESO (TIEMPO_PROCESO_MS, 5 min): el servidor trabaja antes de
 *    contestar (exportar a Excel, duplicar un proyecto con sus archivos,
 *    previsualizar o confirmar una importación). 5 min = el
 *    proxy_read_timeout de nginx (300 s): esperar más en el navegador no
 *    sirve, porque nginx ya habría cortado con 504.
 * 3. TRANSFERENCIA (subidas y descargas grandes): un límite TOTAL fijo
 *    siempre falla con algún tamaño y alguna velocidad, que era justo el
 *    defecto. Se aborta si la transferencia DEJA DE AVANZAR durante
 *    TRANSFERENCIA_SIN_AVANCE_MS (60 s = client_body_timeout por omisión
 *    de nginx), con un tope total amplio (TIEMPO_MAXIMO_TRANSFERENCIA_MS,
 *    60 min = TIEMPO_MAXIMO_PETICION_SEGUNDOS del backend). Ver
 *    api/transferencias.js.
 *
 * Todos se pueden ajustar al compilar con variables VITE_* (se leen solo
 * en `npm run build`). La tabla completa de la cadena (navegador, nginx,
 * backend) está en deploy/README.md, sección 12.
 * ─────────────────────────────────────────────────────────────────
 */

function enteroPositivo(valor, porOmision) {
  const n = Number.parseInt(valor, 10);
  return Number.isFinite(n) && n > 0 ? n : porOmision;
}

const env = import.meta.env || {};

export const TIEMPO_NORMAL_MS = enteroPositivo(env.VITE_TIEMPO_ESPERA_MS, 30_000);
export const TIEMPO_PROCESO_MS = enteroPositivo(env.VITE_TIEMPO_ESPERA_PROCESO_MS, 300_000);
export const TIEMPO_MAXIMO_TRANSFERENCIA_MS = enteroPositivo(env.VITE_TIEMPO_MAXIMO_TRANSFERENCIA_MS, 3_600_000);
export const TRANSFERENCIA_SIN_AVANCE_MS = enteroPositivo(env.VITE_TRANSFERENCIA_SIN_AVANCE_MS, 60_000);

// Debe coincidir con UPLOAD_MAX_SIZE_MB del backend y con
// client_max_body_size de nginx. Sirve para rechazar en el navegador, antes
// de subir un solo byte, un archivo que el servidor rechazaría de todos
// modos al final.
export const TAMANO_MAXIMO_SUBIDA_MB = enteroPositivo(env.VITE_UPLOAD_MAX_SIZE_MB, 200);
export const TAMANO_MAXIMO_SUBIDA_BYTES = TAMANO_MAXIMO_SUBIDA_MB * 1024 * 1024;
