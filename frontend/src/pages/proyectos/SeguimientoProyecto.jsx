/**
 * ARCHIVO: SeguimientoProyecto.jsx
 * PROPÓSITO: Ruta /proyectos/:id/seguimiento — subsecciones (Detalle,
 *            Diagrama, Vista lista, Mapa, Cronograma) + Importar/
 *            Exportar/Reporte PDF. Contenido igual al que antes vivía
 *            en la pestaña "Seguimiento" de DetalleProyecto.jsx; la
 *            limpieza de esta barra (control segmentado, menú "Datos y
 *            reportes", botón "Registrar avance") es trabajo de la
 *            Fase 3 de este rediseño, no de esta fase.
 */
import { useState, Suspense, lazy } from 'react';
import { useOutletContext } from 'react-router-dom';
import { FileSpreadsheet, Table2, MapPin, GitBranch, BarChart3, Settings, Loader2 } from 'lucide-react';
import EtapasAvancesMD from '../../components/seguimiento/EtapasAvancesMD';
const VistaDiagrama = lazy(() => import('../../components/seguimiento/VistaDiagrama'));
import VistaLista from '../../components/seguimiento/VistaLista';
import MapaProyecto from '../../components/seguimiento/MapaProyecto';
import GanttCronograma from '../../components/seguimiento/GanttCronograma';
import ModalNuevaEtapa from '../../components/seguimiento/ModalNuevaEtapa';
import ImportarWizard from '../../components/importar/ImportarWizard';
import PanelLotesImportacion from '../../components/importar/PanelLotesImportacion';
import BotonExportar from '../../components/proyectos/BotonExportar';
import GenerarReporteBtn from '../../components/reportes/GenerarReporteBtn';
import { useUI } from '../../context/UIContext';
import * as etapasApi from '../../api/etapas';

const SUBSECCIONES = [
  { id: 'etapas', etiqueta: 'Detalle', icono: Settings },
  { id: 'diagrama', etiqueta: 'Diagrama', icono: GitBranch },
  { id: 'lista', etiqueta: 'Vista lista', icono: Table2 },
  { id: 'mapa', etiqueta: 'Mapa', icono: MapPin },
  { id: 'cronograma', etiqueta: 'Cronograma', icono: BarChart3 },
];

export default function SeguimientoProyecto() {
  const {
    proyecto, etapas, permisos, dgSeleccionada, proyectoId: id,
    recargarEtapas, recargarEtapasSilencioso, recargarProyectoSilencioso, incrementarStats,
  } = useOutletContext();
  const { mostrarToast } = useUI();
  const [subseccionActiva, setSubseccionActiva] = useState('etapas');
  const [modalEtapa, setModalEtapa] = useState(false);
  const [modalCSV, setModalCSV] = useState(false);

  async function crearEtapaHandler(datos) {
    try {
      await etapasApi.crearEtapa(id, datos);
      mostrarToast('Etapa creada exitosamente', 'exito');
      setModalEtapa(false);
      recargarEtapas();
      incrementarStats();
    } catch (err) {
      mostrarToast(err.response?.data?.mensaje || 'Error al crear etapa', 'error');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 flex-1 min-w-0">
          {SUBSECCIONES.map(sub => (
            <button
              key={sub.id}
              onClick={() => setSubseccionActiva(sub.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md transition-all flex-1 justify-center ${
                subseccionActiva === sub.id
                  ? 'bg-white text-guinda-600 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <sub.icono size={14} />
              <span className="hidden sm:inline">{sub.etiqueta}</span>
            </button>
          ))}
        </div>
        {subseccionActiva === 'etapas' && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={() => setModalCSV(true)}
              className="btn-secondary text-sm flex items-center gap-1.5">
              <FileSpreadsheet size={14} /> Importar
            </button>
            <PanelLotesImportacion
              proyectoId={id}
              onDeshecho={() => { recargarEtapasSilencioso(); recargarProyectoSilencioso(); incrementarStats(); }}
            />
            <BotonExportar proyectoId={id} />
            <GenerarReporteBtn proyectoId={id} proyecto={proyecto} />
          </div>
        )}
      </div>

      {subseccionActiva === 'diagrama' && (
        <Suspense fallback={
          <div className="flex items-center justify-center py-16 border border-gray-200 rounded-xl bg-white" style={{ minHeight: '600px' }}>
            <Loader2 size={24} className="animate-spin text-gray-400" />
            <span className="ml-2 text-sm text-gray-500">Cargando diagrama...</span>
          </div>
        }>
          <VistaDiagrama proyectoId={id} permisos={permisos} />
        </Suspense>
      )}

      {subseccionActiva === 'etapas' && (
        <div className="space-y-3">
          <EtapasAvancesMD
            proyectoId={id}
            proyecto={proyecto}
            permisos={permisos}
            dgSeleccionada={dgSeleccionada}
            onStatsChange={() => { recargarEtapasSilencioso(); incrementarStats(); }}
          />
        </div>
      )}

      {subseccionActiva === 'lista' && (
        <VistaLista
          etapas={etapas}
          proyectoId={id}
          onRefresh={() => { recargarEtapasSilencioso(); incrementarStats(); }}
        />
      )}

      {subseccionActiva === 'mapa' && (
        <MapaProyecto
          proyectoId={id}
          onNavegarEtapas={() => setSubseccionActiva('etapas')}
        />
      )}

      {subseccionActiva === 'cronograma' && (
        <GanttCronograma
          etapas={etapas}
          fechaInicioProyecto={proyecto.fecha_inicio}
          fechaFinProyecto={proyecto.fecha_limite}
        />
      )}

      {modalEtapa && (
        <ModalNuevaEtapa
          proyecto={proyecto}
          etapas={etapas}
          onGuardar={crearEtapaHandler}
          onCerrar={() => setModalEtapa(false)}
        />
      )}

      {modalCSV && (
        <ImportarWizard
          proyectoId={id}
          onImportado={() => { recargarEtapasSilencioso(); recargarProyectoSilencioso(); incrementarStats(); }}
          onCerrar={() => setModalCSV(false)}
        />
      )}
    </div>
  );
}
