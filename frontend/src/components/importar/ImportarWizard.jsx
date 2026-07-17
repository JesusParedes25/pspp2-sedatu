/**
 * ARCHIVO: ImportarWizard.jsx
 * PROPÓSITO: Contenedor principal del wizard de importación.
 *
 * Flujo de 5 pasos:
 *   1. Subir archivo (auto-detecta headers)
 *   2. Nivel de la fila (Componentes / Acciones / Tareas)
 *   3. Mapeo de propiedades
 *   4. Relación jerárquica (solo si Acciones o Tareas)
 *   5. Preview y confirmar
 */
import { useState, useCallback } from 'react';
import { X, Upload, Layers, Map, Link2, Eye, Sparkles } from 'lucide-react';
import PasoUpload from './PasoUpload';
import PasoNivel from './PasoNivel';
import PasoMapeo from './PasoMapeo';
import PasoRelacion from './PasoRelacion';
import PasoPreview from './PasoPreview';
import PasoMultiHoja from './PasoMultiHoja';
import * as importarApi from '../../api/importar';

const PASOS_BASE = [
  { id: 'upload', etiqueta: 'Subir archivo', icono: Upload },
  { id: 'nivel', etiqueta: 'Nivel de la fila', icono: Layers },
  { id: 'mapeo', etiqueta: 'Mapeo de propiedades', icono: Map },
  { id: 'relacion', etiqueta: 'Relación jerárquica', icono: Link2 },
  { id: 'preview', etiqueta: 'Preview', icono: Eye },
];

