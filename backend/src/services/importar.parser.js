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
 * Detecta si un buffer CSV/TSV está en UTF-8 válido.
 * Si no, asume ISO-8859-1 (Latin-1) y lo convierte a UTF-8.
 * Esto corrige acentos y ñ en archivos gubernamentales mexicanos.
 */
function corregirEncodingCSV(buffer) {
  // Si tiene BOM UTF-8, es UTF-8 seguro
  if (buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
    return buffer;
  }

  // Intentar decodificar como UTF-8 estricto
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    decoder.decode(buffer);
    return buffer; // UTF-8 válido
  } catch {
    // No es UTF-8 válido → asumir ISO-8859-1 (Latin-1 / Windows-1252)
    const texto = buffer.toString('latin1');
    return Buffer.from(texto, 'utf-8');
  }
}

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

  // Corregir encoding para archivos de texto plano (CSV/TSV/TXT)
  const bufferFinal = esCsv ? corregirEncodingCSV(buffer) : buffer;

  const workbook = XLSX.read(bufferFinal, {
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

// ─── Multi-hoja: formato universal ───────────────────────────

/**
 * Detecta si un workbook tiene el "formato universal multi-hoja":
 *   Hoja 1 = Etapas/Componentes (con columna ID)
 *   Hoja 2 = Acciones (con columna ID + columna id_etapa referencia)
 *   Hoja 3 = Tareas (opcional, con columna ID + columna id_accion referencia)
 *
 * Retorna null si no es multi-hoja, o un objeto con la estructura detectada.
 */
function parsearMultiHoja(buffer, filename) {
  const esXlsx = /\.xlsx?$/i.test(filename);
  if (!esXlsx) return null; // Solo Excel puede tener multi-hoja

  const workbook = XLSX.read(buffer, {
    type: 'buffer',
    cellDates: true,
    codepage: 65001,
  });

  if (workbook.SheetNames.length < 2) return null;

  // Parsear cada hoja
  const hojas = [];
  for (let i = 0; i < workbook.SheetNames.length; i++) {
    const nombre = workbook.SheetNames[i];
    const sheet = workbook.Sheets[nombre];
    desMergearCeldas(sheet);
    const rawData = XLSX.utils.sheet_to_json(sheet, {
      header: 1, defval: '', raw: false, dateNF: 'yyyy-mm-dd',
    });
    if (rawData.length < 2) continue; // necesita al menos header + 1 fila
    const headers = (rawData[0] || []).map(h => String(h || '').trim().toLowerCase());
    const filas = rawData.slice(1).filter(f => f.some(c => c && String(c).trim()));
    hojas.push({ nombre, headers, headersOriginal: rawData[0].map(h => String(h || '').trim()), filas, rawData });
  }

  if (hojas.length < 2) return null;

  // Detectar columnas en cada hoja
  const hoja1 = hojas[0];
  const hoja2 = hojas[1];
  const hoja3 = hojas.length >= 3 ? hojas[2] : null;

  const idCol1 = detectarColumnaId(hoja1.headers);
  const nombreCol1 = detectarColumnaNombre(hoja1.headers);

  // Hoja 2: intentar detectar referencia a hoja 1 (no obligatorio)
  const idCol2 = detectarColumnaId(hoja2.headers);
  const refCol2 = detectarColumnaRef(hoja2.headers, ['id_etapa', 'id_componente', 'etapa_id', 'componente_id', 'id_padre', 'parent_id', 'etapa']);
  const nombreCol2 = detectarColumnaNombre(hoja2.headers);

  // Si no se detectó refCol automáticamente, intentar buscar cualquier columna que contenga "id"
  // y no sea la columna ID propia (para sugerir al usuario)
  let refCol2Final = refCol2;
  if (refCol2Final === -1) {
    // Buscar cualquier columna con "id" que no sea la propia
    for (let i = 0; i < hoja2.headers.length; i++) {
      if (i !== idCol2 && i !== nombreCol2 && hoja2.headers[i].includes('id')) {
        refCol2Final = i;
        break;
      }
    }
    // Si aún no hay, usar la primera columna que no sea ID ni nombre
    if (refCol2Final === -1) {
      for (let i = 0; i < hoja2.headers.length; i++) {
        if (i !== idCol2 && i !== nombreCol2) {
          refCol2Final = i;
          break;
        }
      }
    }
    // Fallback absoluto
    if (refCol2Final === -1) refCol2Final = 0;
  }

  let resultado = {
    formato: 'multi_hoja',
    hojas: [
      {
        indice: 0,
        nombre: hoja1.nombre,
        nivel: 'etapa',
        headers: hoja1.headersOriginal,
        idCol: idCol1,
        nombreCol: nombreCol1,
        totalFilas: hoja1.filas.length,
        sample: hoja1.filas.slice(0, 5),
      },
      {
        indice: 1,
        nombre: hoja2.nombre,
        nivel: 'accion',
        headers: hoja2.headersOriginal,
        idCol: idCol2,
        refCol: refCol2Final,
        nombreCol: nombreCol2,
        totalFilas: hoja2.filas.length,
        sample: hoja2.filas.slice(0, 5),
      },
    ],
  };

  // Hoja 3 (Tareas) si existe
  if (hoja3) {
    const idCol3 = detectarColumnaId(hoja3.headers);
    let refCol3 = detectarColumnaRef(hoja3.headers, ['id_accion', 'accion_id', 'id_padre', 'parent_id', 'accion']);
    const nombreCol3 = detectarColumnaNombre(hoja3.headers);

    // Si no se detecta ref, buscar cualquier columna con "id" que no sea la propia
    if (refCol3 === -1) {
      for (let i = 0; i < hoja3.headers.length; i++) {
        if (i !== idCol3 && i !== nombreCol3 && hoja3.headers[i].includes('id')) {
          refCol3 = i;
          break;
        }
      }
      if (refCol3 === -1) {
        for (let i = 0; i < hoja3.headers.length; i++) {
          if (i !== idCol3 && i !== nombreCol3) { refCol3 = i; break; }
        }
      }
      if (refCol3 === -1) refCol3 = 0;
    }

    resultado.hojas.push({
      indice: 2,
      nombre: hoja3.nombre,
      nivel: 'subaccion',
      headers: hoja3.headersOriginal,
      idCol: idCol3,
      refCol: refCol3,
      nombreCol: nombreCol3,
      totalFilas: hoja3.filas.length,
      sample: hoja3.filas.slice(0, 5),
    });
  }

  return resultado;
}

/**
 * Extrae los datos completos de todas las hojas para importar.
 */
function extraerDatosMultiHoja(buffer, filename) {
  const workbook = XLSX.read(buffer, {
    type: 'buffer',
    cellDates: true,
    codepage: 65001,
  });

  const hojas = [];
  for (let i = 0; i < workbook.SheetNames.length; i++) {
    const sheet = workbook.Sheets[workbook.SheetNames[i]];
    desMergearCeldas(sheet);
    const rawData = XLSX.utils.sheet_to_json(sheet, {
      header: 1, defval: '', raw: false, dateNF: 'yyyy-mm-dd',
    });
    if (rawData.length < 2) { hojas.push({ headers: [], filas: [] }); continue; }
    const headers = rawData[0].map(h => String(h || '').trim());
    const filas = rawData.slice(1).filter(f => f.some(c => c && String(c).trim()));
    hojas.push({ headers, filas });
  }
  return hojas;
}

// Helpers para detección de columnas
function detectarColumnaId(headers, patron) {
  // Buscar columna exacta "id"
  let idx = headers.findIndex(h => h === 'id');
  if (idx !== -1) return idx;
  // Buscar variaciones
  idx = headers.findIndex(h => /^id$|^#$|^no\.?$|^num$|^numero$/i.test(h));
  if (idx !== -1) return idx;
  // Si la primera columna parece numérica secuencial, usarla
  return 0; // default: primera columna
}

function detectarColumnaNombre(headers) {
  const patrones = ['nombre', 'name', 'descripcion', 'accion', 'etapa', 'componente', 'tarea', 'actividad'];
  for (const p of patrones) {
    const idx = headers.findIndex(h => h.includes(p));
    if (idx !== -1) return idx;
  }
  // Si no encuentra, usar la segunda columna (después del ID)
  return headers.length > 1 ? 1 : 0;
}

function detectarColumnaRef(headers, patrones) {
  for (const p of patrones) {
    const idx = headers.findIndex(h => h === p || h.replace(/\s+/g, '_') === p);
    if (idx !== -1) return idx;
  }
  // Buscar parcialmente
  for (const p of patrones) {
    const idx = headers.findIndex(h => h.includes(p.replace('id_', '').replace('_id', '')));
    if (idx !== -1 && headers[idx].includes('id')) return idx;
  }
  return -1;
}

module.exports = {
  parsearArchivo,
  extraerConConfig,
  obtenerFilasDatos,
  obtenerVistaPrevia,
  parsearMultiHoja,
  extraerDatosMultiHoja,
};
