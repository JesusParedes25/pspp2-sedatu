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

function TarjetaKPI({ etiqueta, valor, color = 'text-gray-900', nota }) {
  return (
    <div className="card p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">{etiqueta}</p>
      <p className={`text-2xl font-extrabold tabular-nums ${color}`}>{valor}</p>
      {nota && <p className="text-[11px] text-gray-400 mt-1 truncate">{nota}</p>}
    </div>
  );
}

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
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
            <TarjetaKPI etiqueta="Proyectos" valor={resumen.total_proyectos} />
            <TarjetaKPI etiqueta="En riesgo" valor={resumen.proyectos_en_riesgo} color="text-red-600"
              nota="vencidos o con riesgo reportado" />
            <TarjetaKPI etiqueta="Por vencer (30 días)" valor={resumen.por_vencer.length} color="text-amber-600"
              nota={resumen.por_vencer[0] ? `${resumen.por_vencer[0].nombre} — ${resumen.por_vencer[0].dias_restantes}d` : undefined} />
            <TarjetaKPI etiqueta="Concluidos" valor={resumen.distribucion.concluido} color="text-green-600"
              nota={`de ${resumen.total_proyectos} proyecto(s)`} />
          </div>

          {/* Distribución por estado */}
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-1">Distribución por estado</h2>
            <p className="text-xs text-gray-400 mb-3">
              No se promedia el avance de los proyectos de la cartera — uno de 3 etapas no es comparable con uno de 40. En su lugar, cuántos hay en cada estado.
            </p>
            {totalDist === 0 ? (
              <p className="text-sm text-gray-400 italic">Sin proyectos en esta cartera todavía.</p>
            ) : (
              <>
                <div className="flex h-3.5 rounded-full overflow-hidden mb-3">
                  {Object.entries(resumen.distribucion).filter(([, v]) => v > 0).map(([clave, valor]) => (
                    <div key={clave} className={COLOR_DIST[clave]} style={{ width: `${(valor / totalDist) * 100}%` }} title={`${ETIQUETA_DIST[clave]}: ${valor}`} />
                  ))}
                </div>
                <div className="flex flex-wrap gap-x-5 gap-y-1.5">
                  {Object.entries(resumen.distribucion).map(([clave, valor]) => (
                    <span key={clave} className="flex items-center gap-1.5 text-xs text-gray-600">
                      <span className={`w-2.5 h-2.5 rounded-full ${COLOR_DIST[clave]}`} />
                      <strong className="text-gray-800">{valor}</strong> {ETIQUETA_DIST[clave].toLowerCase()}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Atención inmediata: vencidos + riesgos abiertos, juntos */}
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-1 flex items-center gap-1.5">
              <AlertTriangle size={14} className="text-red-500" /> Atención inmediata
            </h2>
            <p className="text-xs text-gray-400 mb-3">Proyectos vencidos o con riesgo abierto reportado por su responsable.</p>
            {resumen.vencidos.length === 0 && resumen.riesgos.length === 0 ? (
              <p className="text-sm text-gray-400 italic">Sin proyectos vencidos ni riesgos abiertos en esta cartera.</p>
            ) : (
              <div className="space-y-2.5 max-h-96 overflow-y-auto">
                {resumen.vencidos.map(p => (
                  <Link key={`v-${p.id}`} to={`/proyectos/${p.id}`}
                    className="flex gap-3 items-start bg-red-50 border border-red-100 rounded-lg p-3 hover:border-red-300 transition-colors">
                    <AlertTriangle size={15} className="text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-red-900 leading-relaxed">
                      <strong>{p.nombre}</strong> — vencido hace {p.dias_vencido} día{p.dias_vencido !== 1 ? 's' : ''}.
                      {p.dg_siglas && <span className="text-red-700"> {p.dg_siglas}</span>}
                    </p>
                  </Link>
                ))}
                {resumen.riesgos.map(r => (
                  <Link key={`r-${r.id}`} to={`/proyectos/${r.id_proyecto}`}
                    className="flex gap-3 items-start bg-red-50 border border-red-100 rounded-lg p-3 hover:border-red-300 transition-colors">
                    <AlertTriangle size={15} className="text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-red-900 leading-relaxed">
                      <strong>{r.proyecto_nombre}</strong> — riesgo reportado ({r.nivel}): {r.titulo}.
                      {r.responsable_nombre && <span className="text-red-700"> {r.responsable_nombre}{r.dg_siglas ? ` · ${r.dg_siglas}` : ''}</span>}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Próximos vencimientos (aún no vencidos) */}
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
              <Clock size={14} className="text-amber-500" /> Próximos vencimientos ({resumen.por_vencer.length})
            </h2>
            {resumen.por_vencer.length === 0 ? (
              <p className="text-xs text-gray-400 italic">Sin vencimientos en los próximos 30 días.</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {resumen.por_vencer.map(p => (
                  <Link key={p.id} to={`/proyectos/${p.id}`} className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 transition-colors">
                    <span className="text-xs text-gray-700 truncate">{p.nombre}</span>
                    <span className="text-[11px] text-amber-600 font-medium flex-shrink-0 ml-2">en {p.dias_restantes}d — {p.fecha_limite?.slice(0, 10)}</span>
                  </Link>
                ))}
              </div>
            )}
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
            <div className="card p-5 overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wide text-gray-400 font-semibold border-b border-gray-200">
                    <th className="pb-2.5 pr-3">Proyecto</th>
                    <th className="pb-2.5 pr-3">Dependencia</th>
                    <th className="pb-2.5 pr-3">Estatus</th>
                    <th className="pb-2.5 pr-3 w-40">Avance</th>
                    <th className="pb-2.5 pr-3">Responsable</th>
                    <th className="pb-2.5 pr-3">Fecha límite</th>
                    <th className="pb-2.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {proyectos.map(p => (
                    <FilaProyectoCartera key={p.id} proyecto={p} carteraId={id} onCambio={recargar} />
                  ))}
                </tbody>
              </table>
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

  const punto = puntoEstado(proyecto);
  const avance = Math.round(parseFloat(proyecto.porcentaje_calculado) || 0);

  return (
    <tr className="border-b border-gray-50 last:border-0 hover:bg-guinda-50/40 transition-colors">
      <td className="py-2.5 pr-3">
        <Link to={`/proyectos/${proyecto.id}`} className="text-sm font-medium text-gray-800 hover:text-guinda-600">
          {proyecto.nombre}
        </Link>
        <div className="flex items-center gap-1.5 mt-0.5">
          {proyecto.es_principal && (
            <span className="flex items-center gap-0.5 text-[10px] text-guinda-600 font-semibold" title="Cartera principal de este proyecto">
              <Star size={10} className="fill-guinda-500 text-guinda-500" /> Principal
            </span>
          )}
          {parseInt(proyecto.riesgos_abiertos) > 0 && (
            <span className="flex items-center text-[10px] text-orange-500">
              <AlertTriangle size={10} className="mr-0.5" /> {proyecto.riesgos_abiertos} riesgo(s)
            </span>
          )}
        </div>
      </td>
      <td className="py-2.5 pr-3">
        {proyecto.dg_siglas && (
          <span className="text-[10px] font-semibold bg-blue-50 text-blue-700 rounded px-1.5 py-0.5">{proyecto.dg_siglas}</span>
        )}
      </td>
      <td className="py-2.5 pr-3">
        <span className="flex items-center gap-1.5 text-xs text-gray-700 whitespace-nowrap">
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${punto.color}`} />
          {punto.texto}
        </span>
      </td>
      <td className="py-2.5 pr-3">
        <div className="flex items-center gap-2">
          <span className="w-16 h-1.5 rounded-full bg-gray-100 overflow-hidden inline-block flex-shrink-0">
            <span className={`block h-full rounded-full ${punto.color}`} style={{ width: `${avance}%` }} />
          </span>
          <span className="text-xs font-semibold text-gray-700 tabular-nums">{avance}%</span>
        </div>
      </td>
      <td className="py-2.5 pr-3 text-xs text-gray-600 whitespace-nowrap">{proyecto.creador_nombre || '—'}</td>
      <td className="py-2.5 pr-3 text-xs text-gray-600 whitespace-nowrap">{proyecto.fecha_limite?.slice(0, 10) || '—'}</td>
      <td className="py-2.5 text-right whitespace-nowrap">
        {!proyecto.es_principal && (
          <button onClick={marcarPrincipal} disabled={procesando} className="text-[11px] text-gray-400 hover:text-guinda-600 disabled:opacity-40 mr-2">
            Marcar principal
          </button>
        )}
        <button onClick={quitar} disabled={procesando} className="p-1 text-gray-300 hover:text-red-500 disabled:opacity-40 align-middle" title="Quitar de esta cartera">
          <X size={14} />
        </button>
      </td>
    </tr>
  );
}

// Punto de color + etiqueta de estatus para la tabla de proyectos — igual
// criterio que el resto de la plataforma (vencido pesa más que el estado
// crudo), pero en el formato compacto punto+texto del mockup.
function puntoEstado(p) {
  if (p.vencido) return { color: 'bg-red-500', texto: 'Vencido' };
  if (p.estado === 'Completada') return { color: 'bg-green-500', texto: 'Concluido' };
  if (p.estado === 'En_proceso') return { color: 'bg-blue-500', texto: 'En proceso' };
  if (p.estado === 'Bloqueada') return { color: 'bg-red-500', texto: 'Bloqueada' };
  if (p.estado === 'Cancelada') return { color: 'bg-gray-400', texto: 'Cancelada' };
  return { color: 'bg-gray-300', texto: 'Pendiente' };
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
