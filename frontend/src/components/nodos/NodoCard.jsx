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
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ChevronDown, ChevronRight, Lock, CheckCircle2, Circle, AlertTriangle,
  MessageSquare, Paperclip, Shield, BarChart3, UserPlus, MapPin, Loader2, X, Send, Copy,
  TrendingUp, Trash2, Pencil,
} from 'lucide-react';
import ModalDuplicarNodo from './ModalDuplicarNodo';
import ModalRegistrarAvance from './ModalRegistrarAvance';
import ConfirmDialog from '../common/ConfirmDialog';
import * as etapasApi from '../../api/etapas';
import * as accionesApi from '../../api/acciones';
import * as tareasApi from '../../api/tareas';
import * as evidenciasApi from '../../api/evidencias';
import * as actividadApi from '../../api/actividad';
import { crearRiesgo, obtenerRiesgo, actualizarRiesgo } from '../../api/riesgos';
import SeccionMiembrosNodo from '../seguimiento/SeccionMiembrosNodo';
import TabIndicadores from '../seguimiento/TabIndicadores';
import TerritorioSelector from './TerritorioSelector';
import SeccionArchivosNodo from './SeccionArchivosNodo';
import HiloComentarios from '../comentarios/HiloComentarios';
import PanelRiesgos from '../riesgos/PanelRiesgos';
import ModalRiesgo from '../riesgos/ModalRiesgo';
import CampoFecha from '../common/CampoFecha';
import { formatFecha, diasRestantes } from '../../utils/fecha';
import { useUI } from '../../context/UIContext';
import { permisosDeNodo } from '../../hooks/usePermisos';
import { NIVELES } from '../../config/niveles';
import CrearInline from '../seguimiento/EtapasAvancesMD/CrearInline';

const SEM = { verde: '#22c55e', ambar: '#f59e0b', rojo: '#ef4444', gris: '#9ca3af' };
const TIPO_LABEL = { etapa: 'Etapa', accion: 'Acción', tarea: 'Tarea' };
// comentarios son del modelo viejo (entidad_tipo genérico) y siguen sin
// soportar 'Tarea' — sus comentarios se leen del stream `actividad`, no
// de la tabla `comentarios`. Riesgos SÍ soporta los tres niveles desde
// que se agregó 'Tarea' a riesgos_entidad_tipo_check — por eso tiene su
// propio mapa (ENTIDAD_TIPO_RIESGO), no comparte este.
const ENTIDAD_TIPO = { etapa: 'Etapa', accion: 'Accion' };
const ENTIDAD_TIPO_RIESGO = { etapa: 'Etapa', accion: 'Accion', tarea: 'Tarea' };
const TIPO_LABEL_MIN = { etapa: 'etapa', accion: 'acción', tarea: 'tarea' };

// Cuántos elementos se van junto con este nodo. El borrado en la API es en
// cascada (una etapa arrastra sus acciones y las tareas de esas acciones),
// así que la confirmación tiene que decirlo — mismo criterio que el
// contarDescendientes del Diagrama, replicado aquí porque NodoCard también
// se usa fuera de esa vista (Detalle, Mis actividades) y no siempre recibe
// el árbol completo: si el nodo no trae hijos cargados, cuenta 0 y la
// confirmación se queda en el mensaje simple.
function contarHijos(tipo, nodo) {
  if (tipo === 'accion') return (nodo.tareas || []).length + (nodo.subacciones || []).length;
  if (tipo === 'etapa') {
    return (nodo.acciones || []).reduce((suma, a) => suma + 1 + contarHijos('accion', a), 0);
  }
  return 0;
}

function Iniciales({ nombre }) {
  const parts = (nombre || '').split(' ').filter(Boolean);
  const ini = parts.length >= 2 ? parts[0][0] + parts[1][0] : (parts[0] ? parts[0].slice(0, 2) : '?');
  return (
    <div className="w-6 h-6 rounded-full bg-guinda-100 text-guinda-700 text-[9px] font-bold flex items-center justify-center flex-shrink-0 uppercase" title={nombre}>
      {ini}
    </div>
  );
}

