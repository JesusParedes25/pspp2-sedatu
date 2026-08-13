/**
 * ARCHIVO: CarteraDetalle.jsx
 * PROPÓSITO: Tablero de una cartera de proyectos — pestañas Resumen
 *            (tipo Tablero: métricas, proyectos de la cartera con alta/
 *            baja y marcar principal, indicadores, estatus cualitativo,
 *            riesgos y vencimientos; ver carteras.queries.js), Cronograma
 *            (línea de tiempo consolidada por proyecto), Mapa (territorio
 *            filtrado a los proyectos de la cartera) y Actividad (timeline
 *            cruzado de todos sus proyectos). No hay pestaña "Proyectos"
 *            aparte — su gestión vive dentro de Resumen.
 */
import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Briefcase, Pencil, Trash2, AlertTriangle, Clock,
  LayoutDashboard, FolderKanban, Plus, Star, X, Loader2, Building2,
  Calendar, Map, Activity, Shield, Target, MessageSquare,
} from 'lucide-react';
import { useCartera } from '../../hooks/useCarteras';
import { useUI } from '../../context/UIContext';
import * as carterasApi from '../../api/carteras';
import EmptyState from '../../components/common/EmptyState';
import ModalCartera from '../../components/carteras/ModalCartera';
import ModalAgregarProyectos from '../../components/carteras/ModalAgregarProyectos';
import CronogramaCartera from '../../components/carteras/CronogramaCartera';
import MapaCartera from '../../components/carteras/MapaCartera';
import ActividadCartera from '../../components/carteras/ActividadCartera';
import TarjetaIndicador, { ETIQUETA_TIPO_INDICADOR } from '../../components/indicadores/TarjetaIndicador';
import ListaEstatusCualitativo, { TituloEstatusCualitativo } from '../../components/indicadores/ListaEstatusCualitativo';

const PESTANAS = [
  { id: 'resumen', etiqueta: 'Resumen', icono: LayoutDashboard },
  { id: 'cronograma', etiqueta: 'Cronograma', icono: Calendar },
  { id: 'mapa', etiqueta: 'Mapa', icono: Map },
  { id: 'actividad', etiqueta: 'Actividad', icono: Activity },
];

// Misma tarjeta de métrica que usa el Tablero (Inicio.jsx) — icono en
// círculo de color + número grande + etiqueta. Se replica aquí en vez de
// importarla porque Inicio.jsx no la exporta como componente aparte.
function MetricaCard({ icono: Icono, titulo, valor, color }) {
  return (
    <div className="card p-4 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${color}`}>
        <Icono size={22} />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{valor}</p>
        <p className="text-xs text-gray-500">{titulo}</p>
      </div>
    </div>
  );
}

const GUINDA = '#7B1C3E';

