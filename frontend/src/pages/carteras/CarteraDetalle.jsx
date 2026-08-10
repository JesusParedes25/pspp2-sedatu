/**
 * ARCHIVO: CarteraDetalle.jsx
 * PROPÓSITO: Tablero de una cartera de proyectos — pestañas Resumen
 *            (distribución por estado, riesgos, próximos vencimientos;
 *            deliberadamente SIN un % de avance único, ver
 *            carteras.queries.js) y Proyectos (alta/baja de proyectos,
 *            marcar cartera principal).
 *
 * Cronograma, Mapa y Actividad (vistas cruzadas de todos los proyectos
 * de la cartera) quedan pendientes para una siguiente iteración.
 */
import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Briefcase, Pencil, Trash2, AlertTriangle, Clock,
  LayoutDashboard, FolderKanban, Plus, Star, X, Loader2, Building2,
} from 'lucide-react';
import { useCartera } from '../../hooks/useCarteras';
import { useUI } from '../../context/UIContext';
import * as carterasApi from '../../api/carteras';
import EstadoChip from '../../components/common/EstadoChip';
import EmptyState from '../../components/common/EmptyState';
import ModalCartera from '../../components/carteras/ModalCartera';
import ModalAgregarProyectos from '../../components/carteras/ModalAgregarProyectos';

const PESTANAS = [
  { id: 'resumen', etiqueta: 'Resumen', icono: LayoutDashboard },
  { id: 'proyectos', etiqueta: 'Proyectos', icono: FolderKanban },
];

const ETIQUETA_DIST = {
  concluido: 'Concluidos',
  en_proceso: 'En proceso',
  vencido: 'Vencidos',
  pausado: 'Pausados',
  sin_iniciar: 'Sin iniciar',
};
const COLOR_DIST = {
  concluido: 'bg-green-500',
  en_proceso: 'bg-blue-500',
  vencido: 'bg-red-500',
  pausado: 'bg-gray-400',
  sin_iniciar: 'bg-gray-300',
};

