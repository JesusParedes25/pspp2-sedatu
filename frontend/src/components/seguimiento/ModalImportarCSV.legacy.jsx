/**
 * ARCHIVO: ModalImportarCSV.jsx
 * PROPÓSITO: Modal para importar etapas, acciones y subacciones desde
 *            un archivo CSV/TSV. El peso % se calcula automáticamente
 *            en el backend.
 *
 * MINI-CLASE: Parseo de CSV en el navegador
 * ─────────────────────────────────────────────────────────────────
 * El archivo se lee con FileReader.readAsText(). Se separa por líneas,
 * luego por tabulador (TSV) o coma (CSV). La primera fila se usa como
 * encabezados, normalizados a snake_case para mapear a las columnas
 * que espera el backend. El usuario puede previsualizar antes de
 * confirmar la importación.
 * ─────────────────────────────────────────────────────────────────
 */
import { useState, useRef } from 'react';
import { X, Upload, FileSpreadsheet, AlertCircle, CheckCircle } from 'lucide-react';
import * as accionesApi from '../../api/acciones';

// Mapeo de encabezados comunes en español → clave interna
const HEADER_MAP = {
  'nivel': 'nivel',
  'clave etapa': 'clave_etapa',
  'clave_etapa': 'clave_etapa',
  'etapa': 'etapa',
  'clave accion': 'clave_accion',
  'clave acción': 'clave_accion',
  'clave_accion': 'clave_accion',
  'accion': 'accion',
  'acción': 'accion',
  'peso %': 'peso',
  'peso': 'peso',
  'fecha inicio': 'fecha_inicio',
  'fecha_inicio': 'fecha_inicio',
  'fecha fin': 'fecha_fin',
  'fecha_fin': 'fecha_fin',
  'responsable': 'responsable',
  'dependencia externa': 'dependencia_externa',
  'dependencia_externa': 'dependencia_externa',
  'entregable': 'entregable',
  'estado': 'estado',
};

// Parsea una línea CSV/TSV respetando campos entrecomillados (RFC 4180)
function parsearLinea(linea, sep) {
  const resultado = [];
  let actual = '';
  let enComillas = false;

  for (let i = 0; i < linea.length; i++) {
    const ch = linea[i];
    if (enComillas) {
      if (ch === '"') {
        if (i + 1 < linea.length && linea[i + 1] === '"') {
          actual += '"';
          i++;
        } else {
          enComillas = false;
        }
      } else {
        actual += ch;
      }
    } else {
      if (ch === '"') {
        enComillas = true;
      } else if (ch === sep) {
        resultado.push(actual.trim());
        actual = '';
      } else {
        actual += ch;
      }
    }
  }
  resultado.push(actual.trim());
  return resultado;
}

// Detecta el separador probando tab, punto y coma, y coma.
// Elige el que produzca más columnas en el encabezado (mín. 6).
function detectarSeparador(primeraLinea) {
  const candidatos = ['\t', ';', ','];
  let mejor = ',';
  let mejorCols = 0;
  for (const sep of candidatos) {
    const n = parsearLinea(primeraLinea, sep).length;
    if (n > mejorCols) {
      mejorCols = n;
      mejor = sep;
    }
  }
  return mejor;
}

