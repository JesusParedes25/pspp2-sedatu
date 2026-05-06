/**
 * ARCHIVO: ImportarWizard.jsx
 * PROPÓSITO: Contenedor principal del wizard de importación universal.
 *
 * Gestiona el estado global del wizard, la navegación entre pasos
 * (libre, no lineal), sugerencia de plantilla, y stepper visual.
 */
import { useState, useCallback, useEffect } from 'react';
import { X, Upload, Table2, Layers, Map, Replace, Eye } from 'lucide-react';
import PasoUpload from './PasoUpload';
import PasoEncabezados from './PasoEncabezados';
import PasoNivel from './PasoNivel';
import PasoMapeo from './PasoMapeo';
import PasoValores from './PasoValores';
import PasoPreview from './PasoPreview';
import * as importarApi from '../../api/importar';
import * as plantillasApi from '../../api/plantillas';

const PASOS = [
  { id: 'upload', etiqueta: 'Subir archivo', icono: Upload },
  { id: 'encabezados', etiqueta: 'Encabezados', icono: Table2 },
  { id: 'nivel', etiqueta: 'Nivel', icono: Layers },
  { id: 'mapeo', etiqueta: 'Mapeo', icono: Map },
  { id: 'valores', etiqueta: 'Valores', icono: Replace },
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
    parentEntityId: null,
    hierarchy: { enabled: false, column: null, valueMap: {} },
    columnMap: {},
    pivotBlocks: [],
    valueMap: {},
  });

  // Headers extraídos
  const [headers, setHeaders] = useState([]);
  const [superHeaders, setSuperHeaders] = useState(null);
  const [sampleRows, setSampleRows] = useState([]);
  const [totalDataRows, setTotalDataRows] = useState(0);

  // Plantilla sugerida
  const [sugerencia, setSugerencia] = useState(null);
  const [plantillaAplicada, setPlantillaAplicada] = useState(null);

  // Loading / error
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);

  // Navegar a un paso
  const irAPaso = useCallback((idx) => {
    setPasoActivo(idx);
    setPasosVisitados(prev => new Set([...prev, idx]));
  }, []);

  // Avanzar al siguiente paso
  const avanzar = useCallback(() => {
    const siguiente = pasoActivo + 1;
    if (siguiente < PASOS.length) {
      irAPaso(siguiente);
    }
  }, [pasoActivo, irAPaso]);

  // Cuando se sube el archivo exitosamente
  const onUploadExitoso = useCallback(async (resultado) => {
    setFileId(resultado.fileId);
    setFilename(resultado.filename);
    setSheetNames(resultado.sheetNames);
    setTotalRows(resultado.totalRows);
    setVistaPrevia(resultado.vistaPrevia);
    setError(null);

    // Auto-detectar headers de la fila 1
    try {
      const headersRes = await importarApi.extraerHeaders({
        fileId: resultado.fileId,
        headerRow: 1,
        superHeaderRow: null,
        dataStartRow: 2,
      });
      const h = headersRes.datos.headers;
      setHeaders(h);
      setSuperHeaders(headersRes.datos.superHeaders);
      setSampleRows(headersRes.datos.sampleRows);
      setTotalDataRows(headersRes.datos.totalDataRows);

      // Intentar sugerir plantilla
      const sug = await importarApi.sugerirPlantilla(h);
      if (sug.datos) {
        setSugerencia(sug.datos);
      }
    } catch (e) {
      // No fatal — el usuario puede configurar manualmente
    }

    avanzar();
  }, [avanzar]);

  // Aplicar plantilla sugerida → saltar a preview
  const aplicarPlantilla = useCallback((plantilla) => {
    const c = plantilla.config;
    setConfig(c);
    setPlantillaAplicada(plantilla);
    // Saltar directo a preview (paso 5)
    irAPaso(5);
    // Marcar todos los pasos como visitados
    setPasosVisitados(new Set([0, 1, 2, 3, 4, 5]));
  }, [irAPaso]);

  // Actualizar config parcialmente
  const actualizarConfig = useCallback((parcial) => {
    setConfig(prev => ({ ...prev, ...parcial }));
  }, []);

  // Extraer headers al cambiar configuración de encabezados
  const reextraerHeaders = useCallback(async (headerRow, superHeaderRow, dataStartRow) => {
    if (!fileId) return;
    setCargando(true);
    try {
      const res = await importarApi.extraerHeaders({
        fileId, headerRow, superHeaderRow, dataStartRow, sheetIndex,
      });
      setHeaders(res.datos.headers);
      setSuperHeaders(res.datos.superHeaders);
      setSampleRows(res.datos.sampleRows);
      setTotalDataRows(res.datos.totalDataRows);
      actualizarConfig({ headerRow, superHeaderRow, dataStartRow });
    } catch (e) {
      setError(e.response?.data?.mensaje || e.message);
    } finally {
      setCargando(false);
    }
  }, [fileId, sheetIndex, actualizarConfig]);

  // Renderizar paso activo
  const renderPaso = () => {
    switch (pasoActivo) {
      case 0:
        return <PasoUpload onExito={onUploadExitoso} error={error} setError={setError} />;
      case 1:
        return (
          <PasoEncabezados
            vistaPrevia={vistaPrevia}
            config={config}
            headers={headers}
            superHeaders={superHeaders}
            sampleRows={sampleRows}
            totalDataRows={totalDataRows}
            onCambiar={reextraerHeaders}
            onAvanzar={avanzar}
            sugerencia={sugerencia}
            onAplicarPlantilla={aplicarPlantilla}
          />
        );
      case 2:
        return (
          <PasoNivel
            config={config}
            onCambiar={actualizarConfig}
            onAvanzar={avanzar}
            proyectoId={proyectoId}
          />
        );
      case 3:
        return (
          <PasoMapeo
            headers={headers}
            superHeaders={superHeaders}
            sampleRows={sampleRows}
            config={config}
            onCambiar={actualizarConfig}
            onAvanzar={avanzar}
          />
        );
      case 4:
        return (
          <PasoValores
            config={config}
            headers={headers}
            sampleRows={sampleRows}
            onCambiar={actualizarConfig}
            onAvanzar={avanzar}
          />
        );
      case 5:
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

        {/* Stepper */}
        <div className="px-6 py-3 border-b bg-gray-50">
          <div className="flex items-center gap-1">
            {PASOS.map((paso, idx) => {
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

        {/* Contenido del paso */}
        <div className="flex-1 overflow-auto p-6">
          {cargando && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full" />
              <span className="ml-2 text-sm text-gray-500">Procesando...</span>
            </div>
          )}
          {!cargando && renderPaso()}
        </div>
      </div>
    </div>
  );
}