export default function ImportarWizard({ proyectoId, onImportado, onCerrar }) {
  const [pasoActivo, setPasoActivo] = useState(0);
  const [pasosVisitados, setPasosVisitados] = useState(new Set([0]));

  // Estado global del wizard
  const [fileId, setFileId] = useState(null);
  const [filename, setFilename] = useState('');
  const [sheetNames, setSheetNames] = useState([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [totalRows, setTotalRows] = useState(0);
  const [vistaPrevia, setVistaPrevia] = useState([]);

  // Config acumulada
  const [config, setConfig] = useState({
    headerRow: 1,
    superHeaderRow: null,
    dataStartRow: 2,
    rowLevel: 'etapa',
    parentColumn: null,
    columnMap: {},
    pivotBlocks: [],
    valueMap: {},
  });

  // Headers extraídos
  const [headers, setHeaders] = useState([]);
  const [superHeaders, setSuperHeaders] = useState(null);
  const [sampleRows, setSampleRows] = useState([]);
  const [totalDataRows, setTotalDataRows] = useState(0);

  // Multi-hoja (formato universal)
  const [multiHoja, setMultiHoja] = useState(null);

  // Loading / error
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);
  const [sugerencia, setSugerencia] = useState(null);

  // Determinar si el paso Relación es necesario
  const necesitaRelacion = config.rowLevel === 'accion' || config.rowLevel === 'subaccion';

  // Pasos visibles (filtrar Relación si es Componentes)
  const pasosVisibles = necesitaRelacion
    ? PASOS_BASE
    : PASOS_BASE.filter(p => p.id !== 'relacion');

  // Navegar a un paso (por índice en pasosVisibles)
  const irAPaso = useCallback((idx) => {
    setPasoActivo(idx);
    setPasosVisitados(prev => new Set([...prev, idx]));
  }, []);

  // Avanzar al siguiente paso
  const avanzar = useCallback(() => {
    const siguiente = pasoActivo + 1;
    if (siguiente < pasosVisibles.length) {
      irAPaso(siguiente);
    }
  }, [pasoActivo, irAPaso, pasosVisibles.length]);

  // Actualizar config parcialmente
  const actualizarConfig = useCallback((parcial) => {
    setConfig(prev => ({ ...prev, ...parcial }));
  }, []);

  // Aplicar una plantilla sugerida: cargar su config completa y saltar a Preview
  const aplicarPlantilla = useCallback((plantilla) => {
    const c = plantilla.config;
    const nuevoRowLevel = c.rowLevel || 'etapa';
    const conRelacion = nuevoRowLevel === 'accion' || nuevoRowLevel === 'subaccion';
    const nuevosPasos = conRelacion
      ? PASOS_BASE
      : PASOS_BASE.filter(p => p.id !== 'relacion');
    const idxPreview = nuevosPasos.findIndex(p => p.id === 'preview');

    setConfig({
      headerRow: c.headerRow || 1,
      superHeaderRow: c.superHeaderRow || null,
      dataStartRow: c.dataStartRow || 2,
      rowLevel: nuevoRowLevel,
      parentColumn: c.parentColumn || null,
      columnMap: c.columnMap || {},
      pivotBlocks: c.pivotBlocks || [],
      valueMap: c.valueMap || {},
      duplicateKey: c.duplicateKey || null,
      hierarchy: c.hierarchy || null,
    });
    setSugerencia(null);
    irAPaso(idxPreview);
  }, [irAPaso]);

  // Cuando se sube el archivo exitosamente — auto-detecta headers
  const onUploadExitoso = useCallback(async (resultado) => {
    setFileId(resultado.fileId);
    setFilename(resultado.filename);
    setSheetNames(resultado.sheetNames);
    setTotalRows(resultado.totalRows);
    setVistaPrevia(resultado.vistaPrevia);
    setError(null);

    // Si se detectó formato multi-hoja, activar flujo simplificado
    if (resultado.multiHoja) {
      setMultiHoja(resultado.multiHoja);
      return; // No avanzar al wizard clásico
    }

    // Heurística: detectar si fila 1 es super-header
    const fila1 = resultado.vistaPrevia[0] || [];
    const fila2 = resultado.vistaPrevia[1] || [];
    const unicos1 = new Set(fila1.filter(c => c && String(c).trim()).map(c => String(c).trim())).size;
    const unicos2 = new Set(fila2.filter(c => c && String(c).trim()).map(c => String(c).trim())).size;
    const tieneSuperHeaders = fila1.length > 4 && unicos1 < unicos2 && unicos2 >= 4 && unicos1 <= Math.ceil(fila1.length / 3);

    const hRow = tieneSuperHeaders ? 2 : 1;
    const shRow = tieneSuperHeaders ? 1 : null;
    const dRow = tieneSuperHeaders ? 3 : 2;

    try {
      const headersRes = await importarApi.extraerHeaders({
        fileId: resultado.fileId,
        headerRow: hRow,
        superHeaderRow: shRow,
        dataStartRow: dRow,
      });
      setHeaders(headersRes.datos.headers);
      setSuperHeaders(headersRes.datos.superHeaders);
      setSampleRows(headersRes.datos.sampleRows);
      setTotalDataRows(headersRes.datos.totalDataRows);
      actualizarConfig({ headerRow: hRow, superHeaderRow: shRow, dataStartRow: dRow });

      // Intentar sugerir plantilla por coincidencia de headers
      try {
        const sugRes = await importarApi.sugerirPlantilla(
          headersRes.datos.headers,
          headersRes.datos.superHeaders
        );
        if (sugRes.datos) {
          setSugerencia(sugRes.datos);
        }
      } catch (_) {
        // No fatal — sin sugerencia, el wizard continúa normal
      }
    } catch (e) {
      // No fatal — headers quedan vacíos pero el wizard sigue
    }

    avanzar();
  }, [avanzar, actualizarConfig]);

  // Renderizar paso activo (basado en pasosVisibles)
  const renderPaso = () => {
    const pasoId = pasosVisibles[pasoActivo]?.id;
    switch (pasoId) {
      case 'upload':
        return <PasoUpload onExito={onUploadExitoso} error={error} setError={setError} />;
      case 'nivel':
        return (
          <PasoNivel
            config={config}
            onCambiar={actualizarConfig}
            onAvanzar={avanzar}
          />
        );
      case 'mapeo':
        return (
          <PasoMapeo
            headers={headers}
            superHeaders={superHeaders}
            sampleRows={sampleRows}
            config={config}
            totalDataRows={totalDataRows}
            onCambiar={actualizarConfig}
            onAvanzar={avanzar}
            proyectoId={proyectoId}
          />
        );
      case 'relacion':
        return (
          <PasoRelacion
            headers={headers}
            sampleRows={sampleRows}
            config={config}
            onCambiar={actualizarConfig}
            onAvanzar={avanzar}
          />
        );
      case 'preview':
        return (
          <PasoPreview
            fileId={fileId}
            config={config}
            proyectoId={proyectoId}
            sheetIndex={sheetIndex}
            onImportado={onImportado}
            onCerrar={onCerrar}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-800">Importar estructura</h2>
          <button onClick={onCerrar} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        {/* Stepper — oculto en modo multi-hoja */}
        {!multiHoja && (
          <div className="px-6 py-3 border-b bg-gray-50">
            <div className="flex items-center gap-1">
              {pasosVisibles.map((paso, idx) => {
                const Icono = paso.icono;
                const activo = idx === pasoActivo;
                const visitado = pasosVisitados.has(idx);
                const clickable = visitado || idx === 0;

                return (
                  <button
                    key={paso.id}
                    onClick={() => clickable && irAPaso(idx)}
                    disabled={!clickable}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      activo
                        ? 'bg-blue-600 text-white'
                        : visitado
                          ? 'bg-blue-50 text-blue-700 hover:bg-blue-100 cursor-pointer'
                          : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    <Icono size={14} />
                    <span className="hidden sm:inline">{paso.etiqueta}</span>
                    <span className="sm:hidden">{idx + 1}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {multiHoja && (
          <div className="px-6 py-2 border-b bg-green-50 flex items-center justify-between">
            <p className="text-xs text-green-700 font-medium">
              📊 Formato multi-hoja detectado — Importación rápida
            </p>
            <button
              onClick={async () => {
                setMultiHoja(null);
                // Extraer headers si no se hizo antes
                if (headers.length === 0 && fileId) {
                  try {
                    const headersRes = await importarApi.extraerHeaders({
                      fileId, headerRow: 1, superHeaderRow: null, dataStartRow: 2,
                    });
                    setHeaders(headersRes.datos.headers);
                    setSuperHeaders(headersRes.datos.superHeaders);
                    setSampleRows(headersRes.datos.sampleRows);
                    setTotalDataRows(headersRes.datos.totalDataRows);
                    actualizarConfig({ headerRow: 1, superHeaderRow: null, dataStartRow: 2 });
                  } catch (_) {}
                }
                avanzar();
              }}
              className="text-[11px] text-gray-500 hover:text-gray-700 underline"
            >
              Usar formato clásico
            </button>
          </div>
        )}

        {/* Contenido del paso */}
        <div className="flex-1 overflow-auto p-6">
          {cargando && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full" />
              <span className="ml-2 text-sm text-gray-500">Procesando...</span>
            </div>
          )}
          {!cargando && multiHoja && (
            <PasoMultiHoja
              fileId={fileId}
              multiHoja={multiHoja}
              proyectoId={proyectoId}
              onImportado={onImportado}
              onCerrar={onCerrar}
            />
          )}
          {!cargando && !multiHoja && (
            <>
              {sugerencia && pasosVisibles[pasoActivo]?.id !== 'upload' && pasosVisibles[pasoActivo]?.id !== 'preview' && (
                <div className="flex items-center gap-3 p-3 mb-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <Sparkles size={18} className="text-amber-500 shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-amber-800">
                      Plantilla sugerida: <strong>{sugerencia.plantilla.nombre}</strong> ({sugerencia.score}% coincidencia)
                    </p>
                    {sugerencia.plantilla.descripcion && (
                      <p className="text-xs text-amber-600 mt-0.5">{sugerencia.plantilla.descripcion}</p>
                    )}
                  </div>
                  <button
                    onClick={() => aplicarPlantilla(sugerencia.plantilla)}
                    className="px-3 py-1.5 bg-amber-500 text-white text-xs font-medium rounded-md hover:bg-amber-600 shrink-0"
                  >
                    Aplicar y saltar a Preview
                  </button>
                  <button
                    onClick={() => setSugerencia(null)}
                    className="text-amber-400 hover:text-amber-600 shrink-0"
                    title="Descartar sugerencia"
                  >
                    <X size={16} />
                  </button>
                </div>
              )}
              {renderPaso()}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