// Para CSV con comas dentro de campos (sin comillas), reagrupa columnas
// usando dos anclas: el patrón de clave_accion (A01, A01.02) y las
// fechas YYYY-MM-DD. Todo lo que sobra se fusiona en etapa o accion.
function reagruparFila(cols, numEsperado) {
  if (cols.length <= numEsperado) return cols;

  const esFecha = (v) => /^\d{4}-\d{2}-\d{2}$/.test((v || '').trim());
  const esClave = (v) => /^[A-Za-z]\d+(\.\d+)*$/.test((v || '').trim());

  // 1. Encontrar el primer par de fechas consecutivas (fecha_inicio, fecha_fin)
  let idxFecha = -1;
  for (let i = 2; i < cols.length - 1; i++) {
    if (esFecha(cols[i]) && esFecha(cols[i + 1])) { idxFecha = i; break; }
  }
  if (idxFecha < 0) return cols;

  // 2. Todo lo que queda ANTES de las fechas: [nivel, clave_etapa, ...medio..., peso]
  //    Todo lo que queda DESPUÉS de las fechas: [responsable, dep_ext, entregable, estado]
  const antes = cols.slice(0, idxFecha);   // incluye nivel..peso
  const despues = cols.slice(idxFecha);     // incluye fecha_inicio, fecha_fin, ...

  // 'antes' debería producir exactamente 6 campos:
  //   [0]=nivel, [1]=clave_etapa, [2]=etapa, [3]=clave_accion, [4]=accion, [5]=peso
  // Si antes.length > 6, hay exceso por comas en etapa y/o accion.
  if (antes.length <= 6) return cols;

  // 3. Identificar anclas fijas dentro de 'antes':
  //    - antes[0] = nivel (ETAPA/ACCION/SUBACCION)
  //    - antes[1] = clave_etapa (E1, E2)
  //    - antes[last] = peso (vacío, número, o algo como "14%")
  //    - Buscar clave_accion: primera col después de idx 2 que matchea patrón Axx/Axx.xx
  const nivel = antes[0];
  const claveEtapa = antes[1];
  const peso = antes[antes.length - 1];
  const medio = antes.slice(2, -1); // todo entre clave_etapa y peso

  // Buscar clave_accion en 'medio' (primera que matchea el patrón)
  let idxClaveEnMedio = -1;
  for (let k = 0; k < medio.length; k++) {
    if (esClave(medio[k])) { idxClaveEnMedio = k; break; }
  }

  let etapa, claveAccion, accion;
  if (idxClaveEnMedio >= 0) {
    // Todo antes de la clave = etapa (fusionado con comas)
    etapa = medio.slice(0, idxClaveEnMedio).join(', ');
    claveAccion = medio[idxClaveEnMedio];
    // Todo después de la clave = accion (fusionado con comas)
    accion = medio.slice(idxClaveEnMedio + 1).join(', ');
  } else {
    // No encontramos clave_accion (puede ser fila ETAPA)
    // Para ETAPA: no hay clave_accion ni accion, todo es etapa
    if (nivel.toUpperCase().trim() === 'ETAPA') {
      etapa = medio.join(', ');
      claveAccion = '';
      accion = '';
    } else {
      // Heurística: primer fragmento largo = etapa, resto = accion
      etapa = medio[0] || '';
      claveAccion = '';
      accion = medio.slice(1).join(', ');
    }
  }

  return [nivel, claveEtapa, etapa, claveAccion, accion, peso, ...despues];
}

function parsearCSV(texto) {
  const lineas = texto.split(/\r?\n/).filter(l => l.trim());
  if (lineas.length < 2) return { encabezados: [], filas: [], error: null };

  const sep = detectarSeparador(lineas[0]);

  const rawHeaders = parsearLinea(lineas[0], sep);
  const numCols = rawHeaders.length;
  const encabezados = rawHeaders.map(h => {
    const normalizado = h.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return HEADER_MAP[normalizado] || HEADER_MAP[h.toLowerCase()] || h.toLowerCase().replace(/\s+/g, '_');
  });

  const filas = [];
  const advertencias = [];
  for (let i = 1; i < lineas.length; i++) {
    let cols = parsearLinea(lineas[i], sep);
    // Si hay más columnas de las esperadas, intentar reagrupar
    if (cols.length > numCols) {
      cols = reagruparFila(cols, numCols);
    }
    if (cols.length !== numCols && cols.length > 1) {
      advertencias.push(`Fila ${i + 1}: ${cols.length} columnas (esperadas ${numCols})`);
    }
    const fila = {};
    encabezados.forEach((enc, j) => { fila[enc] = cols[j] || ''; });
    if (fila.nivel) filas.push(fila);
  }

  const error = advertencias.length > 0
    ? `${advertencias.length} fila(s) con columnas desalineadas. Si guardaste desde Excel, usa "Guardar como → Texto (delimitado por tabuladores *.txt)". Filas: ${advertencias.slice(0, 3).join('; ')}`
    : null;

  return { encabezados, filas, error };
}

