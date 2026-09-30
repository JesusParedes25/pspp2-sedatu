/**
 * ARCHIVO: PasoRelacion.jsx
 * PROPÓSITO: Paso 4 del wizard — Relación Jerárquica.
 *
 * Solo se muestra si el usuario eligió "Acciones" o "Tareas" en PasoNivel.
 * Pide al usuario que identifique qué columna del archivo contiene
 * el nombre del componente padre (para acciones) o la acción padre (para tareas).
 *
 * Explica explícitamente que este archivo vincula POR NOMBRE (a
 * diferencia del formato multi-hoja, que vincula por ID) — reportado
 * por usuarios reales en junta: no sabían cuál mecanismo se estaba
 * usando ni que un typo en el nombre del padre crea un Componente/
 * Acción nuevo. Ahora, además, detecta variantes de nombre parecidas
 * (vía el mismo preview que usa el paso siguiente) y exige resolverlas
 * antes de avanzar.
 */
import { useState, useEffect, useRef } from 'react';
import { ChevronRight, Info, Link2 } from 'lucide-react';
import * as importarApi from '../../api/importar';
import ResolucionDuplicadosPadre from './ResolucionDuplicadosPadre';

export default function PasoRelacion({ headers, sampleRows, config, proyectoId, fileId, onCambiar, onAvanzar }) {
  const rowLevel = config.rowLevel || 'etapa';
  const [parentColumn, setParentColumn] = useState(
    config.parentColumn != null ? config.parentColumn : ''
  );
  const [resolucionesPadre, setResolucionesPadre] = useState(config.resolucionesPadre || {});
  const [posiblesDuplicadosPadre, setPosiblesDuplicadosPadre] = useState([]);
  const [conteoReal, setConteoReal] = useState(null);
  const [cargandoPreview, setCargandoPreview] = useState(false);
  const debounceRef = useRef(null);

  const esAccion = rowLevel === 'accion';
  const etiquetaPadre = esAccion ? 'Componente' : 'Acción';

  // Vista previa en vivo (debounced) apenas se elige la columna padre —
  // trae el conteo real y las posibles variantes de nombre detectadas,
  // mismo cálculo que usará la confirmación final.
  useEffect(() => {
    if (parentColumn === '' || !fileId || !proyectoId) {
      setPosiblesDuplicadosPadre([]);
      setConteoReal(null);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setCargandoPreview(true);
      try {
        const configConPadre = { ...config, parentColumn: parseInt(parentColumn), resolucionesPadre };
        const res = await importarApi.preview({ fileId, config: configConPadre, proyectoId });
        setPosiblesDuplicadosPadre(res.datos.posiblesDuplicadosPadre || []);
        const c = res.datos.conteo || {};
        setConteoReal((c.acciones || 0) + (c.subacciones || 0));
      } catch (_) {
        setPosiblesDuplicadosPadre([]);
        setConteoReal(null);
      } finally {
        setCargandoPreview(false);
      }
    }, 500);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [parentColumn, resolucionesPadre, fileId, proyectoId]); // eslint-disable-line react-hooks/exhaustive-deps

  const todosLosGruposResueltos = posiblesDuplicadosPadre.every(g =>
    g.variantes.every(v => resolucionesPadre[normalizarTexto(v)] !== undefined)
  );
  const puedeAvanzar = parentColumn !== '' && todosLosGruposResueltos;

  function normalizarTexto(t) {
    return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  }

  const guardar = () => {
    onCambiar({
      parentColumn: parentColumn !== '' ? parseInt(parentColumn) : null,
      resolucionesPadre,
    });
    onAvanzar();
  };

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          <Link2 size={16} className="text-blue-500" />
          Relación jerárquica
        </h3>
        <p className="text-xs text-gray-500 mt-1">
          {esAccion
            ? 'Cada acción necesita pertenecer a un componente. Indica qué columna de tu archivo contiene el nombre del componente padre.'
            : 'Cada tarea necesita pertenecer a una acción. Indica qué columna de tu archivo contiene el nombre de la acción padre.'}
        </p>
      </div>

      <div className="p-3.5 bg-sky-50 border border-sky-200 rounded-lg">
        <p className="text-xs font-semibold text-sky-800 flex items-center gap-1.5 mb-1">
          <Info size={13} />
          Este archivo vincula por NOMBRE
        </p>
        <ul className="text-xs text-sky-700 space-y-1 list-disc list-inside">
          <li>No necesitas una columna de ID.</li>
          <li>
            Si escribes el nombre del padre con una variación (mayúsculas, acentos, un espacio de
            más, un typo), el sistema te lo va a marcar como "posible variante" antes de crear un
            {' '}{etiquetaPadre.toLowerCase()} nuevo — nunca lo hará en silencio.
          </li>
        </ul>
      </div>

      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <label className="block text-xs font-medium text-gray-700 mb-2">
          ¿Qué columna contiene el nombre del {etiquetaPadre} padre?
        </label>
        <select
          value={parentColumn}
          onChange={e => setParentColumn(e.target.value)}
          className="w-full border rounded-md px-3 py-2 text-sm bg-white"
        >
          <option value="">— Seleccionar columna —</option>
          {headers.map((h, i) => (
            <option key={i} value={i}>
              {h || `Columna ${i + 1}`}
              {sampleRows[0]?.[i] ? ` (ej: ${String(sampleRows[0][i]).substring(0, 40)})` : ''}
            </option>
          ))}
        </select>
      </div>

      {parentColumn !== '' && (
        <div className="border rounded-lg overflow-hidden">
          <div className="bg-gray-50 px-3 py-2 border-b">
            <span className="text-xs font-medium text-gray-600">
              Valores encontrados en esa columna (muestra)
            </span>
          </div>
          <div className="p-3">
            <div className="flex flex-wrap gap-1.5">
              {(() => {
                const colIdx = parseInt(parentColumn);
                const unicos = new Set();
                for (const fila of (sampleRows || [])) {
                  const val = fila[colIdx];
                  if (val && String(val).trim()) unicos.add(String(val).trim());
                }
                const valores = [...unicos].slice(0, 15);
                if (valores.length === 0) {
                  return <span className="text-xs text-gray-400 italic">Sin valores en la muestra</span>;
                }
                return valores.map((v, i) => (
                  <span key={i} className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs">
                    {v}
                  </span>
                ));
              })()}
            </div>
            {conteoReal != null && (
              <p className="text-xs text-gray-500 mt-2 pt-2 border-t border-gray-200">
                Se crearán aproximadamente <strong>{conteoReal} {etiquetaPadre === 'Componente' ? 'acción(es)' : 'tarea(s)'}</strong>
                <span className="text-gray-400"> — se confirma en el paso de Vista previa.</span>
              </p>
            )}
            {cargandoPreview && <p className="text-xs text-gray-400 mt-2">Calculando…</p>}
          </div>
        </div>
      )}

      {posiblesDuplicadosPadre.length > 0 && (
        <ResolucionDuplicadosPadre
          grupos={posiblesDuplicadosPadre}
          resoluciones={resolucionesPadre}
          onCambiar={setResolucionesPadre}
        />
      )}

      <div className="flex justify-end pt-2">
        <button
          onClick={guardar}
          disabled={!puedeAvanzar}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm rounded-md font-medium transition-colors ${
            puedeAvanzar
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
        >
          Siguiente <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
