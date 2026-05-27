/**
 * ARCHIVO: semaforo.js
 * PROPÓSITO: Motor de cálculo de semaforización universal.
 *
 * Reglas de negocio:
 * 1. Valor explícito del CSV (si existe columna Semaforización)
 * 2. Derivado del estado textual
 * 3. Derivado del % de avance
 * Status textual siempre gana sobre % cuando hay conflicto.
 */

// Mapping de estados textuales → semáforo
const STATUS_A_SEMAFORO = {
  'concluido': 'verde',
  'finalizado': 'verde',
  'completada': 'verde',
  'terminado': 'verde',
  'en proceso': 'amarillo',
  'en_proceso': 'amarillo',
  'en progreso': 'amarillo',
  'en espera': 'gris',
  'en espera de información': 'gris',
  'por iniciar': 'gris',
  'pendiente': 'gris',
  'sin avance': 'gris',
  'no iniciado': 'gris',
  'sin información': 'gris',
  'foco rojo': 'rojo',
  'bloqueada': 'rojo',
  'detenido': 'rojo',
  'publicado': 'azul',
  'cargado en situ': 'azul',
  'descartado': 'negro',
  'cancelada': 'negro',
  'cancelado': 'negro',
  'excento': null,
  'n/a': null,
};

// Mapping de colores textuales (como en PUMOT "Semaforización") → semáforo
const COLOR_A_SEMAFORO = {
  'verde': 'verde',
  'amarillo': 'amarillo',
  'naranja': 'naranja',
  'rojo': 'rojo',
  'gris': 'gris',
  'azul': 'azul',
  'negro': 'negro',
  'publicado': 'azul',
  'descartado': 'negro',
  'foco rojo': 'rojo',
};

// Orden de gravedad (mayor índice = más grave)
const GRAVEDAD = ['azul', 'verde', 'gris', 'amarillo', 'naranja', 'rojo'];

/**
 * Calcula el semáforo a partir de % de avance
 */
function semaforoDesdePorcentaje(porcentaje) {
  if (porcentaje == null || porcentaje === '') return null;
  const p = Number(porcentaje);
  if (isNaN(p)) return null;
  if (p === 0) return 'gris';
  if (p <= 30) return 'naranja';
  if (p <= 99) return 'amarillo';
  return 'verde'; // 100%
}

/**
 * Calcula el semáforo a partir del estado textual
 */
function semaforoDesdeEstado(estado) {
  if (!estado) return null;
  const key = estado.trim().toLowerCase();
  return STATUS_A_SEMAFORO[key] !== undefined ? STATUS_A_SEMAFORO[key] : null;
}

/**
 * Calcula el semáforo a partir del valor explícito de semaforización del CSV
 */
function semaforoDesdeExplicito(valor) {
  if (!valor) return null;
  const key = valor.trim().toLowerCase();
  return COLOR_A_SEMAFORO[key] !== undefined ? COLOR_A_SEMAFORO[key] : null;
}

/**
 * Calcula el semáforo unificado aplicando las 3 fuentes en orden de prioridad.
 * @param {Object} params
 * @param {string|null} params.semaforoExplicito - Valor directo de columna "Semaforización"
 * @param {string|null} params.estado - Estado textual (ej: "En proceso", "Concluido")
 * @param {number|null} params.porcentaje - % de avance (0-100)
 * @returns {string|null} Clave de semáforo (verde, amarillo, naranja, rojo, gris, azul, negro) o null
 */
function calcularSemaforo({ semaforoExplicito, estado, porcentaje }) {
  // Prioridad 1: Valor explícito del CSV
  const desdeExplicito = semaforoDesdeExplicito(semaforoExplicito);
  if (desdeExplicito) return desdeExplicito;

  // Prioridad 2: Estado textual
  const desdeEstado = semaforoDesdeEstado(estado);

  // Prioridad 3: Porcentaje
  const desdePorcentaje = semaforoDesdePorcentaje(porcentaje);

  // Status textual gana sobre porcentaje
  if (desdeEstado) return desdeEstado;
  if (desdePorcentaje) return desdePorcentaje;

  return null;
}

/**
 * Calcula el semáforo de un padre como el PEOR de sus hijos.
 * @param {string[]} semaforosHijos - Array de semáforos de los hijos
 * @returns {string|null} El semáforo más grave
 */
function semaforoPeor(semaforosHijos) {
  const validos = semaforosHijos.filter(s => s && GRAVEDAD.includes(s));
  if (validos.length === 0) return null;

  let peorIdx = -1;
  for (const s of validos) {
    const idx = GRAVEDAD.indexOf(s);
    if (idx > peorIdx) peorIdx = idx;
  }
  return GRAVEDAD[peorIdx];
}

module.exports = {
  calcularSemaforo,
  semaforoPeor,
  semaforoDesdeEstado,
  semaforoDesdePorcentaje,
  semaforoDesdeExplicito,
  STATUS_A_SEMAFORO,
  GRAVEDAD,
};
