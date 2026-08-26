/**
 * ARCHIVO: PanoramaProyecto.jsx
 * PROPÓSITO: Tab "Panorama del proyecto" — single scrollable dashboard con:
 *  Encabezado, Participantes, Indicadores, Mapa territorial,
 *  Vencidos/por vencer, Riesgos, Actividad reciente.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Users, UserPlus, Target, MapPin, AlertTriangle, Clock, Activity,
  TrendingUp, Calendar, Shield, ChevronRight, X, Trash2, Search, Loader2, MessageSquare, Layers,
} from 'lucide-react';
import { NIVELES } from '../../config/niveles';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useAuth } from '../../context/AuthContext';
import { usePermisosProyecto } from '../../hooks/usePermisos';
import { obtenerPanorama, crearInvitacion, agregarMiembro, eliminarMiembro, cancelarInvitacion } from '../../api/miembros';
import { agregarMiembroNodo, actualizarRolNodo, eliminarMiembroNodo } from '../../api/nodo-miembros';
import { calcularColorSemaforo } from '../../utils/semaforoColor';
import client from '../../api/client';
import TarjetaIndicador from '../indicadores/TarjetaIndicador';
import BotonSolicitarParticipar from '../proyectos/BotonSolicitarParticipar';
import ListaEstatusCualitativo from '../indicadores/ListaEstatusCualitativo';

const GUINDA = '#7B1C3E';
const GUINDA_LIGHT = '#9f2241';

// ─── Helpers ──────────────────────────────────────────────────
function fmt(f) {
  if (!f) return '—';
  return new Date(f).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

function rel(fecha) {
  if (!fecha) return '';
  const diff = Date.now() - new Date(fecha).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'ahora';
  if (m < 60) return `hace ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `hace ${d}d`;
  return fmt(fecha);
}

// ─── Sección Card wrapper ─────────────────────────────────────
function SeccionCard({ titulo, icono: Icono, children, className = '' }) {
  return (
    <section className={`bg-white ${className}`} style={{ borderRadius: '8px', border: '1px solid #E5E5E5', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
      <div className="flex items-center gap-2 px-5 py-3" style={{ borderBottom: '1px solid #E5E5E5' }}>
        {Icono && <Icono size={16} style={{ color: '#7B1C3E' }} />}
        <h3 className="text-sm font-semibold" style={{ color: '#7B1C3E' }}>{titulo}</h3>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

// ─── Componente principal ─────────────────────────────────────
export default function PanoramaProyecto({ proyecto, etapas, proyectoId, refreshKey, onNavegarNodo }) {
  const { usuario } = useAuth();
  const permisos = usePermisosProyecto(proyecto);
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [modalInvitar, setModalInvitar] = useState(false);

  useEffect(() => {
    if (!proyectoId) return;
    setCargando(true);
    obtenerPanorama(proyectoId)
      .then(d => setDatos(d))
      .catch(() => {})
      .finally(() => setCargando(false));
  }, [proyectoId, refreshKey]);

  if (cargando) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-guinda-600" />
      </div>
    );
  }

  if (!datos) return <p className="text-center text-gray-500 py-10">Error al cargar panorama</p>;

  const { miembros, indicadores, cobertura, vencidos, por_vencer, riesgos, actividad, estatus_cualitativo = [] } = datos;
  const pct = parseFloat(proyecto?.porcentaje_calculado) || 0;
  const sem = calcularColorSemaforo(pct, proyecto?.fecha_inicio, proyecto?.fecha_limite);

  // Gestor de usuarios: dos grupos, no una lista plana — "todo el
  // proyecto" aparte de "por partes", y esto último agrupado por nodo
  // (no por persona) para que se lea como "quién está en cada etapa/
  // acción/tarea", que es la pregunta que de verdad se hace quien
  // administra el equipo.
  const miembrosProyecto = miembros.filter(m => m.alcance === 'proyecto');
  const gruposPorNodo = Object.values(
    miembros.filter(m => m.alcance !== 'proyecto').reduce((acc, m) => {
      const clave = m.nodo_id || `${m.alcance}:${m.nodo_nombre}`;
      if (!acc[clave]) acc[clave] = { nodo_id: clave, nodo_tipo: m.nodo_tipo, nodo_nombre: m.nodo_nombre, miembros: [] };
      acc[clave].miembros.push(m);
      return acc;
    }, {})
  );

  return (
    <div className="space-y-5">
      {/* ═══ ENCABEZADO ═══ */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <div className="flex items-start gap-4">
          {/* Anillo de avance */}
          <div className="relative flex-shrink-0 w-16 h-16">
            <svg width={64} height={64} className="-rotate-90">
              <circle cx={32} cy={32} r={26} fill="none" stroke="#f3f4f6" strokeWidth={6} />
              <circle cx={32} cy={32} r={26} fill="none" stroke={sem.color} strokeWidth={6}
                strokeDasharray={`${(pct / 100) * 163.36} 163.36`} strokeLinecap="round" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-sm font-bold" style={{ color: sem.color }}>{pct.toFixed(0)}%</span>
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-gray-900 truncate">{proyecto.nombre}</h2>
              <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${
                proyecto.estado === 'En_proceso' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                proyecto.estado === 'Concluido' ? 'bg-green-50 text-green-700 border-green-200' :
                proyecto.estado === 'Pausado' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' :
                'bg-gray-50 text-gray-600 border-gray-200'
              }`}>{proyecto.estado?.replace('_', ' ')}</span>
            </div>
            <div className="flex items-center gap-4 mt-1 text-xs text-gray-500 flex-wrap">
              <span className="flex items-center gap-1"><Calendar size={12} /> {fmt(proyecto.fecha_inicio)} — {fmt(proyecto.fecha_limite)}</span>
              {proyecto.dg_lider_siglas && <span className="font-medium text-gray-700">{proyecto.dg_lider_siglas}</span>}
              {proyecto.direccion_area_siglas && <span>{proyecto.direccion_area_siglas}</span>}
            </div>
            {proyecto.descripcion && (
              <p className="text-xs text-gray-600 mt-2 line-clamp-2">{proyecto.descripcion}</p>
            )}
          </div>
        </div>
      </div>

      {/* ═══ GESTOR DE USUARIOS DEL PROYECTO ═══
          Antes esto era solo una vista de lectura, todos en una sola
          rejilla sin distinguir quién tiene acceso a todo del proyecto y
          quién solo a una parte — y asignar a alguien a una etapa/acción
          puntual quedaba escondido dentro de "Invitar usuario", detrás
          de un radio button. Ahora son dos grupos explícitos ("Todo el
          proyecto" y, agrupado por elemento, "Etapas, acciones y
          tareas"), un botón propio para asignar a una parte, y cada
          tarjeta trae sus acciones (cambiar función, ampliar a todo el
          proyecto, quitar) para que esto sea de verdad un gestor. */}
      <section className="bg-white rounded-xl border border-gray-200 shadow-sm">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Users size={16} className="text-gray-500" />
            <h3 className="text-sm font-semibold text-gray-800">
              Gestor de usuarios del proyecto
              <span className="ml-1.5 text-gray-400 font-normal text-xs">
                ({miembros.length} persona{miembros.length !== 1 ? 's' : ''}
                {(() => {
                  const dgs = [...new Set(miembros.map(m => m.dg_siglas).filter(Boolean))];
                  return dgs.length > 0 ? ` · ${dgs.length} DG${dgs.length !== 1 ? 's' : ''}` : '';
                })()})
              </span>
            </h3>
          </div>
          {/* Quien ya puede invitar, invita. Quien no participa, pide entrar:
              las dos acciones son la misma conversación vista desde cada
              lado, así que viven en el mismo lugar — junto a la lista de
              quiénes participan, que es donde surge la pregunta. */}
          <div className="flex items-center gap-2">
            <BotonSolicitarParticipar proyecto={proyecto} permisos={permisos} />
            {permisos.puedeInvitar && (
              <>
                <button
                  onClick={() => setModalInvitar('nodos')}
                  className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition"
                  title="Asignar a una etapa, acción o tarea específica"
                >
                  <Layers size={14} /> Asignar a una parte
                </button>
                <button
                  onClick={() => setModalInvitar('proyecto')}
                  className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-guinda-200 text-guinda-700 hover:bg-guinda-50 transition"
                >
                  <UserPlus size={14} /> Invitar a todo el proyecto
                </button>
              </>
            )}
          </div>
        </div>

        <div className="p-5 space-y-6">
          {miembros.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">Sin participantes registrados</p>
          ) : (
            <>
              {/* Todo el proyecto */}
              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2.5">
                  Todo el proyecto
                  <span className="ml-1 text-gray-400 font-normal normal-case">({miembrosProyecto.length})</span>
                </h4>
                {miembrosProyecto.length === 0 ? (
                  <p className="text-xs text-gray-400">Nadie tiene acceso a todo el proyecto todavía.</p>
                ) : (
                  <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                    {miembrosProyecto.map(m => (
                      <ParticipanteCard
                        key={`${m.id_usuario}-proyecto`}
                        miembro={m}
                        puedeGestionar={permisos.puedeInvitar && m.id_usuario !== usuario?.id}
                        onEliminar={() => handleEliminarMiembro(m)}
                        onCambiarRol={nuevoRol => handleCambiarRol(m, nuevoRol)}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Etapas, acciones y tareas — agrupado por elemento, no una
                  lista plana de personas: lo que importa aquí es "quién
                  está en cada parte", no solo "quién es colaborador". */}
              {gruposPorNodo.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2.5">
                    Etapas, acciones y tareas
                    <span className="ml-1 text-gray-400 font-normal normal-case">
                      ({gruposPorNodo.reduce((n, g) => n + g.miembros.length, 0)})
                    </span>
                  </h4>
                  <div className="space-y-3">
                    {gruposPorNodo.map(grupo => {
                      const IconoNodo = NIVELES[grupo.nodo_tipo]?.icono || Layers;
                      return (
                        <div key={grupo.nodo_id} className="border border-gray-100 rounded-lg p-3 bg-gray-50/60">
                          <p className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                            <IconoNodo size={13} className="text-gray-400 flex-shrink-0" />
                            {grupo.nodo_nombre}
                            <span className="text-gray-400 font-normal">· {ETIQUETA_ALCANCE[grupo.nodo_tipo]}</span>
                          </p>
                          <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                            {grupo.miembros.map(m => (
                              <ParticipanteCard
                                key={`${m.id_usuario}-${grupo.nodo_id}`}
                                miembro={m}
                                puedeGestionar={permisos.puedeInvitar && m.id_usuario !== usuario?.id}
                                onEliminar={() => handleEliminarMiembro(m)}
                                onCambiarRol={nuevoRol => handleCambiarRol(m, nuevoRol)}
                                onAmpliarATodoElProyecto={() => handleAmpliarATodoElProyecto(m)}
                                mostrarAlcance={false}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* ═══ INDICADORES ═══ */}
      {indicadores.length > 0 && (
        <SeccionCard titulo="Indicadores" icono={Target}>
          <div className="grid gap-4 sm:grid-cols-2">
            {indicadores.map(ind => (
              <IndicadorCard key={ind.id} indicador={ind} />
            ))}
          </div>
        </SeccionCard>
      )}

      {/* ═══ ESTATUS CUALITATIVO ═══
          Contraparte de los indicadores: el número dice cuánto, esto
          dice por qué. Aquí no se repite el nombre del proyecto en cada
          línea — ya se sabe cuál es. */}
      {estatus_cualitativo.length > 0 && (
        <SeccionCard titulo="Estatus cualitativo" icono={MessageSquare}>
          <ListaEstatusCualitativo items={estatus_cualitativo} dentroDeProyecto maxAltura="max-h-72" />
        </SeccionCard>
      )}

      {/* ═══ MAPA TERRITORIAL ═══ */}
      {cobertura.length > 0 && (
        <SeccionCard titulo="Cobertura geográfica" icono={MapPin}>
          <div className="flex flex-wrap gap-2">
            {[...new Set(cobertura.map(c => c.estado_nombre).filter(Boolean))].map(e => (
              <span key={e} className="text-xs bg-guinda-50 text-guinda-700 px-2 py-1 rounded-full border border-guinda-200">{e}</span>
            ))}
          </div>
          {cobertura.some(c => c.municipio_nombre) && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {cobertura.filter(c => c.municipio_nombre).map(c => (
                <span key={c.id} className="text-[11px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{c.municipio_nombre}, {c.estado_nombre}</span>
              ))}
            </div>
          )}
        </SeccionCard>
      )}

      {/* ═══ VENCIDOS Y POR VENCER ═══ */}
      {(vencidos.length > 0 || por_vencer.length > 0) && (
        <div className="grid gap-5 md:grid-cols-2">
          {vencidos.length > 0 && (
            <SeccionCard titulo={`Vencidas (${vencidos.length})`} icono={AlertTriangle}>
              <ul className="space-y-2">
                {vencidos.slice(0, 8).map(a => (
                  <li key={a.id}>
                    <button onClick={() => onNavegarNodo?.(a.id)} className="w-full flex items-start gap-2 text-left p-1 -m-1 rounded hover:bg-red-50 transition-colors">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm text-gray-800 truncate">{a.nombre}</p>
                        <p className="text-[11px] text-gray-500">
                          {a.id_accion_padre ? 'Subacción' : 'Acción'} · -{a.dias_atraso}d atraso
                        </p>
                        {a.estatus_cualitativo && (
                          <p className="text-[11px] text-gray-500 italic truncate mt-0.5">"{a.estatus_cualitativo}"</p>
                        )}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </SeccionCard>
          )}
          {por_vencer.length > 0 && (
            <SeccionCard titulo={`Por vencer (${por_vencer.length})`} icono={Clock}>
              <ul className="space-y-2">
                {por_vencer.slice(0, 8).map(a => (
                  <li key={a.id}>
                    <button onClick={() => onNavegarNodo?.(a.id)} className="w-full flex items-start gap-2 text-left p-1 -m-1 rounded hover:bg-yellow-50 transition-colors">
                      <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 mt-1.5 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm text-gray-800 truncate">{a.nombre}</p>
                        <p className="text-[11px] text-gray-500">
                          {a.id_accion_padre ? 'Subacción' : 'Acción'} · {a.dias_restantes}d restantes
                        </p>
                        {a.estatus_cualitativo && (
                          <p className="text-[11px] text-gray-500 italic truncate mt-0.5">"{a.estatus_cualitativo}"</p>
                        )}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </SeccionCard>
          )}
        </div>
      )}

      {/* ═══ RIESGOS Y BLOQUEOS ═══ */}
      {riesgos.length > 0 && (
        <SeccionCard titulo={`Riesgos abiertos (${riesgos.length})`} icono={Shield}>
          <ul className="space-y-2">
            {riesgos.slice(0, 8).map(r => (
              <li key={r.id}>
                <button onClick={() => onNavegarNodo?.(r.entidad_id)} className="w-full flex items-center gap-2 py-1 px-1 -mx-1 rounded hover:bg-orange-50 transition-colors text-left">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    r.nivel === 'Critico' ? 'bg-red-600' :
                    r.nivel === 'Alto' ? 'bg-orange-500' :
                    r.nivel === 'Medio' ? 'bg-yellow-500' : 'bg-gray-400'
                  }`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-800 truncate">{r.titulo}</p>
                    <p className="text-[11px] text-gray-500">{r.entidad_tipo} · {r.nivel}</p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </SeccionCard>
      )}

      {/* ═══ ACTIVIDAD RECIENTE ═══ */}
      {actividad.length > 0 && (
        <SeccionCard titulo="Actividad reciente" icono={Activity}>
          <ul className="space-y-3">
            {actividad.slice(0, 10).map((ev, i) => (
              <li key={i}>
                <button onClick={() => onNavegarNodo?.(ev.entidad_id)} className="w-full flex items-start gap-2.5 text-left p-1 -m-1 rounded hover:bg-purple-50 transition-colors">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                    ev.tipo === 'comentario' ? 'bg-purple-100 text-purple-600' : 'bg-green-100 text-green-600'
                  }`}>
                    {ev.tipo === 'comentario' ? <Activity size={12} /> : <TrendingUp size={12} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-800">
                      <span className="font-medium">{ev.actor}</span>
                      {' '}<span className="text-gray-500">{ev.tipo === 'comentario' ? 'comentó' : 'subió evidencia'}:</span>
                      {' '}<span className="text-gray-700 truncate">{ev.descripcion?.slice(0, 80)}</span>
                    </p>
                    <p className="text-[11px] text-gray-400 mt-0.5">{rel(ev.created_at)}</p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </SeccionCard>
      )}

      {/* ═══ MODAL INVITAR USUARIO ═══ */}
      {modalInvitar && (
        <ModalInvitar
          proyectoId={proyectoId}
          etapas={etapas}
          alcanceInicial={modalInvitar === 'nodos' ? 'nodos' : 'proyecto'}
          onClose={() => setModalInvitar(false)}
          onInvitado={() => {
            setModalInvitar(false);
            obtenerPanorama(proyectoId).then(d => setDatos(d));
          }}
        />
      )}
    </div>
  );

  // Quita a alguien — del proyecto entero si su alcance es 'proyecto', o
  // solo de la etapa/acción/tarea puntual si es un colaborador de nodo.
  // El mensaje de confirmación cambia según cuál de las dos cosas está
  // a punto de pasar: no es lo mismo perder todo el acceso que perder
  // acceso a una sola parte.
  async function handleEliminarMiembro(m) {
    const deQue = m.alcance === 'proyecto' ? 'del proyecto' : `de esa ${ETIQUETA_ALCANCE[m.nodo_tipo] || 'parte'}`;
    if (!confirm(`¿Quitar a ${m.nombre_completo} ${deQue}?`)) return;
    try {
      if (m.alcance === 'proyecto') {
        await eliminarMiembro(proyectoId, m.id_usuario);
      } else {
        await eliminarMiembroNodo(m.nodo_tipo, m.nodo_id, m.id_usuario);
      }
      const nuevosDatos = await obtenerPanorama(proyectoId);
      setDatos(nuevosDatos);
    } catch (e) {
      alert(e.response?.data?.mensaje || 'Error al quitar al usuario');
    }
  }

  // Cambia la función (colaborador ↔ responsable) sin tocar el alcance.
  // Para 'proyecto' reusa el mismo endpoint que agrega miembros — ya
  // hace upsert de rol si la persona está aceptada, así que cambia la
  // función al instante sin pedirle que vuelva a aceptar nada.
  async function handleCambiarRol(m, nuevoRol) {
    if (nuevoRol === m.rol) return;
    try {
      if (m.alcance === 'proyecto') {
        await agregarMiembro(proyectoId, m.id_usuario, nuevoRol);
      } else {
        await actualizarRolNodo(m.nodo_tipo, m.nodo_id, m.id_usuario, nuevoRol);
      }
      const nuevosDatos = await obtenerPanorama(proyectoId);
      setDatos(nuevosDatos);
    } catch (e) {
      alert(e.response?.data?.mensaje || 'Error al cambiar la función');
    }
  }

  // La fricción que se quiere resolver: alguien ya colabora en una parte
  // y ahora se le quiere en todo el proyecto. En vez de "sal de esa
  // etapa, vuelve aquí, invítalo de nuevo", un solo botón manda la
  // invitación a todo el proyecto — su acceso a la parte puntual se
  // queda como está hasta que se acepte (y se puede quitar aparte si ya
  // no hace falta), pero no bloquea nada mientras tanto.
  async function handleAmpliarATodoElProyecto(m) {
    if (!confirm(`¿Invitar a ${m.nombre_completo} a todo el proyecto como ${m.rol}? Podrá aceptar o rechazar la invitación.`)) return;
    try {
      await crearInvitacion(proyectoId, m.id_usuario, m.rol);
      const nuevosDatos = await obtenerPanorama(proyectoId);
      setDatos(nuevosDatos);
    } catch (e) {
      alert(e.response?.data?.mensaje || 'Error al invitar al usuario');
    }
  }
}

// ─── Participante Card ────────────────────────────────────────
const ROL_CFG = {
  responsable: { label: 'Responsable', bg: '#7B1C3E',  badgeCls: 'bg-guinda-100 text-guinda-700 border-guinda-200' },
  colaborador:  { label: 'Colaborador', bg: '#1e40af',  badgeCls: 'bg-blue-100 text-blue-700 border-blue-200' },
  invitado:     { label: 'Invitado',    bg: '#6b7280',  badgeCls: 'bg-gray-100 text-gray-600 border-gray-200' },
};

function iniciales(nombre) {
  if (!nombre) return '?';
  const parts = nombre.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

const ETIQUETA_ALCANCE = { etapa: 'etapa', accion: 'acción', tarea: 'tarea' };

function alcanceLabel(alcance, nodo_tipo, nodo_nombre) {
  if (!alcance || alcance === 'proyecto') return null;
  const tipoEs = ETIQUETA_ALCANCE[nodo_tipo || alcance] || 'parte';
  return `Asignado a: ${tipoEs}${nodo_nombre ? ` — ${nodo_nombre}` : ''}`;
}

function ParticipanteCard({ miembro: m, puedeGestionar, onEliminar, onCambiarRol, onAmpliarATodoElProyecto, mostrarAlcance = true }) {
  const cfg = ROL_CFG[m.rol] || ROL_CFG.invitado;
  // Dentro de un grupo por nodo el encabezado del grupo ya dice de qué
  // etapa/acción/tarea se trata — repetirlo en cada tarjeta sería ruido.
  const scopeText = mostrarAlcance ? alcanceLabel(m.alcance, m.nodo_tipo, m.nodo_nombre) : null;
  // 'invitado' es un rol especial para gente externa (ver ModalInvitar) —
  // no se ofrece como algo a lo que cambiar desde aquí, solo se respeta
  // si ya es lo que tiene.
  const puedeCambiarRol = puedeGestionar && m.rol !== 'invitado';

  return (
    <div className="relative group border border-gray-200 rounded-xl p-3 bg-white hover:shadow-sm transition-shadow flex flex-col gap-2">
      {/* Botón quitar (hover) */}
      {puedeGestionar && (
        <button
          onClick={onEliminar}
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 text-gray-400 hover:text-red-500 rounded"
          title={m.alcance === 'proyecto' ? 'Quitar del proyecto' : 'Quitar de esta parte'}
        >
          <Trash2 size={13} />
        </button>
      )}

      {/* Avatar + nombre + rol */}
      <div className="flex items-center gap-2.5">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
          style={{ backgroundColor: cfg.bg }}
        >
          {iniciales(m.nombre_completo)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-bold text-gray-900 truncate leading-tight">{m.nombre_completo}</p>
          {/* La función es lo primero que se toca al gestionar a alguien,
              así que si se puede cambiar, se ofrece de una vez como select
              en vez de mandar a otro lugar a hacerlo. */}
          {puedeCambiarRol ? (
            <select
              value={m.rol}
              onChange={e => onCambiarRol(e.target.value)}
              onClick={e => e.stopPropagation()}
              className={`mt-0.5 text-[10px] font-medium pl-1.5 pr-1 py-0 rounded-full border outline-none cursor-pointer ${cfg.badgeCls}`}
            >
              <option value="colaborador">Colaborador</option>
              <option value="responsable">Responsable</option>
            </select>
          ) : (
            <span className={`inline-block text-[10px] font-medium px-1.5 py-0 rounded-full border mt-0.5 ${cfg.badgeCls}`}>
              {cfg.label}
            </span>
          )}
          {/* Invitar propone: hasta que la persona no acepta, no tiene
              permisos. Mostrarla como participante sin más sería mentir. */}
          {m.estado === 'pendiente' && (
            <span className="ml-1 inline-block text-[10px] font-medium px-1.5 py-0 rounded-full border bg-amber-50 text-amber-700 border-amber-200 mt-0.5">
              Invitación pendiente
            </span>
          )}
        </div>
      </div>

      {/* DG / DA / Cargo */}
      <div className="text-[11px] text-gray-400 leading-snug">
        {[m.dg_siglas, m.da_siglas].filter(Boolean).join(' / ')}
        {m.cargo && <span className="ml-1 italic">· {m.cargo}</span>}
      </div>

      {/* Email */}
      {m.correo && (
        <a
          href={`mailto:${m.correo}`}
          className="text-[11px] text-blue-600 hover:underline truncate block"
          title={m.correo}
        >
          {m.correo}
        </a>
      )}

      {/* Scope (si aplica) + ampliar a todo el proyecto — la acción que
          resuelve la fricción de "está en una parte, quiero que esté en
          todo": antes exigía quitarlo de la parte y volver a invitarlo
          desde cero. El botón vive independiente del texto de alcance:
          dentro de un grupo por nodo no se repite el texto, pero la
          acción sigue haciendo falta. */}
      {m.alcance !== 'proyecto' && (
        <div className="flex items-center justify-between gap-2">
          {scopeText ? (
            <p className="text-[11px] text-amber-600 italic leading-tight truncate">{scopeText}</p>
          ) : <span />}
          {puedeGestionar && onAmpliarATodoElProyecto && (
            <button
              onClick={onAmpliarATodoElProyecto}
              className="text-[10px] font-medium text-guinda-600 hover:text-guinda-800 whitespace-nowrap flex-shrink-0"
              title="Enviar invitación a todo el proyecto"
            >
              + Todo el proyecto
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Indicador Card ───────────────────────────────────────────
function IndicadorCard({ indicador }) {
  // La tarjeta es la compartida con Tablero y Resumen de cartera; aquí
  // se le agrega, como hijo, la gráfica de metas anuales, que solo tiene
  // sentido dentro del proyecto (es su desglose por año).
  const chartData = (indicador.metas_anuales || []).map(m => ({
    anio: m.anio,
    meta: parseFloat(m.valor_meta) || 0,
    real: parseFloat(m.valor_real) || 0,
  }));

  return (
    <TarjetaIndicador
      indicador={indicador}
      contexto={indicador.etapa_nombre ? `Etapa: ${indicador.etapa_nombre}` : null}
    >
      {chartData.length > 0 && (
        <div className="h-24 mt-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} barGap={2}>
              <XAxis dataKey="anio" tick={{ fontSize: 10 }} />
              <YAxis hide />
              <Tooltip contentStyle={{ fontSize: 11 }} />
              <Bar dataKey="meta" fill="#e5e7eb" name="Meta" radius={[2,2,0,0]} />
              <Bar dataKey="real" fill={GUINDA_LIGHT} name="Real" radius={[2,2,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </TarjetaIndicador>
  );
}

// ─── Modal Invitar ────────────────────────────────────────────
function ModalInvitar({ proyectoId, etapas, alcanceInicial = 'proyecto', onClose, onInvitado }) {
  const [dgs, setDgs] = useState([]);
  const [das, setDas] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [cargandoU, setCargandoU] = useState(false);
  const [filtros, setFiltros] = useState({ id_dg: '', id_da: '', nombre: '' });
  const [seleccionado, setSeleccionado] = useState(null);
  const [rol, setRol] = useState('colaborador');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  // Quien llega por "Asignar a una parte" ya dijo lo que quiere hacer —
  // arrancar con el radio en "Todo el proyecto" y obligarlo a cambiarlo
  // sería deshacer la elección que ya hizo con ese clic.
  const [alcance, setAlcance] = useState(alcanceInicial);
  const [nodosSeleccionados, setNodosSeleccionados] = useState(new Set());

  useEffect(() => {
    client.get('/catalogos/dgs').then(r => setDgs(r.data.datos || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (filtros.id_dg) {
      client.get(`/catalogos/direcciones-area?id_dg=${filtros.id_dg}`).then(r => setDas(r.data.datos || [])).catch(() => {});
    } else {
      setDas([]);
    }
  }, [filtros.id_dg]);

  const buscarUsuarios = useCallback(async () => {
    setCargandoU(true);
    try {
      const params = new URLSearchParams({ excluir_proyecto: proyectoId });
      if (filtros.id_dg) params.set('id_dg', filtros.id_dg);
      if (filtros.id_da) params.set('id_direccion_area', filtros.id_da);
      if (filtros.nombre) params.set('nombre', filtros.nombre);
      const r = await client.get(`/catalogos/usuarios?${params}`);
      setUsuarios(r.data.datos || []);
    } catch {}
    finally { setCargandoU(false); }
  }, [filtros, proyectoId]);

  useEffect(() => { buscarUsuarios(); }, [buscarUsuarios]);

  function toggleNodo(tipo, id) {
    const key = `${tipo}-${id}`;
    setNodosSeleccionados(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleInvitar(e) {
    e.preventDefault();
    if (!seleccionado) return;
    if (alcance === 'nodos' && nodosSeleccionados.size === 0) {
      setError('Selecciona al menos una etapa o acción');
      return;
    }
    setEnviando(true); setError('');
    try {
      if (alcance === 'proyecto') {
        await crearInvitacion(proyectoId, seleccionado.id, rol);
      } else {
        const promesas = [];
        nodosSeleccionados.forEach(key => {
          const idx = key.indexOf('-');
          const tipo = key.slice(0, idx);
          // El id es un UUID. Estaba pasando por parseInt, que devolvía NaN
          // (o un número truncado si el UUID empezaba con dígitos): invitar a
          // una etapa concreta no llegaba nunca al nodo correcto.
          const id = key.slice(idx + 1);
          promesas.push(agregarMiembroNodo(tipo, id, seleccionado.id, rol));
        });
        await Promise.all(promesas);
      }
      onInvitado();
    } catch (err) {
      setError(err.response?.data?.mensaje || 'Error al agregar usuario');
    } finally { setEnviando(false); }
  }

  const dasFiltradas = filtros.id_dg ? das : [];

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h3 className="text-base font-semibold text-gray-900">Invitar a participar</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
        </div>

        <div className="px-6 py-4 space-y-3">
          {/* Filtros */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Dirección General</label>
              <select value={filtros.id_dg} onChange={e => setFiltros(f => ({ ...f, id_dg: e.target.value, id_da: '' }))} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs">
                <option value="">— Todas —</option>
                {dgs.map(d => <option key={d.id} value={d.id}>{d.siglas}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Dirección de Área</label>
              <select value={filtros.id_da} onChange={e => setFiltros(f => ({ ...f, id_da: e.target.value }))} disabled={!filtros.id_dg} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs disabled:opacity-40">
                <option value="">— Todas —</option>
                {dasFiltradas.map(d => <option key={d.id} value={d.id}>{d.siglas}</option>)}
              </select>
            </div>
          </div>

          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={filtros.nombre}
              onChange={e => setFiltros(f => ({ ...f, nombre: e.target.value }))}
              placeholder="Buscar por nombre..."
              className="w-full border border-gray-300 rounded-lg pl-8 pr-3 py-1.5 text-sm"
            />
          </div>

          {/* Lista de usuarios */}
          <div className="border border-gray-200 rounded-lg overflow-y-auto" style={{ maxHeight: 240 }}>
            {cargandoU ? (
              <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin text-guinda-600" /></div>
            ) : usuarios.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">No se encontraron usuarios</p>
            ) : (
              usuarios.map(u => (
                <button key={u.id} onClick={() => setSeleccionado(u)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 border-b last:border-0 transition-colors ${
                    seleccionado?.id === u.id ? 'bg-guinda-50 border-l-2 border-l-guinda-600' : ''
                  }`}>
                  <div className="w-7 h-7 rounded-full bg-guinda-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-guinda-700">{u.nombre_completo?.charAt(0)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{u.nombre_completo}</p>
                    <p className="text-[11px] text-gray-400 truncate">{u.correo} · {u.dg_siglas}{u.direccion_area_siglas ? ` / ${u.direccion_area_siglas}` : ''}</p>
                  </div>
                  {seleccionado?.id === u.id && <div className="w-2 h-2 rounded-full bg-guinda-600 flex-shrink-0" />}
                </button>
              ))
            )}
          </div>

          {seleccionado && (
            <div className="space-y-2">
              <div className="p-3 bg-guinda-50 rounded-lg flex items-center gap-2">
                <span className="text-sm text-guinda-700 flex-1 truncate">✓ {seleccionado.nombre_completo}</span>
                <div>
                  <label className="text-xs text-gray-600 mr-1">Función:</label>
                  <select value={rol} onChange={e => setRol(e.target.value)} className="text-xs border border-gray-300 rounded px-2 py-1">
                    <option value="colaborador">Colaborador</option>
                    <option value="responsable">Responsable</option>
                    {/* Ver sin capturar: solo tiene sentido para gente de otra
                        dependencia, dentro de SEDATU la visibilidad ya es total. */}
                    {seleccionado?.rol === 'externo' && <option value="invitado">Invitado</option>}
                  </select>
                </div>
              </div>

              <p className="text-[11px] text-gray-500 bg-gray-50 border border-gray-200 rounded-md p-2 leading-snug">
                La persona recibirá una invitación y podrá aceptarla o rechazarla.
                Hasta que la acepte no tendrá permisos aquí.
              </p>

              <div>
                <p className="text-xs font-medium text-gray-600 mb-1.5">Invitar a:</p>
                <div className="flex gap-4">
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input type="radio" name="alcance" value="proyecto" checked={alcance === 'proyecto'}
                      onChange={() => { setAlcance('proyecto'); setNodosSeleccionados(new Set()); }} />
                    <span>Todo el proyecto</span>
                  </label>
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input type="radio" name="alcance" value="nodos" checked={alcance === 'nodos'}
                      onChange={() => setAlcance('nodos')} />
                    <span>Etapas / acciones específicas</span>
                  </label>
                </div>
              </div>

              {alcance === 'nodos' && (
                <div className="border border-gray-200 rounded-lg max-h-40 overflow-y-auto p-2 space-y-0.5 bg-gray-50">
                  {(etapas || []).length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-2">Sin etapas disponibles</p>
                  ) : (etapas || []).map(etapa => (
                    <div key={etapa.id}>
                      <label className="flex items-center gap-1.5 text-xs cursor-pointer font-medium py-0.5 hover:bg-white rounded px-1">
                        <input type="checkbox" checked={nodosSeleccionados.has(`etapa-${etapa.id}`)}
                          onChange={() => toggleNodo('etapa', etapa.id)} />
                        <span className="text-gray-700 truncate">{etapa.nombre}</span>
                      </label>
                      {(etapa.acciones || []).map(accion => (
                        <label key={accion.id} className="flex items-center gap-1.5 text-xs cursor-pointer ml-4 py-0.5 hover:bg-white rounded px-1">
                          <input type="checkbox" checked={nodosSeleccionados.has(`accion-${accion.id}`)}
                            onChange={() => toggleNodo('accion', accion.id)} />
                          <span className="text-gray-600 truncate">{accion.nombre}</span>
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {error && <p className="text-xs text-red-600 bg-red-50 p-2 rounded">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
          <button onClick={handleInvitar} disabled={!seleccionado || enviando}
            className="px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50 flex items-center gap-2"
            style={{ backgroundColor: GUINDA }}>
            {enviando && <Loader2 size={14} className="animate-spin" />}
            Enviar invitación
          </button>
        </div>
      </div>
    </div>
  );
}
