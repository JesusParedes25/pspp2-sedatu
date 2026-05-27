/**
 * ARCHIVO: limpieza-geo.js
 * PROPÓSITO: Limpieza y normalización de texto geográfico para fuzzy matching.
 *
 * Algoritmo:
 * 1. Trim + normalizar Unicode
 * 2. Detectar vacíos
 * 3. Detectar multi-valor (split)
 * 4. Quitar prefijos/sufijos de ruido
 * 5. Normalizar variantes conocidas
 */

// Valores que se consideran vacíos/nulos
const VALORES_VACIOS = ['-', '—', '', 'n/a', 'sin información', 'sin informacion', 'na', 'nd', 's/i'];

// Variantes conocidas de estados que necesitan normalización
const VARIANTES_ESTADOS = {
  'cdmx': 'Ciudad de México',
  'ciudad de mexico': 'Ciudad de México',
  'd.f.': 'Ciudad de México',
  'df': 'Ciudad de México',
  'distrito federal': 'Ciudad de México',
  'edo. mex': 'México',
  'edo. méxico': 'México',
  'edo. mexico': 'México',
  'estado de mexico': 'México',
  'estado de méxico': 'México',
  'edomex': 'México',
  'edo mex': 'México',
  'coahuila': 'Coahuila de Zaragoza',
  'coahuila de zaragoza': 'Coahuila de Zaragoza',
  'michoacan': 'Michoacán de Ocampo',
  'michoacán': 'Michoacán de Ocampo',
  'michoacan de ocampo': 'Michoacán de Ocampo',
  'michoacán de ocampo': 'Michoacán de Ocampo',
  'veracruz': 'Veracruz de Ignacio de la Llave',
  'veracruz de ignacio de la llave': 'Veracruz de Ignacio de la Llave',
};

// Prefijos que se quitan del texto
const PREFIJOS = ['estado de ', 'edo. ', 'edo '];

/**
 * Normaliza un texto: quita diacríticos y convierte a minúsculas
 */
function normalizarTexto(texto) {
  if (!texto) return '';
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Limpia un valor geográfico crudo del CSV.
 * Retorna null si es vacío, un string si es valor único,
 * o un array si es multi-valor.
 */
function limpiarValorGeografico(valor) {
  if (valor == null || valor === undefined) return null;

  let texto = String(valor).trim();

  // Detectar vacíos
  if (VALORES_VACIOS.includes(texto.toLowerCase())) return null;
  if (texto === '') return null;

  // Detectar multi-valor (newline, pipe, o punto y coma como separador)
  const separadores = ['\n', '\r\n', '|', ';'];
  for (const sep of separadores) {
    if (texto.includes(sep)) {
      const partes = texto.split(sep)
        .map(p => limpiarValorIndividual(p))
        .filter(p => p !== null);
      return partes.length === 0 ? null : partes.length === 1 ? partes[0] : partes;
    }
  }

  // Detectar comas como separador SOLO si hay más de una coma y no parece un nombre compuesto
  const comas = (texto.match(/,/g) || []).length;
  if (comas >= 2 && !texto.match(/^[A-Za-záéíóúñÁÉÍÓÚÑ\s,]+$/)) {
    const partes = texto.split(',')
      .map(p => limpiarValorIndividual(p))
      .filter(p => p !== null);
    return partes.length === 0 ? null : partes.length === 1 ? partes[0] : partes;
  }

  return limpiarValorIndividual(texto);
}

/**
 * Limpia un valor individual (sin multi-valor)
 */
function limpiarValorIndividual(texto) {
  if (!texto) return null;
  texto = texto.trim();
  if (texto === '' || VALORES_VACIOS.includes(texto.toLowerCase())) return null;

  // Quitar trailing puntuación
  texto = texto.replace(/[,.\s]+$/, '').trim();

  // Quitar prefijos comunes
  const textoLower = texto.toLowerCase();
  for (const prefijo of PREFIJOS) {
    if (textoLower.startsWith(prefijo)) {
      texto = texto.slice(prefijo.length).trim();
      break;
    }
  }

  // Verificar variantes conocidas
  const normalizado = normalizarTexto(texto);
  if (VARIANTES_ESTADOS[normalizado]) {
    return VARIANTES_ESTADOS[normalizado];
  }

  // Capitalizar primera letra de cada palabra
  return texto.replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Calcula la distancia de Levenshtein entre dos strings
 */
function levenshtein(a, b) {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

/**
 * Calcula score de similitud entre dos strings (0-1)
 */
function similitud(a, b) {
  const normA = normalizarTexto(a);
  const normB = normalizarTexto(b);
  if (normA === normB) return 1;
  const maxLen = Math.max(normA.length, normB.length);
  if (maxLen === 0) return 0;
  return 1 - (levenshtein(normA, normB) / maxLen);
}

/**
 * Busca el mejor match en un catálogo de nombres.
 * @param {string} texto - Texto a buscar
 * @param {Array<{id, nombre}>} catalogo - Array de objetos con id y nombre
 * @param {number} umbral - Score mínimo para aceptar (default 0.80)
 * @returns {{id, nombre, score}|null}
 */
function fuzzyMatch(texto, catalogo, umbral = 0.80) {
  if (!texto || !catalogo || catalogo.length === 0) return null;

  const textoNorm = normalizarTexto(texto);

  // 1. Búsqueda exacta normalizada
  const exacto = catalogo.find(item => normalizarTexto(item.nombre) === textoNorm);
  if (exacto) return { id: exacto.id, nombre: exacto.nombre, score: 1 };

  // 2. Starts-with match
  const startsWith = catalogo.find(item => normalizarTexto(item.nombre).startsWith(textoNorm));
  if (startsWith && textoNorm.length >= 4) {
    return { id: startsWith.id, nombre: startsWith.nombre, score: 0.95 };
  }

  // 3. Levenshtein/similitud
  let mejor = null;
  let mejorScore = 0;
  for (const item of catalogo) {
    const score = similitud(texto, item.nombre);
    if (score > mejorScore) {
      mejorScore = score;
      mejor = item;
    }
  }

  if (mejor && mejorScore >= umbral) {
    return { id: mejor.id, nombre: mejor.nombre, score: mejorScore };
  }

  return null;
}

module.exports = {
  limpiarValorGeografico,
  limpiarValorIndividual,
  normalizarTexto,
  similitud,
  levenshtein,
  fuzzyMatch,
  VARIANTES_ESTADOS,
};
