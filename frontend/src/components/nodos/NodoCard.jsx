/**
 * ARCHIVO: NodoCard.jsx
 * PROPÓSITO: Tarjeta expandible uniforme para CUALQUIER nivel de la
 *            jerarquía (etapa/acción/tarea). Reemplaza el patrón anterior
 *            de listas simples + tabs separados (archivos/riesgos/
 *            comentarios/indicadores) por un solo componente: colapsada
 *            muestra lo esencial, expandida trae botones de actualización
 *            rápida + acciones contextuales inline, reusando los
 *            componentes ya existentes (miembros, indicadores, territorio).
 */
import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ChevronDown, ChevronRight, Lock, CheckCircle2, Circle, AlertTriangle,
  MessageSquare, Paperclip, Shield, BarChart3, UserPlus, MapPin, Loader2, X, Send,
} from 'lucide-react';
import * as etapasApi from '../../api/etapas';
import * as accionesApi from '../../api/acciones';
import * as tareasApi from '../../api/tareas';
import * as evidenciasApi from '../../api/evidencias';
import * as actividadApi from '../../api/actividad';
import { crearRiesgo } from '../../api/riesgos';
import SeccionMiembrosNodo from '../seguimiento/SeccionMiembrosNodo';
import TabIndicadores from '../seguimiento/TabIndicadores';
import TerritorioSelector from './TerritorioSelector';
import SeccionArchivosNodo from './SeccionArchivosNodo';
import HiloComentarios from '../comentarios/HiloComentarios';
import PanelRiesgos from '../riesgos/PanelRiesgos';
import CampoFecha from '../common/CampoFecha';

const SEM = { verde: '#22c55e', ambar: '#f59e0b', rojo: '#ef4444', gris: '#9ca3af' };
const TIPO_LABEL = { etapa: 'Etapa', accion: 'Acción', tarea: 'Tarea' };
// comentarios/riesgos son del modelo viejo (entidad_tipo genérico) y NUNCA
// soportaron 'Tarea' — por eso solo etapa/accion mapean aquí.
const ENTIDAD_TIPO = { etapa: 'Etapa', accion: 'Accion' };

function Iniciales({ nombre }) {
  const parts = (nombre || '').split(' ').filter(Boolean);
  const ini = parts.length >= 2 ? parts[0][0] + parts[1][0] : (parts[0] ? parts[0].slice(0, 2) : '?');
  return (
    <div className="w-6 h-6 rounded-full bg-guinda-100 text-guinda-700 text-[9px] font-bold flex items-center justify-center flex-shrink-0 uppercase" title={nombre}>
      {ini}
    </div>
  );
}

function diasRestantes(fecha) {
  if (!fecha) return null;
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const [y, m, d] = String(fecha).slice(0, 10).split('-').map(Number);
  if (!y) return null;
  return Math.ceil((new Date(y, m - 1, d) - hoy) / 86400000);
}