// Misma tarjeta de indicadores que el Tablero (IndicadoresResumen en
// Inicio.jsx) — agrupa por tipo, muestra barra de meta si tiene meta_global
// o el valor crudo si es numeralía sin meta. Se replica aquí porque
// Inicio.jsx no la exporta como componente aparte.
function IndicadoresResumen({ indicadores }) {
  // Misma tarjeta que el Tablero y el Panorama del proyecto — ver
  // TarjetaIndicador. Antes esto era una copia del componente de
  // Inicio.jsx y ya había divergido de él.
  const grupos = {};
  for (const ind of indicadores) {
    const tipo = ind.tipo || 'Otro';
    (grupos[tipo] = grupos[tipo] || []).push(ind);
  }

  return (
    <div className="space-y-4">
      {Object.entries(grupos).map(([tipo, inds]) => (
        <div key={tipo}>
          <p className="text-xs font-medium text-gray-700 mb-2">{ETIQUETA_TIPO_INDICADOR[tipo] || tipo}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {inds.map(ind => (
              <TarjetaIndicador
                key={ind.id}
                indicador={ind}
                variante="compacto"
                contexto={[ind.proyecto_nombre, ind.dg_siglas].filter(Boolean).join(' \u00b7 ')}
              />
            ))}
          </div>
        </div>
      ))}
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

      {/* Resumen — mismo lenguaje visual que el Tablero (Inicio.jsx),
          pero acotado a los proyectos de esta cartera en vez de a los
          proyectos del usuario. */}
      {pestanaActiva === 'resumen' && resumen && (
        <div className="space-y-6">
          {/* Métricas — igual a las 4 tarjetas del Tablero */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricaCard icono={FolderKanban} titulo="Proyectos" valor={resumen.total_proyectos} color="bg-guinda-50 text-guinda-600" />
            <MetricaCard icono={AlertTriangle} titulo="Acciones vencidas" valor={resumen.vencidos.length} color="bg-red-50 text-red-600" />
            <MetricaCard icono={Clock} titulo="Por vencer (30d)" valor={resumen.por_vencer.length} color="bg-yellow-50 text-yellow-600" />
            <MetricaCard icono={Shield} titulo="Riesgos abiertos" valor={resumen.riesgos.length} color="bg-orange-50 text-orange-600" />
          </div>

          {/* Proyectos de esta cartera — alta/baja y gestión, antes vivía en
              su propia pestaña "Proyectos"; se unificó aquí. El estado de
              cada proyecto ya se distingue con el punto de color + etiqueta
              en la columna Estatus de la tabla, sin necesitar un bloque de
              distribución aparte. */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold flex items-center gap-1.5 text-guinda-700">
                <FolderKanban size={14} /> Proyectos de esta cartera
              </h2>
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
          </section>

          {/* Indicadores — misma tarjeta que el Tablero (IndicadoresResumen
              en Inicio.jsx), agrupados por tipo, agregando los de todos los
              proyectos de la cartera. Siempre visible (con mensaje si está
              vacía) — antes desaparecía por completo sin datos, y eso se
              leía como "no funciona" en vez de "sin datos todavía". */}
          <div className="card p-5">
            <h2 className="text-sm font-semibold mb-3 flex items-center gap-1.5 text-guinda-700">
              <Target size={14} className="text-blue-500" /> Indicadores
            </h2>
            {resumen.indicadores.length === 0 ? (
              <p className="text-xs text-gray-400 italic">
                Ningún proyecto de esta cartera tiene indicadores capturados. Se agregan desde la pestaña "Panorama del proyecto" de cada proyecto.
              </p>
            ) : (
              <IndicadoresResumen indicadores={resumen.indicadores} />
            )}
          </div>

          {/* Estatus cualitativo — la nota corta por etapa (migración 047)
              que dice "¿cómo va esto ahora mismo?". Misma sección y mismo
              componente que el Tablero y el Panorama del proyecto. */}
          <div className="card p-5">
            <TituloEstatusCualitativo />
            <ListaEstatusCualitativo
              items={resumen.estatus_cualitativo}
              vacio="Ninguna etapa de los proyectos de esta cartera tiene un estatus cualitativo capturado todavía."
            />
          </div>

          {/* Acciones vencidas + Por vencer — mismo bloque de dos columnas
              y mismo estilo compacto de punto de color que el Tablero */}
          {(resumen.vencidos.length > 0 || resumen.por_vencer.length > 0) && (
            <div className={`grid grid-cols-1 gap-6 ${resumen.vencidos.length > 0 && resumen.por_vencer.length > 0 ? 'lg:grid-cols-2' : ''}`}>
              {resumen.vencidos.length > 0 && (
                <div className="card p-5">
                  <h2 className="text-sm font-semibold mb-3 flex items-center gap-1.5 text-guinda-700">
                    <AlertTriangle size={14} className="text-red-500" /> Acciones vencidas
                  </h2>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {resumen.vencidos.map(a => (
                      <Link
                        key={a.id}
                        to={`/proyectos/${a.id_proyecto}?tab=seguimiento&nodo=${a.id}`}
                        className="flex items-start gap-2 p-2 rounded hover:bg-red-50 border border-transparent hover:border-red-100 transition"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-gray-800 truncate font-medium">{a.nombre}</p>
                          <p className="text-[10px] text-gray-500">{a.proyecto_nombre}{a.etapa_nombre ? ` › ${a.etapa_nombre}` : ''} · -{a.dias_atraso}d</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
              {resumen.por_vencer.length > 0 && (
                <div className="card p-5">
                  <h2 className="text-sm font-semibold mb-3 flex items-center gap-1.5 text-guinda-700">
                    <Clock size={14} className="text-yellow-600" /> Por vencer (30 días)
                  </h2>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {resumen.por_vencer.map(a => (
                      <Link
                        key={a.id}
                        to={`/proyectos/${a.id_proyecto}?tab=seguimiento&nodo=${a.id}`}
                        className="flex items-start gap-2 p-2 rounded hover:bg-yellow-50 border border-transparent hover:border-yellow-100 transition"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 mt-1.5 flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-gray-800 truncate font-medium">{a.nombre}</p>
                          <p className="text-[10px] text-gray-500">{a.proyecto_nombre}{a.etapa_nombre ? ` › ${a.etapa_nombre}` : ''} · {a.dias_restantes}d restantes</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Riesgos abiertos — misma grilla de 3 columnas del Tablero */}
          {resumen.riesgos.length > 0 && (
            <div className="card p-5">
              <h2 className="text-sm font-semibold mb-3 flex items-center gap-1.5 text-guinda-700">
                <Shield size={14} className="text-orange-500" /> Riesgos abiertos
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {resumen.riesgos.map(r => (
                  <Link
                    key={r.id}
                    to={`/proyectos/${r.id_proyecto}?tab=seguimiento&nodo=${r.entidad_id}`}
                    className="flex items-center gap-2 p-2 rounded hover:bg-orange-50 border border-gray-100 hover:border-orange-200 transition"
                  >
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      r.nivel === 'Critico' ? 'bg-red-600' :
                      r.nivel === 'Alto' ? 'bg-orange-500' :
                      r.nivel === 'Medio' ? 'bg-yellow-500' : 'bg-gray-400'
                    }`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-gray-800 truncate">{r.titulo}</p>
                      <p className="text-[10px] text-gray-500">{r.proyecto_nombre} · {r.nivel}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {resumen.vencidos.length === 0 && resumen.por_vencer.length === 0 && resumen.riesgos.length === 0 && (
            <p className="text-sm text-gray-400 italic text-center py-6">Sin acciones vencidas, por vencer ni riesgos abiertos en esta cartera.</p>
          )}
        </div>
      )}

      {/* Cronograma */}
      {pestanaActiva === 'cronograma' && (
        <CronogramaCartera proyectos={proyectos} />
      )}

      {/* Mapa */}
      {pestanaActiva === 'mapa' && (
        <MapaCartera proyectoIds={proyectos.map(p => p.id)} />
      )}

      {/* Actividad */}
      {pestanaActiva === 'actividad' && (
        <ActividadCartera carteraId={id} />
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
      <td className="py-2.5 pr-3 text-xs text-gray-600 whitespace-nowrap">{(proyecto.fecha_fin_efectiva || proyecto.fecha_limite)?.slice(0, 10) || '—'}</td>
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
