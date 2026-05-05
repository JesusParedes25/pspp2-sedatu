/**
 * ARCHIVO: importar.matcher.js
 * PROPÓSITO: Auto-sugerencia de plantilla por similitud de encabezados.
 *
 * Compara los encabezados detectados del archivo subido contra las
 * plantillas disponibles (sistema + DG del usuario). Devuelve la
 * plantilla con mayor coincidencia si supera el umbral (70%).
 */
const pool = require('../db/pool');

const UMBRAL_MATCH = 0.70;

/**
 * Normaliza un texto para comparación: lowercase, sin tildes, sin espacios extra.
 */
function normalizar(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/**
 * Extrae los nombres de campos esperados de una config de plantilla.
 * Incluye campos del columnMap + campos de los pivotBlocks.
 */
function extraerCamposPlantilla(config) {
  const campos = new Set();

  // Del columnMap
  if (config.columnMap) {
    for (const field of Object.values(config.columnMap)) {
      campos.add(normalizar(field));
    }
  }

  // De los pivotBlocks (nombres de bloque + campos internos)
  if (config.pivotBlocks) {
    for (const block of config.pivotBlocks) {
      campos.add(normalizar(block.name));
      if (block.fieldMap) {
        for (const field of Object.values(block.fieldMap)) {
          campos.add(normalizar(field));
        }
      }
    }
  }

  return campos;
}

/**
 * Calcula el score de coincidencia entre headers del archivo y una plantilla.
 * @param {string[]} headersArchivo - Encabezados detectados del archivo
 * @param {object} config - Config JSONB de la plantilla
 * @returns {number} Score entre 0 y 1
 */
function calcularScore(headersArchivo, config) {
  const camposPlantilla = extraerCamposPlantilla(config);
  if (camposPlantilla.size === 0) return 0;

  const headersNorm = new Set(headersArchivo.map(normalizar));

  let matches = 0;
  for (const campo of camposPlantilla) {
    if (headersNorm.has(campo)) matches++;
  }

  return matches / camposPlantilla.size;
}

/**
 * Busca la mejor plantilla que coincida con los headers del archivo.
 * @param {string[]} headersArchivo - Encabezados detectados
 * @param {string|null} idDg - UUID de la DG del usuario (para filtrar plantillas de su DG)
 * @returns {Promise<{ plantilla: object, score: number }|null>}
 */
async function sugerirPlantilla(headersArchivo, idDg) {
  // Cargar plantillas del sistema (id_dg IS NULL) + las de la DG del usuario
  let query = 'SELECT * FROM plantillas_importacion WHERE id_dg IS NULL';
  const params = [];

  if (idDg) {
    query += ' OR id_dg = $1';
    params.push(idDg);
  }

  query += ' ORDER BY es_predeterminada DESC, nombre ASC';

  const { rows: plantillas } = await pool.query(query, params);

  let mejorPlantilla = null;
  let mejorScore = 0;

  for (const p of plantillas) {
    const score = calcularScore(headersArchivo, p.config);
    if (score > mejorScore) {
      mejorScore = score;
      mejorPlantilla = p;
    }
  }

  if (mejorScore >= UMBRAL_MATCH && mejorPlantilla) {
    return {
      plantilla: mejorPlantilla,
      score: Math.round(mejorScore * 100),
    };
  }

  return null;
}

module.exports = {
  sugerirPlantilla,
  calcularScore,
  normalizar,
  UMBRAL_MATCH,
};