export default function CarteraDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { mostrarToast } = useUI();
  const { cartera, proyectos, resumen, cargando, error, recargar } = useCartera(id);
  const [pestanaActiva, setPestanaActiva] = useState('resumen');
  const [mostrarEditar, setMostrarEditar] = useState(false);
  const [mostrarAgregar, setMostrarAgregar] = useState(false);
  const [mostrarEliminar, setMostrarEliminar] = useState(false);

  if (cargando) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400 gap-2">
        <Loader2 size={18} className="animate-spin" /> Cargando cartera...
      </div>
    );
  }

  if (error || !cartera) {
    return (
      <EmptyState
        icono={Briefcase}
        titulo="Cartera no encontrada"
        subtitulo={error || 'La cartera que buscas no existe o fue eliminada.'}
        accion="Volver a proyectos"
        onAccion={() => navigate('/proyectos')}
      />
    );
  }

  const totalDist = resumen ? Object.values(resumen.distribucion).reduce((a, b) => a + b, 0) : 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <Link to="/proyectos?vista=agrupado" className="flex items-center gap-1 text-xs text-gray-400 hover:text-guinda-600 mb-2 transition-colors w-fit">
          <ArrowLeft size={13} /> Volver a carteras
        </Link>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Briefcase size={20} className="text-guinda-500 flex-shrink-0" />
              <h1 className="text-2xl font-bold text-gray-900">{cartera.nombre}</h1>
            </div>
            {cartera.descripcion && <p className="text-sm text-gray-500 mt-1">{cartera.descripcion}</p>}
            <div className="flex items-center gap-3 mt-2 flex-wrap text-xs text-gray-500">
              {cartera.dg_lider_siglas && (
                <span className="inline-flex items-center gap-1">
                  <Building2 size={12} /> {cartera.dg_lider_siglas}
                </span>
              )}
              {cartera.responsable_nombre && <span>Responsable: {cartera.responsable_nombre}</span>}
              {(cartera.fecha_inicio || cartera.fecha_fin) && (
                <span>{cartera.fecha_inicio?.slice(0, 10) || '—'} a {cartera.fecha_fin?.slice(0, 10) || '—'}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={() => setMostrarEditar(true)} className="btn-secondary text-xs flex items-center gap-1.5">
              <Pencil size={13} /> Editar
            </button>
            <button onClick={() => setMostrarEliminar(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50">
              <Trash2 size={13} /> Eliminar
            </button>
          </div>
        </div>
      </div>

      {/* Pestañas */}
      <div className="border-b border-gray-200">
        <div className="flex gap-6">
          {PESTANAS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setPestanaActiva(tab.id)}
              aria-pressed={pestanaActiva === tab.id}
              className={`flex items-center gap-2 px-1 py-3 text-sm font-medium border-b-2 transition-colors ${
                pestanaActiva === tab.id
                  ? 'border-guinda-500 text-guinda-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <tab.icono size={16} />
              {tab.etiqueta}
            </button>
          ))}
        </div>
      </div>

      {/* Resumen */}
      {pestanaActiva === 'resumen' && resumen && (
        <div className="space-y-5">
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Distribución por estado — {resumen.total_proyectos} proyecto(s)</h2>
            {totalDist === 0 ? (
              <p className="text-sm text-gray-400 italic">Sin proyectos en esta cartera todavía.</p>
            ) : (
              <>
                <div className="flex h-3 rounded-full overflow-hidden mb-3">
                  {Object.entries(resumen.distribucion).filter(([, v]) => v > 0).map(([clave, valor]) => (
                    <div key={clave} className={COLOR_DIST[clave]} style={{ width: `${(valor / totalDist) * 100}%` }} title={`${ETIQUETA_DIST[clave]}: ${valor}`} />
                  ))}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                  {Object.entries(resumen.distribucion).map(([clave, valor]) => (
                    <span key={clave} className="flex items-center gap-1.5 text-xs text-gray-600">
                      <span className={`w-2 h-2 rounded-full ${COLOR_DIST[clave]}`} />
                      {ETIQUETA_DIST[clave]}: <strong>{valor}</strong>
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="card p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
                <AlertTriangle size={14} className="text-orange-500" /> Riesgos abiertos ({resumen.riesgos.length})
              </h2>
              {resumen.riesgos.length === 0 ? (
                <p className="text-xs text-gray-400 italic">Sin riesgos abiertos en los proyectos de esta cartera.</p>
              ) : (
                <div className="space-y-2.5 max-h-80 overflow-y-auto">
                  {resumen.riesgos.map(r => (
                    <Link key={r.id} to={`/proyectos/${r.id_proyecto}`} className="block p-2 rounded-lg hover:bg-gray-50 transition-colors">
                      <p className="text-xs font-medium text-gray-800 truncate">{r.titulo}</p>
                      <p className="text-[11px] text-gray-400 truncate">{r.proyecto_nombre} · nivel {r.nivel}</p>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <div className="card p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
                <Clock size={14} className="text-amber-500" /> Próximos vencimientos ({resumen.por_vencer.length})
              </h2>
              {resumen.por_vencer.length === 0 ? (
                <p className="text-xs text-gray-400 italic">Sin vencimientos en los próximos 30 días.</p>
              ) : (
                <div className="space-y-2.5 max-h-80 overflow-y-auto">
                  {resumen.por_vencer.map(p => (
                    <Link key={p.id} to={`/proyectos/${p.id}`} className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 transition-colors">
                      <span className="text-xs text-gray-700 truncate">{p.nombre}</span>
                      <span className="text-[11px] text-gray-400 flex-shrink-0 ml-2">{p.fecha_limite?.slice(0, 10)}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Proyectos */}
      {pestanaActiva === 'proyectos' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">{proyectos.length} proyecto(s) en esta cartera</p>
            <div className="flex items-center gap-2">
              <Link to={`/proyectos/nuevo?cartera_id=${id}`} className="btn-secondary text-xs flex items-center gap-1.5">
                <Plus size={14} /> Nuevo proyecto
              </Link>
              <button onClick={() => setMostrarAgregar(true)} className="btn-primary text-xs flex items-center gap-1.5">
                <Plus size={14} /> Agregar existentes
              </button>
            </div>
          </div>

          {proyectos.length === 0 ? (
            <EmptyState
              icono={FolderKanban}
              titulo="Sin proyectos"
              subtitulo="Esta cartera todavía no tiene proyectos asociados."
              accion="Agregar proyectos"
              onAccion={() => setMostrarAgregar(true)}
            />
          ) : (
            <div className="card divide-y divide-gray-100">
              {proyectos.map(p => (
                <FilaProyectoCartera key={p.id} proyecto={p} carteraId={id} onCambio={recargar} />
              ))}
            </div>
          )}
        </div>
      )}

      {mostrarEditar && (
        <ModalCartera
          cartera={cartera}
          onCerrar={() => setMostrarEditar(false)}
          onGuardada={() => { setMostrarEditar(false); recargar(); }}
        />
      )}

      {mostrarAgregar && (
        <ModalAgregarProyectos
          carteraId={id}
          idsExcluidos={proyectos.map(p => p.id)}
          onCerrar={() => setMostrarAgregar(false)}
          onAgregados={() => { setMostrarAgregar(false); recargar(); }}
        />
      )}

      {mostrarEliminar && (
        <ModalEliminarCartera
          cartera={cartera}
          onCerrar={() => setMostrarEliminar(false)}
          onEliminada={() => { mostrarToast('Cartera eliminada', 'exito'); navigate('/proyectos?vista=agrupado'); }}
        />
      )}
    </div>
  );
}

function FilaProyectoCartera({ proyecto, carteraId, onCambio }) {
  const { mostrarToast } = useUI();
  const [procesando, setProcesando] = useState(false);

  async function quitar() {
    if (!window.confirm(`¿Quitar "${proyecto.nombre}" de esta cartera? El proyecto no se elimina, solo se desvincula.`)) return;
    setProcesando(true);
    try {
      await carterasApi.quitarProyectoDeCartera(carteraId, proyecto.id);
      mostrarToast('Proyecto quitado de la cartera', 'exito');
      onCambio();
    } catch (err) {
      mostrarToast(err.response?.data?.mensaje || 'Error al quitar el proyecto', 'error');
    } finally {
      setProcesando(false);
    }
  }

  async function marcarPrincipal() {
    setProcesando(true);
    try {
      await carterasApi.agregarProyectosACartera(carteraId, [proyecto.id], true);
      mostrarToast('Cartera marcada como principal para este proyecto', 'exito');
      onCambio();
    } catch (err) {
      mostrarToast(err.response?.data?.mensaje || 'Error al actualizar', 'error');
    } finally {
      setProcesando(false);
    }
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <Link to={`/proyectos/${proyecto.id}`} className="text-sm font-medium text-gray-800 hover:text-guinda-600 truncate block">
          {proyecto.nombre}
        </Link>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <EstadoChip estado={proyecto.estado} />
          {proyecto.dg_siglas && <span className="text-[10px] text-gray-400">{proyecto.dg_siglas}</span>}
          {parseInt(proyecto.riesgos_abiertos) > 0 && (
            <span className="flex items-center text-[10px] text-orange-500">
              <AlertTriangle size={10} className="mr-0.5" /> {proyecto.riesgos_abiertos}
            </span>
          )}
          {proyecto.vencido && <span className="text-[10px] text-red-500 font-medium">Vencido</span>}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {proyecto.es_principal ? (
          <span className="flex items-center gap-1 text-[11px] text-guinda-600 font-medium" title="Cartera principal de este proyecto">
            <Star size={12} className="fill-guinda-500 text-guinda-500" /> Principal
          </span>
        ) : (
          <button onClick={marcarPrincipal} disabled={procesando} className="text-[11px] text-gray-400 hover:text-guinda-600 disabled:opacity-40">
            Marcar principal
          </button>
        )}
        <button onClick={quitar} disabled={procesando} className="p-1 text-gray-300 hover:text-red-500 disabled:opacity-40" title="Quitar de esta cartera">
          <X size={15} />
        </button>
      </div>
    </div>
  );
}

function ModalEliminarCartera({ cartera, onCerrar, onEliminada }) {
  const { mostrarToast } = useUI();
  const [afectados, setAfectados] = useState(null);
  const [eliminando, setEliminando] = useState(false);

  useEffect(() => {
    carterasApi.confirmarEliminarCartera(cartera.id)
      .then(res => setAfectados(res.datos.proyectos_afectados))
      .catch(() => setAfectados(0));
  }, [cartera.id]);

  async function eliminar() {
    setEliminando(true);
    try {
      await carterasApi.eliminarCartera(cartera.id);
      onEliminada();
    } catch (err) {
      mostrarToast(err.response?.data?.mensaje || 'Error al eliminar la cartera', 'error');
      setEliminando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4" onClick={onCerrar}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <AlertTriangle size={17} className="text-red-500" />
            <h2 className="text-sm font-bold text-gray-900">Eliminar cartera</h2>
          </div>
          <button onClick={onCerrar} className="p-1 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <p className="text-sm text-gray-700">
            Estás a punto de eliminar la cartera <strong>"{cartera.nombre}"</strong>. Los proyectos que contiene <strong>no se eliminan</strong>, solo se desvinculan de ella.
          </p>
          {afectados === null ? (
            <p className="text-xs text-gray-400">Verificando proyectos afectados...</p>
          ) : afectados > 0 ? (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-xs text-amber-800">
                ⚠ <strong>{afectados}</strong> proyecto(s) tienen esta cartera como su cartera <strong>principal</strong> — al eliminarla, quedarán sin cartera principal (podrás asignarles otra después).
              </p>
            </div>
          ) : (
            <p className="text-xs text-gray-500">Ningún proyecto tiene esta cartera como principal.</p>
          )}
        </div>
        <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-gray-100 bg-gray-50 rounded-b-xl">
          <button onClick={onCerrar} className="px-3.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg">
            Cancelar
          </button>
          <button onClick={eliminar} disabled={eliminando || afectados === null}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed">
            {eliminando && <Loader2 size={12} className="animate-spin" />}
            Sí, eliminar cartera
          </button>
        </div>
      </div>
    </div>
  );
}
