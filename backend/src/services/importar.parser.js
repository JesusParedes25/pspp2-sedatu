/**
 * ARCHIVO: importar.parser.js
 * PROPÓSITO: Parsear archivos CSV y XLSX usando SheetJS.
 *
 * Responsabilidades:
 * - Leer buffer de archivo (CSV o XLSX)
 * - Des-mergear celdas combinadas en XLSX
 * - Extraer encabezados, super-encabezados y filas de datos
 * - Devolver estructura normalizada para el wizard
 */
const XLSX = require('xlsx');

/**
 * Parsea un buffer de archivo (CSV o XLSX).
 * @param {Buffer} buffer - Contenido del archivo
 * @param {string} filename - Nombre original del archivo (para detectar tipo)
 * @param {object} opciones - { headerRow, superHeaderRow, dataStartRow, sheetIndex }
 * @returns {{ sheetNames: string[], headers: string[], superHeaders: string[]|null, sampleRows: any[][], totalRows: number }}
 */
function parsearArchivo(buffer, filename, opciones = {}) {
  const esXlsx = /\.xlsx?$/i.test(filename);
  const esCsv = /\.(csv|tsv|txt)$/i.test(filename);

  if (!esXlsx && !esCsv) {
    throw new Error('Formato no soportado. Use .csv, .tsv, .txt o .xlsx');
  }

  const workbook = XLSX.read(buffer, {
    type: 'buffer',
    cellDates: true,
    codepage: 65001, // UTF-8
  });

  const sheetNames = workbook.SheetNames;
  const sheetIndex = opciones.sheetIndex || 0;

  if (sheetIndex >= sheetNames.length) {
    throw new Error(`Hoja ${sheetIndex} no existe. El archivo tiene ${sheetNames.length} hoja(s).`);
  }

  const sheet = workbook.Sheets[sheetNames[sheetIndex]];

  // Des-mergear celdas combinadas
  desMergearCeldas(sheet);

  // Convertir hoja a array de arrays (raw)
  const rawData = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
    raw: false,
    dateNF: 'yyyy-mm-dd',
  });

  if (rawData.length === 0) {
    throw new Error('La hoja seleccionada está vacía.');
  }

  return {
    sheetNames,
    rawData,
    totalRows: rawData.length,
  };
}

/**
 * Extrae headers, superHeaders y sampleRows según la config del usuario.
 * Se llama después del parseo inicial cuando el usuario define las filas.
 * @param {any[][]} rawData - Datos crudos del parseo
 * @param {object} config - { headerRow, superHeaderRow, dataStartRow }
 * @returns {{ headers, superHeaders, sampleRows, totalDataRows }}
 */
function extraerConConfig(rawData, config) {
  const headerIdx = (config.headerRow || 1) - 1; // 1-indexed → 0-indexed
  const superIdx = config.superHeaderRow ? config.superHeaderRow - 1 : null;
  const dataStart = (config.dataStartRow || 2) - 1;

  if (headerIdx >= rawData.length) {
    throw new Error(`Fila de encabezados (${config.headerRow}) excede el total de filas (${rawData.length}).`);
  }

  const headers = (rawData[headerIdx] || []).map(h => String(h || '').trim());
  const superHeaders = superIdx !== null && superIdx < rawData.length
    ? (rawData[superIdx] || []).map(h => String(h || '').trim())
    : null;

  // Propagar super-headers vacíos (por des-merge parcial)
  if (superHeaders) {
    let ultimo = '';
    for (let i = 0; i < superHeaders.length; i++) {
      if (superHeaders[i]) {
        ultimo = superHeaders[i];
      } else {
        superHeaders[i] = ultimo;
      }
    }
  }

  const dataRows = rawData.slice(dataStart);
  const sampleRows = dataRows.slice(0, 10);

  return {
    headers,
    superHeaders,
    sampleRows,
    totalDataRows: dataRows.length,
  };
}

/**
 * Obtiene TODAS las filas de datos (no solo sample).
 * Se usa en preview y confirmar.
 */
function obtenerFilasDatos(rawData, config) {
  const dataStart = (config.dataStartRow || 2) - 1;
  return rawData.slice(dataStart);
}

/**
 * Des-mergea celdas combinadas en una hoja XLSX.
 * Copia el valor de la celda superior-izquierda a todas las celdas del rango.
 */
function desMergearCeldas(sheet) {
  const merges = sheet['!merges'];
  if (!merges || merges.length === 0) return;

  for (const rng of merges) {
    // rng = { s: { r, c }, e: { r, c } }
    const valorRef = XLSX.utils.encode_cell(rng.s);
    const celda = sheet[valorRef];
    const valor = celda ? celda.v : '';
    const tipo = celda ? celda.t : 's';

    for (let r = rng.s.r; r <= rng.e.r; r++) {
      for (let c = rng.s.c; c <= rng.e.c; c++) {
        const ref = XLSX.utils.encode_cell({ r, c });
        if (ref === valorRef) continue;
        sheet[ref] = { v: valor, t: tipo };
      }
    }
  }
}

/**
 * Genera las primeras N filas crudas para que el frontend
 * pueda mostrar una vista previa del archivo al usuario.
 */
function obtenerVistaPrevia(rawData, n = 10) {
  return rawData.slice(0, Math.min(n, rawData.length));
}

module.exports = {
  parsearArchivo,
  extraerConConfig,
  obtenerFilasDatos,
  obtenerVistaPrevia,
};
