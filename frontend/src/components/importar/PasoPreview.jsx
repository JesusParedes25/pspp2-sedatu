/**
 * ARCHIVO: PasoPreview.jsx
 * PROPÓSITO: Paso 5 del wizard — preview jerárquico + confirmar importación.
 */
import { useState, useEffect } from 'react';
import { Check, AlertTriangle, AlertCircle, Loader2 } from 'lucide-react';
import ArbolPreview from './ArbolPreview';
import * as importarApi from '../../api/importar';

export default function PasoPreview({ fileId, config, proyectoId, sheetIndex, onImportado, onCerrar }) {
  const [preview, setPreview] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState(null);

  useEffect(() => {
    cargarPreview();
  }, [fileId, config, proyectoId]);

  const cargarPreview = async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await importarApi.preview({ fileId, config, proyectoId, sheetIndex });
      setPreview(res.datos);
    } catch (e) {
      setError(e.response?.data?.mensaje || e.message);
    } finally {
      setCargando(false);
    }
  };

  const ejecutarImport = async () => {
    setImportando(true);
    setError(null);
    try {
      const res = await importarApi.confirmar({ fileId, config, proyectoId, skipDuplicados: true, sheetIndex });
      setResultado(res.datos);
      if (onImportado) onImportado();
    } catch (e) {
      setError(e.response?.data?.mensaje || e.message);
    } finally {
      setImportando(false);
    }
  };

  // Estado: resultado exitoso
  if (resultado) {
    return (
      <div className="space-y-4 text-center py-8">
        <div className="w-16 h-16 mx-auto bg-green-100 rounded-full flex items-center justify-center">
          <Check size={32} className="text-green-600" />
        </div>
        <h3 className="text-lg font-semibold text-gray-800">Importación completada</h3>
        <div className="text-sm text-gray-600 space-y-1">
          <p><strong>{resultado.etapas_creadas}</strong> etapas creadas</p>
          <p><strong>{resultado.acciones_creadas}</strong> acciones creadas</p>
          <p><strong>{resultado.subacciones_creadas}</strong> subacciones creadas</p>
          {resultado.duplicados_saltados > 0 && (
            <p className="text-amber-600"><strong>{resultado.duplicados_saltados}</strong> duplicados saltados</p>
          )}
        </div>
        <button
          onClick={onCerrar}
          className="px-6 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
        >
          Cerrar
        </button>
      </div>
    );
  }

  // Estado: cargando
  if (cargando) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <Loader2 size={24} className="animate-spin text-blue-500" />
        <span className="text-sm text-gray-500">Generando preview...</span>
      </div>
    );
  }

  // Estado: error
  if (error && !preview) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <div className="flex items-start gap-2">
          <AlertCircle size={16} className="text-red-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-800">Error al generar preview</p>
            <p className="text-xs text-red-600 mt-1">{error}</p>
          </div>
        </div>
        <button
          onClick={cargarPreview}
          className="mt-3 px-3 py-1.5 text-xs bg-white border border-red-200 rounded-md hover:bg-red-50"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (!preview) return null;

  const { entidades, conteo, errores, warnings, duplicados } = preview;
  const tieneProblemas = errores.length > 0;

  return (
    <div className="space-y-4">
      {/* Resumen */}
      <div className="flex items-center gap-4 p-3 bg-blue-50 rounded-lg">
        <div className="text-center">
          <span className="text-lg font-bold text-blue-700">{conteo.etapas}</span>
          <p className="text-xs text-blue-600">Etapas</p>
        </div>
        <div className="text-center">
          <span className="text-lg font-bold text-blue-700">{conteo.acciones}</span>
          <p className="text-xs text-blue-600">Acciones</p>
        </div>
        <div className="text-center">
          <span className="text-lg font-bold text-blue-700">{conteo.subacciones}</span>
          <p className="text-xs text-blue-600">Subacciones</p>
        </div>
        <div className="ml-auto text-xs text-gray-500">
          Total: {conteo.etapas + conteo.acciones + conteo.subacciones} entidades a crear
        </div>
      </div>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle size={14} className="text-amber-500" />
            <span className="text-xs font-medium text-amber-700">{warnings.length} advertencia(s)</span>
          </div>
          <ul className="text-xs text-amber-600 space-y-0.5 max-h-24 overflow-y-auto">
            {warnings.map((w, i) => (
              <li key={i}>Fila {w.fila}: {w.mensaje}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Duplicados */}
      {duplicados.length > 0 && (
        <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
          <div className="flex items-center gap-2 mb-1">
            <AlertCircle size={14} className="text-orange-500" />
            <span className="text-xs font-medium text-orange-700">
              {duplicados.length} duplicado(s) detectados (se saltarán automáticamente)
            </span>
          </div>
          <ul className="text-xs text-orange-600 space-y-0.5 max-h-24 overflow-y-auto">
            {duplicados.map((d, i) => (
              <li key={i}>{d.mensaje}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Errores */}
      {errores.length > 0 && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center gap-2 mb-1">
            <AlertCircle size={14} className="text-red-500" />
            <span className="text-xs font-medium text-red-700">{errores.length} error(es) — no se puede importar</span>
          </div>
          <ul className="text-xs text-red-600 space-y-0.5">
            {errores.map((e, i) => (
              <li key={i}>Fila {e.fila}: {e.mensaje}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Árbol */}
      <div className="border rounded-lg overflow-hidden">
        <div className="bg-gray-50 px-3 py-2 border-b">
          <span className="text-xs font-medium text-gray-600">Estructura a importar</span>
        </div>
        <div className="max-h-72 overflow-y-auto p-3">
          <ArbolPreview entidades={entidades} />
        </div>
      </div>

      {/* Error de confirmación */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}

      {/* Botón confirmar */}
      <div className="flex justify-end gap-3 pt-2">
        <button
          onClick={onCerrar}
          className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
        >
          Cancelar
        </button>
        <button
          onClick={ejecutarImport}
          disabled={tieneProblemas || importando}
          className="flex items-center gap-1.5 px-5 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {importando ? (
            <><Loader2 size={14} className="animate-spin" /> Importando...</>
          ) : (
            <><Check size={14} /> Confirmar importación</>
          )}
        </button>
      </div>
    </div>
  );
}