function ChipFecha({ fecha, completado }) {
  if (!fecha) return <span className="text-[10px] text-gray-300">Sin fecha</span>;
  const d = diasRestantes(fecha);
  const label = formatFecha(fecha, { day: '2-digit', month: 'short' });
  if (completado) return <span className="text-[10px] text-gray-400">{label}</span>;
  const cls = d < 0 ? 'bg-red-100 text-red-700' : d <= 7 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500';
  return <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${cls}`}>{label}{d < 0 ? ` (-${Math.abs(d)}d)` : ''}</span>;
}

// Normaliza campos que difieren ligeramente entre etapa/acción/tarea.
// avance_efectivo (recalculado al vuelo, igual que Detalle) tiene prioridad
// sobre avance_actual: para una hoja son el mismo número, pero si este nodo
// pasó de hoja a contenedor (p. ej. se le agregó una tarea) avance_actual
// se queda con el valor viejo mientras que avance_efectivo ya refleja el
// promedio real de sus partes — sin esto, esta tarjeta podía mostrar un %
// distinto al de la barra superior del panel para el mismo elemento.
function normalizar(tipo, nodo) {
  const avance = nodo.avance_efectivo ?? nodo.avance_actual ?? (tipo === 'etapa' ? nodo.porcentaje_calculado : nodo.porcentaje_avance) ?? 0;
  const fecha = nodo.fecha_limite || nodo.fecha_fin || null;
  return { avance: Math.round(parseFloat(avance) || 0), fecha };
}

export default function NodoCard({
  tipo, nodo, proyectoId, permisos, esContenedor = false,
  breadcrumb, onProyectoClick, onCambiado, defaultAbierto = false,
  ocultarMetadataFooter = false, ocultarCabecera = false,
  // Opcional: al eliminar este nodo, el contenedor puede necesitar algo más
  // que recargar (p. ej. deseleccionarlo antes, porque la ficha abierta es
  // justo la del nodo que desaparece). Sin esta prop se usa onCambiado.
  onEliminado,
  // El panel derecho de Seguimiento > Detalle y el drawer de Diagrama
  // (FichaNodo) usan el layout de 2 grupos del rediseño: "Vinculación"
  // reducida a Indicador/Territorio/Participante (Comentar y la vista de
  // Riesgos/Evidencia se navegan desde el feed de Actividad, ya visible
  // como componente hermano en ambos), y Duplicar/Eliminar bajan al pie,
  // chicos y separados. Sin esta prop (uso normal: tarjeta de un hijo en
  // una lista, o Mis actividades — sin un feed de Actividad al lado) se
  // conserva la cuadrícula plana de siempre, con todo junto.
  agrupado = false,
  // Opcional: atajo para saltar a la edición del Estatus en el grupo
  // "Ficha" (FichaNodo) — se usa en la leyenda de Bloqueada/Cancelada de
  // abajo, para que "cambiar el estatus" no sea una instrucción sin
  // acción asociada. Sin esta prop (uso normal fuera del panel agrupado)
  // la leyenda se queda sin el enlace.
  onIrAFicha,
}) {
  const { mostrarToast } = useUI();
  const [abierto, setAbierto] = useState(defaultAbierto);
  const [guardando, setGuardando] = useState(false);
  const [mostrarModalAvance, setMostrarModalAvance] = useState(false);
  const [mostrarModalRiesgo, setMostrarModalRiesgo] = useState(false);
  const [riesgoEditando, setRiesgoEditando] = useState(null); // riesgo completo del banner, en edición

  const [seccion, setSeccion] = useState(null); // null | 'comentar' | 'adjuntar' | 'riesgos' | 'indicador' | 'invitar' | 'territorio'
  const [comentarioTexto, setComentarioTexto] = useState('');
  const [actividad, setActividad] = useState(null); // se carga lazy al expandir
  const [evidenciasNodo, setEvidenciasNodo] = useState(null); // se carga lazy al abrir "Evidencia"
  const [mostrarDuplicar, setMostrarDuplicar] = useState(false);
  const [confirmDuplicarEtapa, setConfirmDuplicarEtapa] = useState(false);
  const [duplicandoEtapa, setDuplicandoEtapa] = useState(false);
  const [confirmEliminar, setConfirmEliminar] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [editandoFecha, setEditandoFecha] = useState(false);
  const [editandoFechaInicio, setEditandoFechaInicio] = useState(false);

  const { avance, fecha } = normalizar(tipo, nodo);
  const completado = nodo.estado === 'Completada';
  // Bloqueada/Cancelada son los dos estados donde el propio backend
  // rechaza (Bloqueada) o ignora (Cancelada) el avance sin importar qué
  // se mande — el modal ya lo muestra en solo lectura, pero sin una
  // leyenda aquí no queda claro POR QUÉ, ni que hay una forma de
  // revertirlo (el Estatus, en Ficha).
  const estadoCongelado = nodo.estado === 'Bloqueada' ? 'Bloqueada'
    : nodo.estado === 'Cancelada' ? 'Cancelada' : null;
  // El permiso puede ser parcial: quien fue invitado a una etapa suelta
  // captura ahí, no en todo el proyecto.
  const soloLectura = permisosDeNodo(permisos, tipo, nodo?.id)?.esSoloLectura ?? true;
  const puedeActualizar = !soloLectura && !esContenedor;

  async function cargarActividad() {
    try {
      const res = await actividadApi.obtenerActividadNodo(tipo, nodo.id);
      setActividad(res.datos || []);
    } catch { setActividad([]); }
  }

  async function cargarEvidenciasNodo() {
    try {
      // Una tarea no tiene tabla de evidencias propia — sus adjuntos se
      // filtran del stream `actividad` y se normalizan al mismo shape
      // {nombre_original, categoria, tipo_medio, url, autor_nombre,
      // created_at, notas} que ya espera SeccionArchivosNodo para etapa/
      // acción, así el componente no necesita saber de dónde vino cada uno.
      if (tipo === 'tarea') {
        const res = await actividadApi.obtenerActividadNodo(tipo, nodo.id);
        const archivos = (res.datos || [])
          .filter(a => a.tipo_evento === 'archivo')
          .map(a => ({
            id: a.id,
            nombre_original: a.archivo_nombre,
            categoria: a.metadata?.categoria || 'Otro',
            tipo_medio: a.metadata?.tipo_medio || 'archivo',
            url: a.metadata?.tipo_medio === 'link' ? a.archivo_url : undefined,
            autor_nombre: a.autor_nombre,
            created_at: a.created_at,
            notas: a.metadata?.notas || null,
          }));
        setEvidenciasNodo(archivos);
        return;
      }
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

  async function patch(datos) {
    setGuardando(true);
    try {
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
    await patch({ estado: completado ? 'Pendiente' : 'Completada' });
  }

  // Duplicar una etapa no tiene destino que elegir (su único contenedor es
  // el proyecto, que ya está fijo) — a diferencia de acción/tarea, que sí
  // usan ModalDuplicarNodo para escoger entre varias etapas/acciones
  // posibles. Por eso aquí basta un confirm: se agrega como etapa hermana
  // al final, con sus acciones y tareas copiadas.
  async function confirmarDuplicarEtapa() {
    setDuplicandoEtapa(true);
    try {
      await etapasApi.duplicarEtapa(nodo.id);
      setConfirmDuplicarEtapa(false);
      mostrarToast('Etapa duplicada', 'exito');
      onCambiado?.();
    } catch (err) {
      mostrarToast(err.response?.data?.mensaje || 'Error al duplicar', 'error');
      setConfirmDuplicarEtapa(false);
    } finally {
      setDuplicandoEtapa(false);
    }
  }

  async function confirmarEliminar() {
    setEliminando(true);
    try {
      if (tipo === 'etapa') await etapasApi.eliminarEtapa(nodo.id);
      else if (tipo === 'accion') await accionesApi.eliminarAccion(nodo.id);
      else await tareasApi.eliminarTarea(nodo.id);
      setConfirmEliminar(false);
      mostrarToast(`${TIPO_LABEL[tipo]} eliminada`, 'exito');
      // onCambiado recarga el árbol del padre; esta tarjeta se desmonta con
      // él, así que no hay estado local que limpiar después.
      onEliminado ? onEliminado() : onCambiado?.();
    } catch (err) {
      mostrarToast(err.response?.data?.mensaje || 'Error al eliminar', 'error');
      setConfirmEliminar(false);
    } finally {
      setEliminando(false);
    }
  }

  // "Reportar riesgo" abre el modal completo (título, causa, impacto,
  // responsable...) para los tres niveles — es donde vive el resto de la
  // app (Panorama, PanelRiesgos) y donde se puede proponer un responsable.
  // Tarea usó hasta hace poco un cuadro de texto rápido que caía al
  // stream `actividad` en vez de a la tabla `riesgos`, porque esa tabla
  // no incluía 'Tarea' en su entidad_tipo; ya se agregó (ver ENTIDAD_TIPO_RIESGO),
  // así que ahora los tres niveles se comportan igual.
  function abrirReportarRiesgo() {
    setMostrarModalRiesgo(true);
  }

  async function crearRiesgoDesdeTarjeta(datos) {
    await crearRiesgo(datos);
    setMostrarModalRiesgo(false);
    cargarActividad();
  }

  // El banner ámbar solo trae lo que ya viene en el stream de actividad
  // (contenido + nivel/estado) — para editar TODOS los campos (causa,
  // impacto, responsable, medida de mitigación...) hay que traer el
  // riesgo completo antes de abrir el modal. Ojo: metadata.riesgo_id solo
  // existe cuando el registro viene de la tabla `riesgos` (ver el UNION en
  // obtenerActividadNodo). Reportes viejos hechos con el cuadro de texto
  // rápido que existió antes (reportarRiesgo en api/actividad.js, ya sin
  // uso) quedaron como filas sueltas en `actividad` sin fila en `riesgos`
  // detrás — no tienen riesgo_id y no hay nada estructurado que editar, así
  // que NO se debe caer a riesgoActivo.id (que apunta a esa fila de
  // actividad, no a un riesgo, y el PUT/GET /riesgos/:id con ese id
  // siempre respondía 404 "Riesgo no encontrado").
  async function abrirEditarRiesgoActivo() {
    const riesgoId = riesgoActivo?.metadata?.riesgo_id;
    if (!riesgoId || soloLectura) return;
    try {
      const { datos } = await obtenerRiesgo(riesgoId);
      setRiesgoEditando(datos);
    } catch (err) {
      alert(err.response?.data?.mensaje || 'No se pudo abrir el riesgo');
    }
  }

  async function guardarRiesgoEditado(datos) {
    await actualizarRiesgo(riesgoEditando.id, datos);
    setRiesgoEditando(null);
    cargarActividad();
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

  const todosRiesgos = (actividad || []).filter(a => a.tipo_evento === 'riesgo');
  const riesgosCount = todosRiesgos.length;
  const todosComentarios = (actividad || []).filter(a => a.tipo_evento === 'comentario');
  // El stream ya viene ordenado del más reciente al más viejo (ver
  // obtenerActividadNodo en el backend) — el primero es el último registro.
  const ultimoRegistro = (actividad || [])[0] || null;
  // Banner ámbar: solo si hay un riesgo realmente abierto (no resuelto/cerrado).
  // Las entradas del stream nuevo (reportadas desde una tarea) no traen
  // metadata.estado, así que se consideran abiertas por defecto.
  const riesgoActivo = todosRiesgos.find(a => !a.metadata?.estado || ['Abierto', 'En_mitigacion'].includes(a.metadata.estado));
  const numHijosAEliminar = contarHijos(tipo, nodo);
  const numMunicipios = nodo.municipios?.length || 0;
  const territorioLabel = nodo.id_zm
    ? 'Zona Metropolitana asignada'
    : (nodo.cve_ent ? `Estado${numMunicipios ? ` + ${numMunicipios} municipio${numMunicipios !== 1 ? 's' : ''}` : ''} asignado` : null);

  return (
    <div className={`rounded-lg border transition-colors ${completado ? 'border-gray-100 bg-gray-50/40' : 'border-gray-200 bg-white'}`}>
      {/* ── Cabecera colapsada ── */}
      {!ocultarCabecera && (
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
          <span className={`text-sm truncate ${completado ? 'text-gray-400 line-through' : 'text-gray-800 font-medium'}`} title={nodo.nombre}>{nodo.nombre}</span>
        </button>

        {nodo.responsable_nombre && <Iniciales nombre={nodo.responsable_nombre} />}
        <ChipFecha fecha={fecha} completado={completado} />
        <span className="text-xs text-gray-500 tabular-nums w-9 text-right flex-shrink-0">{avance}%</span>
        <button onClick={toggleAbierto} className="flex-shrink-0 text-gray-400 hover:text-gray-600">
          {abierto ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </button>
      </div>
      )}

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
              <p className="text-xs text-amber-800 leading-snug flex-1">{riesgoActivo.contenido}</p>
              {!soloLectura && riesgoActivo.metadata?.riesgo_id && (
                <button
                  onClick={abrirEditarRiesgoActivo}
                  title="Editar este riesgo"
                  className="flex-shrink-0 text-amber-500 hover:text-amber-700 hover:bg-amber-100 rounded p-0.5 transition-colors"
                >
                  <Pencil size={12} />
                </button>
              )}
            </div>
          )}

          {/* Grupo "Avance" — "Registrar avance" abre el modal unificado
              (Estatus + Avance + Detalle + Evidencia en un solo guardado;
              incluye marcar como concluido). "Reportar riesgo" es un
              reporte en el tiempo distinto, va debajo y más chico. */}
          <span className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider block -mb-1.5">Avance</span>
          <div className="space-y-1.5">
            {esContenedor && (
              <div className="flex items-center gap-1.5 text-[11px] text-gray-400 bg-gray-100 px-3 py-2 rounded-lg">
                <Lock size={12} /> Se calcula desde sus partes
              </div>
            )}
            {estadoCongelado && (
              <div className="flex items-center gap-1.5 text-[11px] text-gray-400 bg-gray-100 px-3 py-2 rounded-lg">
                <Lock size={12} className="flex-shrink-0" />
                <span className="flex-1">
                  {estadoCongelado === 'Bloqueada' ? 'Bloqueada — el avance queda congelado hasta desbloquearla.' : 'Cancelada — no se registra avance en un elemento cancelado.'}
                </span>
                {onIrAFicha && (
                  <button onClick={onIrAFicha} className="text-guinda-600 hover:text-guinda-700 font-medium flex-shrink-0">
                    Cambiar estatus
                  </button>
                )}
              </div>
            )}
            <button disabled={soloLectura} onClick={() => setMostrarModalAvance(true)}
              className="w-full flex items-center justify-center gap-1.5 text-[12px] font-semibold px-3 py-2.5 rounded-lg disabled:opacity-40 transition-colors bg-guinda-600 text-white hover:bg-guinda-700">
              <TrendingUp size={14} /> Registrar avance
            </button>
            {!esContenedor && (
              <button disabled={soloLectura} onClick={abrirReportarRiesgo}
                className={`w-full flex items-center justify-center gap-1.5 text-[11px] font-medium px-2.5 py-2 rounded-lg border disabled:opacity-40 transition-colors ${mostrarModalRiesgo ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                <AlertTriangle size={13} /> Reportar riesgo
              </button>
            )}
            {/* Agregar hijo — mismo peso visual que "Registrar avance"/
                "Reportar riesgo" de arriba. Antes la única forma de crear
                un hijo era un enlace chico junto al encabezado de la lista
                (a la izquierda, fuera de este panel), fácil de pasar por
                alto; esta es la misma acción (CrearInline), solo con más
                presencia para quien mira este panel primero.
                Se muestra aunque el nodo todavía sea hoja (esContenedor
                falso): una acción sin tareas no es un estado permanente,
                es solo que no las tiene TODAVÍA — agregar la primera es
                precisamente cómo se decide descomponerla. Etapa siempre
                pasaba este filtro igual (esContenedor es fijo ahí), así
                que quitar la condición no le cambia nada; a acción sí la
                pone al mismo nivel. */}
            {!soloLectura && NIVELES[tipo]?.hijoTipo && (
              <CrearInline
                tipo={NIVELES[tipo].hijoTipo}
                padreId={nodo.id}
                proyectoId={proyectoId}
                onCreado={() => onCambiado?.()}
                etiqueta={`Agregar ${NIVELES[tipo].hijoLabel.toLowerCase()}`}
                variante="destacado"
              />
            )}
            {ultimoRegistro && (
              <p className="text-[10px] text-gray-400 text-center">
                Último: {formatFecha(ultimoRegistro.created_at)}{ultimoRegistro.autor_nombre ? ` · ${ultimoRegistro.autor_nombre}` : ''}
              </p>
            )}
          </div>

          {mostrarModalAvance && (
            <ModalRegistrarAvance
              tipo={tipo}
              nodo={nodo}
              esContenedor={esContenedor}
              onGuardado={async () => { await cargarActividad(); onCambiado?.(); }}
              onCerrar={() => setMostrarModalAvance(false)}
            />
          )}

          {mostrarModalRiesgo && (
            <ModalRiesgo
              entidadTipo={ENTIDAD_TIPO_RIESGO[tipo]}
              entidadId={nodo.id}
              onGuardar={crearRiesgoDesdeTarjeta}
              onCerrar={() => setMostrarModalRiesgo(false)}
            />
          )}

          {riesgoEditando && (
            <ModalRiesgo
              riesgo={riesgoEditando}
              entidadTipo={ENTIDAD_TIPO_RIESGO[tipo]}
              entidadId={nodo.id}
              onGuardar={guardarRiesgoEditado}
              onCerrar={() => setRiesgoEditando(null)}
            />
          )}

          {/* Grupo "Vinculación" — en el layout agrupado (panel de Detalle
              y drawer de Diagrama) son solo los 3 vínculos con otras
              entidades; Comentar/Evidencia/Riesgos se navegan desde el
              feed de Actividad, que vive al lado en ambos contextos. En el
              layout plano (tarjeta de lista, Mis actividades — sin feed de
              Actividad al lado) se conservan los de siempre. */}
          <div className="pt-2 border-t border-gray-100">
            <span className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">
              {agrupado ? 'Vinculación' : 'Registro y vínculos'}
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              {!agrupado && (
                <>
                  <BotonContextual icono={MessageSquare} label="Comentar" activo={seccion === 'comentar'} onClick={() => setSeccion(seccion === 'comentar' ? null : 'comentar')} />
                  <BotonContextual icono={Paperclip} label="Evidencia" activo={seccion === 'adjuntar'} onClick={() => {
                    const next = seccion === 'adjuntar' ? null : 'adjuntar';
                    setSeccion(next);
                    if (next === 'adjuntar' && evidenciasNodo === null) cargarEvidenciasNodo();
                  }} />
                  <BotonContextual icono={Shield} label={`Riesgos${riesgosCount ? ` (${riesgosCount})` : ''}`} activo={seccion === 'riesgos'} onClick={() => setSeccion(seccion === 'riesgos' ? null : 'riesgos')} />
                </>
              )}
              <BotonContextual icono={BarChart3} label="Vincular indicador" activo={seccion === 'indicador'} onClick={() => setSeccion(seccion === 'indicador' ? null : 'indicador')} />
              <BotonContextual icono={MapPin} label="Territorio" activo={seccion === 'territorio'} onClick={() => setSeccion(seccion === 'territorio' ? null : 'territorio')} />
              {permisos?.puedeInvitar && (
                <BotonContextual icono={UserPlus} label="Invitar participante" activo={seccion === 'invitar'} onClick={() => setSeccion(seccion === 'invitar' ? null : 'invitar')} />
              )}
              {!agrupado && !esContenedor && permisos?.puedeCrearAccion && (tipo === 'accion' || tipo === 'tarea') && (
                <BotonContextual icono={Copy} label="Duplicar" activo={false} onClick={() => setMostrarDuplicar(true)} />
              )}
              {!agrupado && tipo === 'etapa' && permisos?.puedeCrearEtapa && (
                <BotonContextual icono={Copy} label="Duplicar" activo={false} onClick={() => setConfirmDuplicarEtapa(true)} />
              )}
            </div>

            {/* Eliminar — destructivo y en cascada, así que va separado del
                resto de la rejilla y en rojo, no mezclado entre acciones
                cotidianas. permisos.puedeEliminar ya es "creador o
                responsable del proyecto" (o superadmin/ejecutivo), la misma
                regla que valida el backend en DELETE /etapas|acciones|tareas.
                En el layout agrupado, Eliminar (y Duplicar) bajan al pie del
                panel — ver más abajo. */}
            {!agrupado && permisos?.puedeEliminar && (
              <button
                onClick={() => setConfirmEliminar(true)}
                className="mt-1.5 w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] font-medium text-red-600 border border-red-200 rounded-md hover:bg-red-50 transition-colors"
              >
                <Trash2 size={12} /> Eliminar {TIPO_LABEL_MIN[tipo]}
              </button>
            )}

            {/* Pie del panel agrupado: Duplicar/Eliminar, chicos, discretos,
                alineados a la derecha y separados por una línea — para
                evitar clics accidentales en algo destructivo. */}
            {agrupado && (permisos?.puedeEliminar || (!esContenedor && permisos?.puedeCrearAccion && (tipo === 'accion' || tipo === 'tarea')) || (tipo === 'etapa' && permisos?.puedeCrearEtapa)) && (
              <div className="mt-3 pt-2.5 border-t border-gray-100 flex items-center justify-end gap-3">
                {!esContenedor && permisos?.puedeCrearAccion && (tipo === 'accion' || tipo === 'tarea') && (
                  <button onClick={() => setMostrarDuplicar(true)} className="text-[11px] text-gray-400 hover:text-gray-600">
                    Duplicar {TIPO_LABEL_MIN[tipo]}
                  </button>
                )}
                {tipo === 'etapa' && permisos?.puedeCrearEtapa && (
                  <button onClick={() => setConfirmDuplicarEtapa(true)} className="text-[11px] text-gray-400 hover:text-gray-600">
                    Duplicar {TIPO_LABEL_MIN[tipo]}
                  </button>
                )}
                {permisos?.puedeEliminar && (
                  <button onClick={() => setConfirmEliminar(true)} className="text-[11px] text-red-400 hover:text-red-600">
                    Eliminar {TIPO_LABEL_MIN[tipo]}
                  </button>
                )}
              </div>
            )}
          </div>

          <ConfirmDialog
            abierto={confirmEliminar}
            titulo={`Eliminar ${TIPO_LABEL_MIN[tipo]}`}
            mensaje={
              numHijosAEliminar > 0
                ? `"${nodo.nombre}" y sus ${numHijosAEliminar} elemento${numHijosAEliminar > 1 ? 's' : ''} relacionados se eliminarán permanentemente. Esta acción no se puede deshacer.`
                : `"${nodo.nombre}" se eliminará permanentemente. Esta acción no se puede deshacer.`
            }
            textoConfirmar={eliminando ? 'Eliminando...' : 'Eliminar'}
            onConfirmar={confirmarEliminar}
            onCancelar={() => setConfirmEliminar(false)}
          />

          <ConfirmDialog
            abierto={confirmDuplicarEtapa}
            titulo="Duplicar etapa"
            mensaje={`Se creará una copia independiente de "${nodo.nombre}"${
              numHijosAEliminar > 0 ? ` con sus ${numHijosAEliminar} elemento${numHijosAEliminar > 1 ? 's' : ''} (acciones y tareas)` : ''
            } al final de este proyecto. La copia empieza en Pendiente, 0%, sin fechas ni territorio propios.`}
            textoConfirmar={duplicandoEtapa ? 'Duplicando...' : 'Duplicar'}
            variante="normal"
            onConfirmar={confirmarDuplicarEtapa}
            onCancelar={() => setConfirmDuplicarEtapa(false)}
          />

          {mostrarDuplicar && (
            <ModalDuplicarNodo
              tipo={tipo}
              nodo={nodo}
              proyectoId={proyectoId}
              mostrarToast={mostrarToast}
              onCerrar={() => setMostrarDuplicar(false)}
              onCompletado={onCambiado}
            />
          )}

          {seccion === 'comentar' && (
            ENTIDAD_TIPO[tipo] ? (
              <div className="bg-gray-50 rounded-lg p-2.5 max-h-96 overflow-y-auto">
                <HiloComentarios entidadTipo={ENTIDAD_TIPO[tipo]} entidadId={nodo.id} compacto={false} soloLectura={soloLectura} onStatsChange={cargarActividad} />
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
                {/* Comentar es participar, no mirar: quien no fue invitado
                    lee el hilo pero no escribe en él. El servidor aplica la
                    misma regla en POST /comentarios. */}
                {soloLectura ? (
                  <p className="text-[11px] text-gray-400 italic">
                    Solo consulta. Para comentar aquí necesitas participar en este proyecto.
                  </p>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <input value={comentarioTexto} onChange={e => setComentarioTexto(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && enviarComentario()}
                      placeholder="Escribe un comentario..." autoFocus
                      className="flex-1 text-xs border border-gray-200 rounded px-2 py-1.5 bg-white focus:border-guinda-400 outline-none" />
                    <button onClick={enviarComentario} disabled={guardando || !comentarioTexto.trim()} className="p-1.5 bg-guinda-600 text-white rounded hover:bg-guinda-700 disabled:opacity-40">
                      <Send size={13} />
                    </button>
                  </div>
                )}
              </div>
            )
          )}

          {seccion === 'adjuntar' && (
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
            <div className="bg-gray-50 rounded-lg p-2.5 max-h-96 overflow-y-auto">
              <PanelRiesgos entidadTipo={ENTIDAD_TIPO_RIESGO[tipo]} entidadId={nodo.id} soloLectura={soloLectura} onStatsChange={cargarActividad} />
            </div>
          )}

          {seccion === 'indicador' && (
            <div className="bg-gray-50 rounded-lg p-2.5 max-h-80 overflow-y-auto">
              <TabIndicadores tipo={tipo} nodoId={nodo.id} proyectoId={proyectoId} soloLectura={soloLectura} />
            </div>
          )}

          {seccion === 'invitar' && (
            <div className="bg-gray-50 rounded-lg p-2.5">
              <SeccionMiembrosNodo tipo={tipo} idNodo={nodo.id} permisos={permisos}
                idProyecto={proyectoId} nombreNodo={nodo.nombre} />
            </div>
          )}

          {seccion === 'territorio' && (
            <div className="bg-gray-50 rounded-lg p-2.5">
              <TerritorioSelector data={nodo} soloLectura={soloLectura} soportarZM={tipo !== 'tarea'}
                onGuardar={(campo, valor) => patch({ [campo]: valor })} />
            </div>
          )}

          {/* Row 3: metadata — se omite cuando esta tarjeta es la vista
              "propia" de un nodo seleccionado en el panel de Seguimiento:
              el rail de "Propiedades" al lado ya muestra estos mismos
              datos (avance, fechas, responsable) de forma editable y con
              contexto (ver EtapasAvancesMD.jsx). Aquí sigue siendo el
              único resumen disponible cuando la tarjeta representa un
              hijo en una lista, así que no se quita en ese caso. */}
          {!ocultarMetadataFooter && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-gray-400 pt-1">
            <span>Avance: <strong className="text-gray-600">{avance}%</strong></span>
            {tipo === 'etapa' ? (
              // La fecha de inicio de una etapa se calcula sola desde sus acciones
              // (ver recalcularEtapa) — mostrarla editable sería engañoso.
              <span className="flex items-center gap-1" title="Se calcula automáticamente como la fecha de inicio más temprana entre sus acciones">
                <Lock size={10} />
                Inicia: <strong className="text-gray-500">{formatFecha(nodo.fecha_inicio) || 'Sin definir'}</strong>
              </span>
            ) : editandoFechaInicio ? (
              <span className="flex items-center gap-1">
                Inicia:
                <span className="w-32">
                  <CampoFecha
                    valor={nodo.fecha_inicio ? String(nodo.fecha_inicio).slice(0, 10) : ''}
                    onChange={v => patch({ fecha_inicio: v || null }).then(() => setEditandoFechaInicio(false))}
                  />
                </span>
                <button onClick={() => setEditandoFechaInicio(false)} className="text-gray-400 hover:text-gray-600"><X size={11} /></button>
              </span>
            ) : (
              <span
                onClick={() => !soloLectura && setEditandoFechaInicio(true)}
                className={!soloLectura ? 'cursor-pointer hover:text-guinda-600' : ''}
                title={!soloLectura ? 'Clic para editar' : undefined}
              >
                Inicia: <strong className="text-gray-600">{formatFecha(nodo.fecha_inicio) || 'Sin fecha'}</strong>
              </span>
            )}
            {editandoFecha ? (
              <span className="flex items-center gap-1">
                Vence:
                <span className="w-32">
                  <CampoFecha
                    valor={fecha ? String(fecha).slice(0, 10) : ''}
                    onChange={v => patch({ fecha_limite: v || null }).then(() => setEditandoFecha(false))}
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
                Vence: <strong className="text-gray-600">{formatFecha(fecha) || 'Sin fecha'}</strong>
              </span>
            )}
            {nodo.responsable_nombre && <span>Responsable: <strong className="text-gray-600">{nodo.responsable_nombre}</strong>{nodo.dg_siglas ? ` (${nodo.dg_siglas})` : ''}</span>}
            {territorioLabel && <span className="flex items-center gap-1"><MapPin size={10} />{territorioLabel}</span>}
          </div>
          )}
        </div>
      )}
    </div>
  );
}

function BotonContextual({ icono: Icono, label, activo, onClick }) {
  return (
    <button onClick={onClick}
      className={`flex items-center justify-center gap-1.5 text-[11px] font-medium px-2.5 py-2 rounded-lg border transition-colors ${
        activo ? 'border-guinda-400 bg-guinda-50 text-guinda-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
      }`}>
      <Icono size={12} /> {label}
    </button>
  );
}