export default function ModalImportarCSV({ proyectoId, onImportado, onCerrar }) {
  const [archivo, setArchivo] = useState(null);
  const [filas, setFilas] = useState([]);
  const [encabezados, setEncabezados] = useState([]);
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);

  function manejarArchivo(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setArchivo(file);
    setError(null);
    setResultado(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const { encabezados: enc, filas: f, error: errParseo } = parsearCSV(ev.target.result);
        if (errParseo) {
          setError(errParseo);
        }
        if (f.length === 0) {
          if (!errParseo) setError('No se encontraron filas válidas. Verifica que la primera columna sea "Nivel".');
          return;
        }
        // Validar que tenga las columnas mínimas
        const requeridas = ['nivel', 'clave_etapa', 'etapa'];
        const faltantes = requeridas.filter(r => !enc.includes(r));
        if (faltantes.length > 0) {
          setError(`Columnas faltantes: ${faltantes.join(', ')}. Revisa los encabezados.`);
          return;
        }
        setEncabezados(enc);
        setFilas(f);
      } catch (err) {
        setError('Error al leer el archivo: ' + err.message);
      }
    };
    reader.readAsText(file, 'UTF-8');
  }

  async function importar() {
    setImportando(true);
    setError(null);
    try {
      const res = await accionesApi.importarCSV(proyectoId, filas);
      setResultado(res.datos);
      onImportado && onImportado();
    } catch (err) {
      setError(err.response?.data?.mensaje || 'Error al importar');
    } finally {
      setImportando(false);
    }
  }

  // Conteo para preview
  const nEtapas = filas.filter(f => f.nivel?.toUpperCase() === 'ETAPA').length;
  const nAcciones = filas.filter(f => f.nivel?.toUpperCase() === 'ACCION').length;
  const nSubacciones = filas.filter(f => f.nivel?.toUpperCase() === 'SUBACCION').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <FileSpreadsheet size={20} className="text-guinda-500" />
            <h2 className="text-lg font-semibold text-gray-900">Importar estructura desde CSV</h2>
          </div>
          <button onClick={onCerrar} className="p-1 rounded-lg hover:bg-gray-100 transition-colors">
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Instrucciones */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700 space-y-1">
            <p className="font-medium">Formato esperado (CSV o TSV con tabuladores):</p>
            <p>Columnas: <b>Nivel</b> | <b>Clave Etapa</b> | <b>Etapa</b> | <b>Clave Acción</b> | <b>Acción</b> | Fecha Inicio | Fecha Fin | Responsable | Entregable | Estado</p>
            <p>Niveles válidos: <code>ETAPA</code>, <code>ACCION</code>, <code>SUBACCION</code></p>
            <p>Las subacciones usan clave compuesta: <code>A01.01</code>, <code>A01.02</code> (padre <code>A01</code>)</p>
            <p>El peso % se calcula automáticamente: 100% / N acciones por etapa.</p>
          </div>

          {/* Selector de archivo */}
          <div>
            <input type="file" ref={fileRef} accept=".csv,.tsv,.txt" onChange={manejarArchivo} className="hidden" />
            <button onClick={() => fileRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm text-gray-700 transition-colors">
              <Upload size={16} />
              {archivo ? archivo.name : 'Seleccionar archivo CSV/TSV'}
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          {/* Resultado exitoso */}
          {resultado && (
            <div className="flex items-start gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700">
              <CheckCircle size={14} className="flex-shrink-0 mt-0.5" />
              Importación exitosa: {resultado.etapas_creadas} etapas, {resultado.acciones_creadas} acciones creadas.
              Los pesos se calcularon automáticamente.
            </div>
          )}

          {/* Preview de datos */}
          {filas.length > 0 && !resultado && (
            <>
              <div className="flex items-center gap-4 text-sm">
                <span className="font-medium text-gray-700">Vista previa:</span>
                <span className="text-guinda-600 font-medium">{nEtapas} etapas</span>
                <span className="text-blue-600 font-medium">{nAcciones} acciones</span>
                <span className="text-amber-600 font-medium">{nSubacciones} subacciones</span>
              </div>
              <div className="border rounded-lg overflow-x-auto max-h-72">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-medium text-gray-500">Nivel</th>
                      <th className="px-2 py-1.5 text-left font-medium text-gray-500">Clave</th>
                      <th className="px-2 py-1.5 text-left font-medium text-gray-500">Nombre</th>
                      <th className="px-2 py-1.5 text-left font-medium text-gray-500">Fechas</th>
                      <th className="px-2 py-1.5 text-left font-medium text-gray-500">Entregable</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((f, i) => {
                      const nivel = f.nivel?.toUpperCase();
                      const esEtapa = nivel === 'ETAPA';
                      const esSub = nivel === 'SUBACCION';
                      return (
                        <tr key={i} className={`border-t ${esEtapa ? 'bg-guinda-50/30 font-medium' : esSub ? 'bg-amber-50/20' : ''}`}>
                          <td className="px-2 py-1">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              esEtapa ? 'bg-guinda-100 text-guinda-700' :
                              esSub ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                            }`}>{nivel}</span>
                          </td>
                          <td className="px-2 py-1 text-gray-500">{f.clave_etapa}{f.clave_accion ? ` / ${f.clave_accion}` : ''}</td>
                          <td className={`px-2 py-1 ${esSub ? 'pl-6' : ''}`}>{esEtapa ? f.etapa : f.accion}</td>
                          <td className="px-2 py-1 text-gray-400">{f.fecha_inicio || ''} — {f.fecha_fin || ''}</td>
                          <td className="px-2 py-1 text-gray-400 truncate max-w-[150px]">{f.entregable || ''}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50">
          <button onClick={onCerrar} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors">
            {resultado ? 'Cerrar' : 'Cancelar'}
          </button>
          {filas.length > 0 && !resultado && (
            <button onClick={importar} disabled={importando}
              className="px-4 py-2 bg-guinda-500 text-white text-sm rounded-lg hover:bg-guinda-600 transition-colors disabled:opacity-50">
              {importando ? 'Importando...' : `Importar ${nEtapas} etapas y ${nAcciones + nSubacciones} acciones`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