function ChipFecha({ fecha, completado }) {
  if (!fecha) return <span className="text-[10px] text-gray-300">Sin fecha</span>;
  const d = diasRestantes(fecha);
  const label = new Date(fecha).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
  if (completado) return <span className="text-[10px] text-gray-400">{label}</span>;
  const cls = d < 0 ? 'bg-red-100 text-red-700' : d <= 7 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500';
  return <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${cls}`}>{label}{d < 0 ? ` (-${Math.abs(d)}d)` : ''}</span>;
}

// Normaliza campos que difieren ligeramente entre etapa/acción/tarea
function normalizar(tipo, nodo) {
  const avance = nodo.avance_actual ?? (tipo === 'etapa' ? nodo.porcentaje_calculado : nodo.porcentaje_avance) ?? 0;
  const fecha = nodo.fecha_limite || nodo.fecha_fin || null;
  return { avance: Math.round(parseFloat(avance) || 0), fecha };
}

export default function NodoCard({
  tipo, nodo, proyectoId, permisos, esContenedor = false,
  breadcrumb, onProyectoClick, onCambiado, defaultAbierto = false,
}) {
  const [abierto, setAbierto] = useState(defaultAbierto);
  const [guardando, setGuardando] = useState(false);
  const [modo, setModo] = useState(null); // null | 'avance' | 'concluir' | 'riesgo'
  const [avanceTemp, setAvanceTemp] = useState(null);
  const [archivoConcluir, setArchivoConcluir] = useState(null);
  const [riesgoTexto, setRiesgoTexto] = useState('');
  const [riesgoNivel, setRiesgoNivel] = useState('Medio');

  const [seccion, setSeccion] = useState(null); // null | 'comentar' | 'adjuntar' | 'riesgos' | 'indicador' | 'invitar' | 'territorio'
  const [comentarioTexto, setComentarioTexto] = useState('');
  const [actividad, setActividad] = useState(null); // se carga lazy al expandir
  const [evidenciasNodo, setEvidenciasNodo] = useState(null); // se carga lazy al abrir "Adjuntar archivo"
  const [editandoFecha, setEditandoFecha] = useState(false);
  const fileInputRef = useRef(null);

  const { avance, fecha } = normalizar(tipo, nodo);
  const completado = nodo.estado === 'Completada';
  const soloLectura = permisos?.esSoloLectura || false;
  const puedeActualizar = !soloLectura && !esContenedor;

  async function cargarActividad() {
    try {
      const res = await actividadApi.obtenerActividadNodo(tipo, nodo.id);
      setActividad(res.datos || []);
    } catch { setActividad([]); }
  }

  async function cargarEvidenciasNodo() {
    try {
      const res = tipo === 'etapa'
        ? await evidenciasApi.obtenerEvidenciasEtapa(nodo.id)
        : await evidenciasApi.obtenerEvidenciasAccion(nodo.id);
      setEvidenciasNodo(res.datos || []);
    } catch { setEvidenciasNodo([]); }
  }

  // toggleAbierto ya cubre la carga lazy al expandir con clic, pero una
  // tarjeta que nace abierta (nodo hoja mostrado solo) nunca pasa por ahí.
  useEffect(() => { if (defaultAbierto) cargarActividad(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleAbierto() {
    const next = !abierto;
    setAbierto(next);
    if (next && actividad === null) cargarActividad();
  }

  async function patch(campo, valor) {
    setGuardando(true);
    try {
      const datos = { [campo]: valor };
      if (tipo === 'etapa') await etapasApi.patchEtapa(nodo.id, datos);
      else if (tipo === 'accion') await accionesApi.patchAccion(nodo.id, datos);
      else await tareasApi.patchTarea(nodo.id, datos);
      onCambiado?.();
    } catch (err) {
      console.error('Error actualizando nodo:', err);
      alert(err.response?.data?.mensaje || 'Error al actualizar');
    } finally {
      setGuardando(false);
    }
  }

  async function toggleChecklist() {
    if (esContenedor || soloLectura) return;
    await patch('estado', completado ? 'Pendiente' : 'Completada');
  }

  async function guardarAvance() {
    if (avanceTemp === null) return;
    await patch('avance_actual', avanceTemp);
    setModo(null);
  }

  async function marcarConcluido() {
    setGuardando(true);
    try {
      if (archivoConcluir) {
        if (tipo === 'etapa') await evidenciasApi.subirEvidenciaEtapa(nodo.id, archivoConcluir, { notas: 'Evidencia de conclusión' });
        else if (tipo === 'accion') await evidenciasApi.subirEvidenciaAccion(nodo.id, archivoConcluir, { notas: 'Evidencia de conclusión' });
        else await actividadApi.adjuntarArchivo('tarea', nodo.id, archivoConcluir);
      }
      if (tipo === 'etapa') await etapasApi.patchEtapa(nodo.id, { estado: 'Completada' });
      else if (tipo === 'accion') await accionesApi.patchAccion(nodo.id, { estado: 'Completada' });
      else await tareasApi.patchTarea(nodo.id, { estado: 'Completada' });
      setModo(null);
      setArchivoConcluir(null);
      onCambiado?.();
    } catch (err) {
      alert(err.response?.data?.mensaje || 'Error al concluir');
    } finally { setGuardando(false); }
  }

  // Escribe en el modelo VIEJO (comentarios/riesgos/evidencias) para etapa y
  // acción — es donde ya vivían estos datos y donde el resto de la app (p.ej.
  // Panorama, listados de riesgos) los sigue leyendo. Para tarea, que nunca
  // tuvo estas tablas disponibles, cae al stream nuevo (sin regresión: antes
  // tampoco existía la opción).
  async function enviarRiesgoRapido() {
    if (!riesgoTexto.trim()) return;
    setGuardando(true);
    try {
      if (ENTIDAD_TIPO[tipo]) {
        await crearRiesgo({
          entidad_tipo: ENTIDAD_TIPO[tipo], entidad_id: nodo.id,
          titulo: riesgoTexto.trim().slice(0, 300), descripcion: riesgoTexto.trim(),
          nivel: riesgoNivel, tipo: 'Riesgo', estado: 'Abierto',
        });
      } else {
        await actividadApi.reportarRiesgo(tipo, nodo.id, riesgoTexto.trim(), riesgoNivel);
      }
      setModo(null); setRiesgoTexto('');
      cargarActividad();
    } catch (err) {
      alert(err.response?.data?.mensaje || 'Error al reportar riesgo');
    } finally { setGuardando(false); }
  }

  // Solo para 'tarea': etapa/accion usan HiloComentarios (tabla vieja) directamente.
  async function enviarComentario() {
    if (!comentarioTexto.trim()) return;
    setGuardando(true);
    try {
      await actividadApi.comentar(tipo, nodo.id, comentarioTexto.trim());
      setComentarioTexto('');
      cargarActividad();
    } catch (err) {
      alert(err.response?.data?.mensaje || 'Error al comentar');
    } finally { setGuardando(false); }
  }

  async function onAdjuntarSeleccion(e) {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    setGuardando(true);
    try {
      if (tipo === 'etapa') await evidenciasApi.subirEvidenciaEtapa(nodo.id, archivo, {});
      else if (tipo === 'accion') await evidenciasApi.subirEvidenciaAccion(nodo.id, archivo, {});
      else await actividadApi.adjuntarArchivo(tipo, nodo.id, archivo);
      cargarActividad();
    } catch (err) {
      alert(err.response?.data?.mensaje || 'Error al adjuntar archivo');
    } finally { setGuardando(false); e.target.value = ''; }
  }

  const todosRiesgos = (actividad || []).filter(a => a.tipo_evento === 'riesgo');
  const riesgosCount = todosRiesgos.length;
  const todosComentarios = (actividad || []).filter(a => a.tipo_evento === 'comentario');
  // Banner ámbar: solo si hay un riesgo realmente abierto (no resuelto/cerrado).
  // Las entradas del stream nuevo (reportadas desde una tarea) no traen
  // metadata.estado, así que se consideran abiertas por defecto.
  const riesgoActivo = todosRiesgos.find(a => !a.metadata?.estado || ['Abierto', 'En_mitigacion'].includes(a.metadata.estado));
  const territorioLabel = nodo.id_zm ? 'Zona Metropolitana asignada' : (nodo.cve_ent ? `Estado${nodo.cve_mun ? ' + Municipio' : ''} asignado` : null);

  return (
    <div className={`rounded-lg border transition-colors ${completado ? 'border-gray-100 bg-gray-50/40' : 'border-gray-200 bg-white'}`}>
      {/* ── Cabecera colapsada ── */}
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <button onClick={toggleChecklist} disabled={esContenedor || soloLectura} title={completado ? 'Marcar pendiente' : 'Marcar completada'}
          className="flex-shrink-0 disabled:cursor-not-allowed">
          {completado
            ? <CheckCircle2 size={18} className="text-green-500" />
            : <Circle size={18} className={esContenedor ? 'text-gray-200' : 'text-gray-300 hover:text-guinda-400'} />}
        </button>
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: SEM[nodo.semaforo || 'gris'] }} />

        <button onClick={toggleAbierto} className="flex-1 min-w-0 flex items-center gap-2 text-left">
          <span className="text-[9px] font-semibold uppercase text-gray-400 flex-shrink-0">{TIPO_LABEL[tipo]}</span>
          <span className={`text-sm truncate ${completado ? 'text-gray-400 line-through' : 'text-gray-800 font-medium'}`}>{nodo.nombre}</span>
        </button>

        {nodo.responsable_nombre && <Iniciales nombre={nodo.responsable_nombre} />}
        <ChipFecha fecha={fecha} completado={completado} />
        <span className="text-xs text-gray-500 tabular-nums w-9 text-right flex-shrink-0">{avance}%</span>
        <button onClick={toggleAbierto} className="flex-shrink-0 text-gray-400 hover:text-gray-600">
          {abierto ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </button>
      </div>

      {breadcrumb && (
        <div className="px-3 -mt-1.5 pb-2 text-[10px] text-gray-400 truncate">
          {onProyectoClick ? (
            <Link to={onProyectoClick} className="text-guinda-600 hover:underline">{breadcrumb}</Link>
          ) : breadcrumb}
        </div>
      )}

      {/* ── Cuerpo expandido ── */}
      {abierto && (
        <div className="border-t border-gray-100 px-3 py-3 space-y-3">
          {riesgoActivo && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2">
              <AlertTriangle size={13} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 leading-snug">{riesgoActivo.contenido}</p>
            </div>
          )}

          {/* Row 1: quick buttons */}
          <div className="flex flex-wrap gap-1.5">
            {esContenedor ? (
              <span className="flex items-center gap-1 text-[11px] text-gray-400 bg-gray-100 px-2.5 py-1.5 rounded-lg">
                <Lock size={11} /> Se calcula desde sus partes
              </span>
            ) : (
              <>
                <button disabled={soloLectura} onClick={() => { setModo(modo === 'avance' ? null : 'avance'); setAvanceTemp(avance); }}
                  className={`text-[11px] font-medium px-2.5 py-1.5 rounded-lg border disabled:opacity-40 ${modo === 'avance' ? 'border-guinda-400 bg-guinda-50 text-guinda-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                  Registrar avance
                </button>
                <button disabled={soloLectura || completado} onClick={() => setModo(modo === 'concluir' ? null : 'concluir')}
                  className={`text-[11px] font-medium px-2.5 py-1.5 rounded-lg border disabled:opacity-40 ${modo === 'concluir' ? 'border-green-400 bg-green-50 text-green-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                  Marcar concluido
                </button>
                <button disabled={soloLectura} onClick={() => setModo(modo === 'riesgo' ? null : 'riesgo')}
                  className={`text-[11px] font-medium px-2.5 py-1.5 rounded-lg border disabled:opacity-40 ${modo === 'riesgo' ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                  Reportar riesgo
                </button>
              </>
            )}
          </div>

          {modo === 'avance' && (
            <div className="bg-gray-50 rounded-lg p-2.5 space-y-2">
              <input type="range" min={0} max={99} value={avanceTemp ?? 0} onChange={e => setAvanceTemp(Number(e.target.value))} className="w-full accent-[#7B1C3E]" />
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-700">{avanceTemp}%</span>
                <div className="flex gap-1.5">
                  <button onClick={() => setModo(null)} className="text-[11px] text-gray-500 px-2 py-1">Cancelar</button>
                  <button onClick={guardarAvance} disabled={guardando} className="text-[11px] bg-guinda-600 text-white px-3 py-1 rounded-md hover:bg-guinda-700">Guardar</button>
                </div>
              </div>
            </div>
          )}

          {modo === 'concluir' && (
            <div className="bg-gray-50 rounded-lg p-2.5 space-y-2">
              <p className="text-[11px] text-gray-500">Adjunta evidencia (opcional) y marca como concluido.</p>
              <input type="file" onChange={e => setArchivoConcluir(e.target.files?.[0] || null)} className="text-xs w-full" />
              <div className="flex justify-end gap-1.5">
                <button onClick={() => { setModo(null); setArchivoConcluir(null); }} className="text-[11px] text-gray-500 px-2 py-1">Cancelar</button>
                <button onClick={marcarConcluido} disabled={guardando} className="text-[11px] bg-green-600 text-white px-3 py-1 rounded-md hover:bg-green-700 flex items-center gap-1">
                  {guardando && <Loader2 size={11} className="animate-spin" />} Concluir
                </button>
              </div>
            </div>
          )}

          {modo === 'riesgo' && (
            <div className="bg-gray-50 rounded-lg p-2.5 space-y-2">
              <textarea value={riesgoTexto} onChange={e => setRiesgoTexto(e.target.value)} rows={2} placeholder="Describe el riesgo o bloqueo..."
                className="text-xs border border-gray-200 rounded px-2 py-1.5 w-full resize-none focus:border-amber-400 outline-none" />
              <div className="flex items-center justify-between">
                <select value={riesgoNivel} onChange={e => setRiesgoNivel(e.target.value)} className="text-[11px] border border-gray-200 rounded px-1.5 py-1">
                  {['Bajo', 'Medio', 'Alto', 'Critico'].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
                <div className="flex gap-1.5">
                  <button onClick={() => setModo(null)} className="text-[11px] text-gray-500 px-2 py-1">Cancelar</button>
                  <button onClick={enviarRiesgoRapido} disabled={guardando || !riesgoTexto.trim()} className="text-[11px] bg-amber-600 text-white px-3 py-1 rounded-md hover:bg-amber-700 disabled:opacity-40">Reportar</button>
                </div>
              </div>
            </div>
          )}

          {/* Row 2: contextual actions */}
          <div className="flex flex-wrap gap-1.5 pt-1 border-t border-gray-100">
            <BotonContextual icono={MessageSquare} label="Comentar" activo={seccion === 'comentar'} onClick={() => setSeccion(seccion === 'comentar' ? null : 'comentar')} />
            <BotonContextual icono={Paperclip} label="Adjuntar archivo" activo={seccion === 'adjuntar'} onClick={() => {
              if (ENTIDAD_TIPO[tipo]) {
                const next = seccion === 'adjuntar' ? null : 'adjuntar';
                setSeccion(next);
                if (next === 'adjuntar' && evidenciasNodo === null) cargarEvidenciasNodo();
              } else {
                fileInputRef.current?.click();
              }
            }} />
            <input ref={fileInputRef} type="file" className="hidden" onChange={onAdjuntarSeleccion} />
            <BotonContextual icono={Shield} label={`Riesgos${riesgosCount ? ` (${riesgosCount})` : ''}`} activo={seccion === 'riesgos'} onClick={() => setSeccion(seccion === 'riesgos' ? null : 'riesgos')} />
            <BotonContextual icono={BarChart3} label="Vincular indicador" activo={seccion === 'indicador'} onClick={() => setSeccion(seccion === 'indicador' ? null : 'indicador')} />
            {permisos?.puedeInvitar && (
              <BotonContextual icono={UserPlus} label="Invitar participante" activo={seccion === 'invitar'} onClick={() => setSeccion(seccion === 'invitar' ? null : 'invitar')} />
            )}
            {tipo !== 'tarea' && (
              <BotonContextual icono={MapPin} label="Territorio" activo={seccion === 'territorio'} onClick={() => setSeccion(seccion === 'territorio' ? null : 'territorio')} />
            )}
          </div>

          {seccion === 'comentar' && (
            ENTIDAD_TIPO[tipo] ? (
              <div className="bg-gray-50 rounded-lg p-2.5 max-h-96 overflow-y-auto">
                <HiloComentarios entidadTipo={ENTIDAD_TIPO[tipo]} entidadId={nodo.id} compacto={false} onStatsChange={cargarActividad} />
              </div>
            ) : (
              <div className="bg-gray-50 rounded-lg p-2 space-y-2">
                {todosComentarios.length > 0 && (
                  <div className="space-y-1.5 max-h-56 overflow-y-auto">
                    {todosComentarios.map(c => (
                      <div key={c.id} className="text-[11px] text-gray-700 bg-white rounded px-2 py-1.5 border border-gray-100">
                        <span className="font-medium text-gray-600">{c.autor_nombre}</span>: {c.contenido}
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-1.5">
                  <input value={comentarioTexto} onChange={e => setComentarioTexto(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && enviarComentario()}
                    placeholder="Escribe un comentario..." autoFocus
                    className="flex-1 text-xs border border-gray-200 rounded px-2 py-1.5 bg-white focus:border-guinda-400 outline-none" />
                  <button onClick={enviarComentario} disabled={guardando || !comentarioTexto.trim()} className="p-1.5 bg-guinda-600 text-white rounded hover:bg-guinda-700 disabled:opacity-40">
                    <Send size={13} />
                  </button>
                </div>
              </div>
            )
          )}

          {seccion === 'adjuntar' && ENTIDAD_TIPO[tipo] && (
            <div className="bg-gray-50 rounded-lg max-h-96 overflow-y-auto">
              <SeccionArchivosNodo
                evidencias={evidenciasNodo || []}
                tipo={tipo}
                id={nodo.id}
                permisos={permisos}
                onRecargar={async () => { await cargarEvidenciasNodo(); cargarActividad(); }}
              />
            </div>
          )}

          {seccion === 'riesgos' && (
            ENTIDAD_TIPO[tipo] ? (
              <div className="bg-gray-50 rounded-lg p-2.5 max-h-96 overflow-y-auto">
                <PanelRiesgos entidadTipo={ENTIDAD_TIPO[tipo]} entidadId={nodo.id} soloLectura={soloLectura} onStatsChange={cargarActividad} />
              </div>
            ) : (
              <div className="bg-gray-50 rounded-lg p-2.5">
                {riesgosCount === 0 ? (
                  <p className="text-[11px] text-gray-400 italic">Sin riesgos reportados.</p>
                ) : (
                  <div className="space-y-1.5">
                    {todosRiesgos.map(r => (
                      <div key={r.id} className="text-[11px] text-gray-700 border-l-2 border-amber-300 pl-2">
                        <span className="font-medium">{r.metadata?.nivel || 'Medio'}</span>
                        {r.metadata?.estado && <span className="text-gray-400"> ({r.metadata.estado})</span>} — {r.contenido}
                        <span className="text-gray-400"> · {r.autor_nombre}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          )}

          {seccion === 'indicador' && (
            <div className="bg-gray-50 rounded-lg p-2.5 max-h-80 overflow-y-auto">
              <TabIndicadores tipo={tipo} nodoId={nodo.id} proyectoId={proyectoId} soloLectura={soloLectura} />
            </div>
          )}

          {seccion === 'invitar' && (
            <div className="bg-gray-50 rounded-lg p-2.5">
              <SeccionMiembrosNodo tipo={tipo} idNodo={nodo.id} permisos={permisos} />
            </div>
          )}

          {seccion === 'territorio' && (
            <div className="bg-gray-50 rounded-lg p-2.5">
              <TerritorioSelector data={nodo} soloLectura={soloLectura} onGuardar={(campo, valor) => patch(campo, valor).then(() => setSeccion(null))} />
            </div>
          )}

          {/* Row 3: metadata */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-gray-400 pt-1">
            <span>Avance: <strong className="text-gray-600">{avance}%</strong></span>
            {editandoFecha ? (
              <span className="flex items-center gap-1">
                Vence:
                <span className="w-32">
                  <CampoFecha
                    valor={fecha ? String(fecha).slice(0, 10) : ''}
                    onChange={v => patch('fecha_limite', v || null).then(() => setEditandoFecha(false))}
                  />
                </span>
                <button onClick={() => setEditandoFecha(false)} className="text-gray-400 hover:text-gray-600"><X size={11} /></button>
              </span>
            ) : (
              <span
                onClick={() => !soloLectura && setEditandoFecha(true)}
                className={!soloLectura ? 'cursor-pointer hover:text-guinda-600' : ''}
                title={!soloLectura ? 'Clic para editar' : undefined}
              >
                Vence: <strong className="text-gray-600">{fecha ? new Date(fecha).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Sin fecha'}</strong>
              </span>
            )}
            {nodo.responsable_nombre && <span>Responsable: <strong className="text-gray-600">{nodo.responsable_nombre}</strong>{nodo.dg_siglas ? ` (${nodo.dg_siglas})` : ''}</span>}
            {territorioLabel && <span className="flex items-center gap-1"><MapPin size={10} />{territorioLabel}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function BotonContextual({ icono: Icono, label, activo, onClick }) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md transition-colors ${
        activo ? 'bg-guinda-100 text-guinda-700' : 'text-gray-500 hover:bg-gray-100'
      }`}>
      <Icono size={12} /> {label}
    </button>
  );
}
