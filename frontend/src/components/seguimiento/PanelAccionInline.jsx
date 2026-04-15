/**
 * ARCHIVO: PanelAccionInline.jsx
 * PROPÓSITO: Panel de detalle de acción que se expande inline dentro de
 *            la lista de acciones de una etapa (sin modal/overlay).
 *
 * MINI-CLASE: Contenido del DrawerAccion sin capa modal
 * ─────────────────────────────────────────────────────────────────
 * Contiene exactamente la misma información que DrawerAccion pero se
 * renderiza en el flujo normal del DOM, expandiéndose debajo de la
 * fila de acción correspondiente. Layout 2 columnas: izq=tareas,
 * der=archivos+discusión. Reutiliza SubaccionItem, HiloConsolidado,
 * DrawerSubaccion, TarjetaIndicadorCascada.
 * ─────────────────────────────────────────────────────────────────
 */
import { useState, useEffect, useRef } from 'react';
import {
  Upload, Download, Trash2, FileText, Plus,
  Lock, CheckCircle2, Circle, Ban, Clock,
  Flame, CalendarClock, AlertTriangle, Paperclip,
  MessageSquare, Tag, BarChart3, Save,
} from 'lucide-react';
import HiloConsolidado from '../comentarios/HiloConsolidado';
import SubaccionItem from './SubaccionItem';
import DrawerSubaccion from './DrawerSubaccion';
import { TarjetaIndicadorCascada } from './ModalNuevaAccion';
import CATEGORIAS_EVIDENCIA from './categoriasEvidencia';
import * as accionesApi from '../../api/acciones';
import * as evidenciasApi from '../../api/evidencias';
import * as etapasApi from '../../api/etapas';
import * as indicadoresApi from '../../api/indicadores';

const ESTADO_CONFIG = {
  Completada: { etiqueta: 'Completada', icono: CheckCircle2, bg: 'bg-emerald-50', texto: 'text-emerald-600', borde: 'border-emerald-200', dot: 'bg-emerald-500', barra: 'bg-emerald-400' },
  En_proceso: { etiqueta: 'En proceso', icono: Clock,        bg: 'bg-amber-50',   texto: 'text-amber-600',   borde: 'border-amber-200',  dot: 'bg-amber-400',   barra: 'bg-amber-400'  },
  Bloqueada:  { etiqueta: 'Bloqueada',  icono: Lock,         bg: 'bg-red-50',     texto: 'text-red-600',     borde: 'border-red-200',    dot: 'bg-red-500',     barra: 'bg-red-400'    },
  Cancelada:  { etiqueta: 'Cancelada',  icono: Ban,          bg: 'bg-gray-50',    texto: 'text-gray-400',    borde: 'border-gray-200',   dot: 'bg-gray-300',    barra: 'bg-gray-300'   },
  Pendiente:  { etiqueta: 'Pendiente',  icono: Circle,       bg: 'bg-slate-50',   texto: 'text-slate-500',   borde: 'border-slate-200',  dot: 'bg-slate-300',   barra: 'bg-slate-300'  },
};

const ESTADOS_TRANSICION = ['Pendiente', 'En_proceso', 'Bloqueada', 'Completada', 'Cancelada'];

const hoy = () => new Date(new Date().toDateString());

function diasRestantes(fechaFin) {
  if (!fechaFin) return null;
  return Math.round((new Date(new Date(fechaFin).toDateString()) - hoy()) / 86400000);
}

const fmt = (f) =>
  f ? new Date(f).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

function BadgeUrgencia({ sub }) {
  if (sub.estado === 'Completada' || sub.estado === 'Cancelada') return null;
  const dias = diasRestantes(sub.fecha_fin);
  if (dias === null) return null;
  if (dias < 0)
    return <span className="flex items-center gap-0.5 text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full flex-shrink-0"><Flame size={9}/> Vencida</span>;
  if (dias === 0)
    return <span className="flex items-center gap-0.5 text-[10px] font-bold text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded-full flex-shrink-0"><AlertTriangle size={9}/> Hoy</span>;
  if (dias <= 3)
    return <span className="flex items-center gap-0.5 text-[10px] font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full flex-shrink-0"><CalendarClock size={9}/> {dias}d</span>;
  return null;
}

function FilaEvidencia({ ev, soloLectura, onEliminar }) {
  return (
    <div className="group/file flex items-center gap-2 py-1.5 px-2 -mx-1 rounded-lg hover:bg-gray-50 transition-colors">
      <FileText size={13} className="text-gray-300 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[12px] text-gray-700 truncate leading-tight">{ev.nombre_original}</p>
        <p className="text-[10px] text-gray-400 leading-tight">{ev.categoria}</p>
      </div>
      <a href={evidenciasApi.obtenerUrlDescarga(ev.id)} target="_blank" rel="noopener noreferrer"
        className="text-guinda-400 hover:text-guinda-600 p-1 flex-shrink-0" title="Descargar">
        <Download size={12} />
      </a>
      {!soloLectura && onEliminar && (
        <button onClick={() => onEliminar(ev.id)}
          className="text-gray-300 hover:text-red-500 p-1 flex-shrink-0 opacity-0 group-hover/file:opacity-100 transition-opacity">
          <Trash2 size={11} />
        </button>
      )}
    </div>
  );
}

export default function PanelAccionInline({ accion, soloLectura, onActualizado }) {
  const [tabDerecha, setTabDerecha]         = useState('indicadores');
  const [subacciones, setSubacciones]       = useState([]);
  const [evidenciasAccion, setEvidenciasAccion] = useState([]);
  const [evidenciasSubs, setEvidenciasSubs] = useState({});
  const [cargandoEv, setCargandoEv]         = useState(false);
  const [subiendo, setSubiendo]             = useState(false);
  const [categoriaEv, setCategoriaEv]       = useState('Otro');
  const [notasEv, setNotasEv]               = useState('');
  const [cambiandoEstado, setCambiandoEstado] = useState(false);
  const [mostrarFormSub, setMostrarFormSub] = useState(false);
  const [nuevaSub, setNuevaSub]             = useState({ nombre: '', fecha_inicio: '', fecha_fin: '', indicadores_asociados: [] });
  const [creandoSub, setCreandoSub]         = useState(false);
  const [subaccionDetalle, setSubaccionDetalle] = useState(null);
  const [indicadoresSub, setIndicadoresSub] = useState([]);
  const [resumenesSub, setResumenesSub]     = useState({});
  // Indicadores editables de la acción
  const [indicadoresDisponibles, setIndicadoresDisponibles] = useState([]);
  const [resumenesAccion, setResumenesAccion] = useState({});
  const [indicadoresAccion, setIndicadoresAccion] = useState([]);
  const [guardandoInd, setGuardandoInd] = useState(false);
  const fileRef = useRef(null);

  const estaVencida = !['Completada', 'Cancelada'].includes(accion.estado)
    && accion.fecha_fin && new Date(new Date(accion.fecha_fin).toDateString()) < hoy();
  const cfg = ESTADO_CONFIG[accion.estado] || ESTADO_CONFIG.Pendiente;
  const pct = parseFloat(accion.porcentaje_avance || 0);

  useEffect(() => {
    cargarSubacciones();
    cargarEvidenciasAccion();
    cargarIndicadoresAccion();
  }, [accion.id]);

  async function cargarIndicadoresAccion() {
    try {
      // Cargar indicadores disponibles (solo etapa si hay etapa, solo proyecto si no)
      let inds = [];
      if (accion.id_etapa) {
        const res = await etapasApi.obtenerIndicadoresEtapa(accion.id_etapa);
        inds = res.datos || [];
      } else if (accion.id_proyecto) {
        const res = await indicadoresApi.obtenerIndicadoresProyecto(accion.id_proyecto);
        inds = res.datos || [];
      }
      setIndicadoresDisponibles(inds);
      // Cargar resúmenes y actuales en paralelo
      const [resResultados, actualesRes] = await Promise.all([
        Promise.allSettled(inds.map(ind => indicadoresApi.obtenerResumenAportaciones(ind.id))),
        accionesApi.obtenerIndicadoresAccion(accion.id),
      ]);
      const mapa = {};
      inds.forEach((ind, i) => {
        if (resResultados[i].status === 'fulfilled') mapa[ind.id] = resResultados[i].value.datos;
      });
      setResumenesAccion(mapa);
      // Convertir actuales a formato editable
      const actuales = (actualesRes.datos || []).map(ai => ({
        id_indicador: ai.id_indicador,
        valor_aportado: String(parseFloat(ai.valor_aportado) || ''),
        modo: 'manual',
      }));
      setIndicadoresAccion(actuales);
    } catch { /* silenciar */ }
  }

  async function cargarSubacciones() {
    try {
      const res = await accionesApi.obtenerSubacciones(accion.id);
      const subs = res.datos || [];
      setSubacciones(subs);
      const resultados = await Promise.allSettled(
        subs.map(s => evidenciasApi.obtenerEvidenciasSubaccion(s.id))
      );
      const mapa = {};
      subs.forEach((s, i) => {
        mapa[s.id] = resultados[i].status === 'fulfilled'
          ? (resultados[i].value.datos || []) : [];
      });
      setEvidenciasSubs(mapa);
    } catch { /* silenciar */ }
  }

  async function cargarEvidenciasAccion() {
    setCargandoEv(true);
    try {
      const res = await evidenciasApi.obtenerEvidenciasAccion(accion.id);
      setEvidenciasAccion(res.datos || []);
    } catch { /* silenciar */ }
    finally { setCargandoEv(false); }
  }

  async function cambiarEstado(nuevoEstado) {
    if (cambiandoEstado || accion.estado === nuevoEstado) return;
    const payload = { estado: nuevoEstado };
    if (nuevoEstado === 'Bloqueada') {
      const motivo = prompt('Motivo del bloqueo:');
      if (!motivo) return;
      payload.motivo_bloqueo = motivo;
    }
    setCambiandoEstado(true);
    try {
      await accionesApi.actualizarAccion(accion.id, payload);
      onActualizado && onActualizado();
    } catch (err) {
      alert(err.response?.data?.mensaje || 'Error al cambiar estado');
    } finally { setCambiandoEstado(false); }
  }

  function toggleIndicadorAccion(indicadorId) {
    setIndicadoresAccion(prev => {
      const existe = prev.find(ia => ia.id_indicador === indicadorId);
      if (existe) return prev.filter(ia => ia.id_indicador !== indicadorId);
      return [...prev, { id_indicador: indicadorId, valor_aportado: '', modo: 'manual' }];
    });
  }

  function cambiarModoAccion(indicadorId, modo) {
    setIndicadoresAccion(prev => prev.map(ia => {
      if (ia.id_indicador !== indicadorId) return ia;
      if (modo === 'equitativo') {
        const disp = resumenesAccion[indicadorId]?.disponible ?? 0;
        return { ...ia, modo, valor_aportado: disp > 0 ? String(disp) : '0' };
      }
      return { ...ia, modo, valor_aportado: '' };
    }));
  }

  function actualizarAportacionAccion(indicadorId, valor) {
    setIndicadoresAccion(prev => prev.map(ia =>
      ia.id_indicador === indicadorId ? { ...ia, valor_aportado: valor } : ia
    ));
  }

  async function guardarIndicadoresAccion() {
    setGuardandoInd(true);
    try {
      await accionesApi.actualizarIndicadoresAccion(accion.id, indicadoresAccion);
      onActualizado && onActualizado();
      await cargarIndicadoresAccion();
    } catch (err) {
      alert(err.response?.data?.mensaje || 'Error al guardar indicadores');
    } finally { setGuardandoInd(false); }
  }

  async function abrirFormSubaccion() {
    setMostrarFormSub(true);
    try {
      // Solo indicadores de etapa para subacciones
      let inds = [];
      if (accion.id_etapa) {
        const res = await etapasApi.obtenerIndicadoresEtapa(accion.id_etapa);
        inds = res.datos || [];
      } else if (accion.id_proyecto) {
        const res = await indicadoresApi.obtenerIndicadoresProyecto(accion.id_proyecto);
        inds = res.datos || [];
      }
      setIndicadoresSub(inds);
      if (inds.length > 0) {
        const resultados = await Promise.allSettled(
          inds.map(ind => indicadoresApi.obtenerResumenAportaciones(ind.id))
        );
        const mapa = {};
        inds.forEach((ind, i) => {
          if (resultados[i].status === 'fulfilled') mapa[ind.id] = resultados[i].value.datos;
        });
        setResumenesSub(mapa);
      }
    } catch { /* silenciar */ }
  }

  function toggleIndicadorSub(indicadorId) {
    setNuevaSub(prev => {
      const existe = prev.indicadores_asociados.find(ia => ia.id_indicador === indicadorId);
      if (existe) return { ...prev, indicadores_asociados: prev.indicadores_asociados.filter(ia => ia.id_indicador !== indicadorId) };
      return { ...prev, indicadores_asociados: [...prev.indicadores_asociados, { id_indicador: indicadorId, valor_aportado: '', modo: 'manual' }] };
    });
  }

  function cambiarModoSub(indicadorId, modo) {
    setNuevaSub(prev => ({
      ...prev,
      indicadores_asociados: prev.indicadores_asociados.map(ia => {
        if (ia.id_indicador !== indicadorId) return ia;
        if (modo === 'equitativo') {
          const disp = resumenesSub[indicadorId]?.disponible ?? 0;
          return { ...ia, modo, valor_aportado: disp > 0 ? String(disp) : '0' };
        }
        return { ...ia, modo, valor_aportado: '' };
      }),
    }));
  }

  function actualizarAportacionSub(indicadorId, valor) {
    setNuevaSub(prev => ({
      ...prev,
      indicadores_asociados: prev.indicadores_asociados.map(ia =>
        ia.id_indicador === indicadorId ? { ...ia, valor_aportado: valor } : ia
      ),
    }));
  }

  async function crearSubaccion() {
    if (!nuevaSub.nombre.trim() || !nuevaSub.fecha_inicio || !nuevaSub.fecha_fin) return;
    setCreandoSub(true);
    try {
      await accionesApi.crearSubaccion(accion.id, nuevaSub);
      setNuevaSub({ nombre: '', fecha_inicio: '', fecha_fin: '', indicadores_asociados: [] });
      setMostrarFormSub(false);
      await cargarSubacciones();
      onActualizado && onActualizado('subaccion');
    } catch (err) {
      alert(err.response?.data?.mensaje || 'Error al crear tarea');
    } finally { setCreandoSub(false); }
  }

  async function subirArchivo(e) {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    setSubiendo(true);
    try {
      await evidenciasApi.subirEvidenciaAccion(accion.id, archivo, { categoria: categoriaEv, notas: notasEv });
      setNotasEv('');
      await cargarEvidenciasAccion();
      onActualizado && onActualizado();
    } catch (err) {
      alert(err.response?.data?.mensaje || 'Error al subir evidencia');
    } finally {
      setSubiendo(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function eliminarEvidencia(evId) {
    if (!confirm('¿Eliminar esta evidencia?')) return;
    try {
      await evidenciasApi.eliminarEvidencia(evId);
      await cargarEvidenciasAccion();
      onActualizado && onActualizado();
    } catch { /* silenciar */ }
  }

  const subsCompletadas = subacciones.filter(s => s.estado === 'Completada').length;
  const subsVencidas    = subacciones.filter(s =>
    !['Completada','Cancelada'].includes(s.estado) && diasRestantes(s.fecha_fin) !== null && diasRestantes(s.fecha_fin) < 0
  );
  const subsPorVencer   = subacciones.filter(s =>
    !['Completada','Cancelada'].includes(s.estado) && diasRestantes(s.fecha_fin) !== null
    && diasRestantes(s.fecha_fin) >= 0 && diasRestantes(s.fecha_fin) <= 3
  );
  const subsBloqueadas  = subacciones.filter(s => s.estado === 'Bloqueada');
  const hayAlertas = subsVencidas.length > 0 || subsPorVencer.length > 0 || subsBloqueadas.length > 0 || estaVencida;
  const diasRestantesAccion = diasRestantes(accion.fecha_fin);
  const todasEvidencias = [
    ...evidenciasAccion,
    ...subacciones.flatMap(s => evidenciasSubs[s.id] || []),
  ];

  return (
    <div className="border-t border-gray-100 bg-gray-50/40">

      {/* ── HEADER INFO ─────────────────────────────────────────── */}
      <div className="px-4 pt-3 pb-2 border-b border-gray-100 flex items-start gap-3">
        {/* Anillo SVG */}
        <div className="relative flex-shrink-0 w-[52px] h-[52px]">
          <svg width="52" height="52" className="-rotate-90">
            <circle cx="26" cy="26" r="20" fill="none" stroke="#f1f5f9" strokeWidth="5" />
            <circle cx="26" cy="26" r="20" fill="none"
              stroke={pct >= 100 ? '#10b981' : pct > 60 ? '#f59e0b' : pct > 0 ? '#9f2241' : '#e2e8f0'}
              strokeWidth="5"
              strokeDasharray={`${(pct / 100) * 125.7} 125.7`}
              strokeLinecap="round" />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[11px] font-black tabular-nums text-gray-800">{pct.toFixed(0)}%</span>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            {accion.tipo === 'Hito' && (
              <span className="text-[9px] font-bold text-purple-600 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded-full">HITO</span>
            )}
            <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.texto} ${cfg.borde}`}>
              <cfg.icono size={10} /> {cfg.etiqueta}
            </span>
            {estaVencida && (
              <span className="flex items-center gap-1 text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                <Flame size={9} /> Vencida
              </span>
            )}
            {!estaVencida && diasRestantesAccion !== null && diasRestantesAccion <= 3
              && !['Completada','Cancelada'].includes(accion.estado) && (
              <span className="flex items-center gap-1 text-[10px] font-bold text-orange-600 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full">
                <CalendarClock size={9} />
                Vence {diasRestantesAccion === 0 ? 'hoy' : `en ${diasRestantesAccion}d`}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-gray-400">
            {accion.responsable_nombre && (
              <span className="font-semibold text-gray-600">{accion.responsable_nombre}</span>
            )}
            {accion.fecha_inicio && (
              <span className={estaVencida ? 'text-red-500 font-medium' : ''}>
                {fmt(accion.fecha_inicio)} → {fmt(accion.fecha_fin)}
              </span>
            )}
            {subacciones.length > 0 && (
              <span className="tabular-nums">{subsCompletadas}/{subacciones.length} tareas</span>
            )}
            {todasEvidencias.length > 0 && (
              <span className="flex items-center gap-1"><Paperclip size={10}/> {todasEvidencias.length} archivos</span>
            )}
          </div>
          {subacciones.length > 0 && (
            <div className="mt-1.5 flex gap-0.5 h-1 rounded-full overflow-hidden max-w-[240px]">
              {subacciones.map(s => {
                const c = ESTADO_CONFIG[s.estado] || ESTADO_CONFIG.Pendiente;
                return <div key={s.id} className={`flex-1 ${c.barra}`} title={s.nombre} />;
              })}
            </div>
          )}
        </div>
      </div>

      {/* Motivo de bloqueo */}
      {accion.estado === 'Bloqueada' && accion.motivo_bloqueo && (
        <div className="mx-4 mt-2 flex items-center gap-2 px-3 py-2 bg-red-50 rounded-xl text-xs text-red-700 border border-red-200">
          <Lock size={12} className="flex-shrink-0" />
          <span className="font-medium">Motivo:</span>&nbsp;{accion.motivo_bloqueo}
        </div>
      )}

      {/* ── CAMBIO DE ESTADO ────────────────────────────────────── */}
      {!soloLectura && (
        <div className="px-4 py-2 flex items-center gap-1.5 flex-wrap bg-slate-50/60 border-b border-gray-100">
          <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mr-1">Cambiar a:</span>
          {ESTADOS_TRANSICION.map(est => {
            const c = ESTADO_CONFIG[est];
            const activo = accion.estado === est;
            return (
              <button key={est}
                disabled={cambiandoEstado || activo}
                onClick={() => cambiarEstado(est)}
                className={`flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-lg transition-all font-semibold ${
                  activo
                    ? `${c.bg} ${c.texto} border ${c.borde} shadow-sm`
                    : 'text-gray-400 hover:bg-white hover:text-gray-700 hover:shadow-sm'
                } disabled:cursor-default`}>
                <c.icono size={10} />{c.etiqueta}
              </button>
            );
          })}
        </div>
      )}

      {/* Alertas */}
      {hayAlertas && (
        <div className="px-4 py-1.5 flex items-center gap-2 flex-wrap border-b border-gray-100/80">
          {estaVencida && (
            <span className="flex items-center gap-1 px-2 py-0.5 bg-red-50 border border-red-200 rounded-lg text-[10px] text-red-700 font-semibold">
              <Flame size={10}/> Esta acción está vencida
            </span>
          )}
          {subsVencidas.length > 0 && (
            <span className="flex items-center gap-1 px-2 py-0.5 bg-red-50 border border-red-200 rounded-lg text-[10px] text-red-700 font-medium">
              <Flame size={10}/> {subsVencidas.length} tarea{subsVencidas.length > 1 ? 's' : ''} vencida{subsVencidas.length > 1 ? 's' : ''}
            </span>
          )}
          {subsPorVencer.length > 0 && (
            <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-50 border border-amber-200 rounded-lg text-[10px] text-amber-700 font-medium">
              <CalendarClock size={10}/> Por vencer: {subsPorVencer.map(s => `${s.nombre} (${diasRestantes(s.fecha_fin) === 0 ? 'hoy' : `${diasRestantes(s.fecha_fin)}d`})`).join(', ')}
            </span>
          )}
          {subsBloqueadas.length > 0 && (
            <span className="flex items-center gap-1 px-2 py-0.5 bg-red-50 border border-red-200 rounded-lg text-[10px] text-red-700 font-medium">
              <Lock size={10}/> {subsBloqueadas.length} tarea{subsBloqueadas.length > 1 ? 's' : ''} bloqueada{subsBloqueadas.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}

      {/* ── CUERPO 2 COLUMNAS ────────────────────────────────────── */}
      <div className="flex gap-0 min-h-[200px]">

        {/* Columna izquierda: TAREAS */}
        <div className="flex-1 min-w-0 border-r border-gray-100 px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                Tareas ({subacciones.length})
              </h3>
              {subsCompletadas > 0 && (
                <span className="flex items-center gap-0.5 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">
                  <CheckCircle2 size={9}/> {subsCompletadas}
                </span>
              )}
              {subsVencidas.length > 0 && (
                <span className="flex items-center gap-0.5 text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full">
                  <Flame size={9}/> {subsVencidas.length}
                </span>
              )}
            </div>
            {!soloLectura && !mostrarFormSub && (
              <button onClick={abrirFormSubaccion}
                className="flex items-center gap-1 text-xs text-guinda-500 hover:text-guinda-700 font-semibold transition-colors">
                <Plus size={12}/> Agregar
              </button>
            )}
          </div>

          {subacciones.length === 0 && !mostrarFormSub && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CheckCircle2 size={18} className="text-gray-200 mb-2" />
              <p className="text-xs text-gray-300">Sin tareas registradas</p>
              {!soloLectura && (
                <button onClick={abrirFormSubaccion}
                  className="mt-1.5 text-xs text-guinda-500 hover:text-guinda-700 font-medium">
                  + Agregar primera tarea
                </button>
              )}
            </div>
          )}

          <div className="space-y-0.5">
            {subacciones.map(sub => {
              const evCount = (evidenciasSubs[sub.id] || []).length;
              return (
                <div key={sub.id} className="flex items-center gap-1">
                  <div className="flex-1 min-w-0">
                    <SubaccionItem
                      sub={sub}
                      soloLectura={soloLectura}
                      onCambio={() => { cargarSubacciones(); onActualizado && onActualizado('subaccion'); }}
                      onAbrirDetalle={(s) => setSubaccionDetalle(s)}
                    />
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <BadgeUrgencia sub={sub} />
                    {evCount > 0 && (
                      <span className="flex items-center gap-0.5 text-[10px] text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded-full">
                        <Paperclip size={9}/> {evCount}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {mostrarFormSub && (
            <div className="mt-3 p-3 bg-white rounded-xl space-y-2 border border-gray-100 shadow-sm">
              <input type="text" placeholder="Nombre de la tarea *" value={nuevaSub.nombre}
                onChange={e => setNuevaSub(p => ({ ...p, nombre: e.target.value }))}
                className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 outline-none focus:border-guinda-400 focus:ring-1 focus:ring-guinda-100 bg-white" />
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-[10px] text-gray-400 font-medium mb-0.5 block">Inicio</label>
                  <input type="date" value={nuevaSub.fecha_inicio}
                    onChange={e => setNuevaSub(p => ({ ...p, fecha_inicio: e.target.value }))}
                    className="w-full text-xs px-2 py-1.5 rounded-lg border border-gray-200 outline-none focus:border-guinda-400 bg-white" />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] text-gray-400 font-medium mb-0.5 block">Fin</label>
                  <input type="date" value={nuevaSub.fecha_fin}
                    onChange={e => setNuevaSub(p => ({ ...p, fecha_fin: e.target.value }))}
                    className="w-full text-xs px-2 py-1.5 rounded-lg border border-gray-200 outline-none focus:border-guinda-400 bg-white" />
                </div>
              </div>
              {indicadoresSub.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Aporte a indicadores</p>
                  <div className="space-y-1.5">
                    {indicadoresSub.map(ind => (
                      <TarjetaIndicadorCascada
                        key={ind.id}
                        ind={ind}
                        asociado={nuevaSub.indicadores_asociados.find(ia => ia.id_indicador === ind.id)}
                        resumen={resumenesSub[ind.id]}
                        color={ind.id_etapa ? 'amber' : 'guinda'}
                        onToggle={() => toggleIndicadorSub(ind.id)}
                        onCambioModo={cambiarModoSub}
                        onCambioValor={actualizarAportacionSub}
                      />
                    ))}
                  </div>
                </div>
              )}
              <div className="flex gap-2 justify-end">
                <button onClick={() => { setMostrarFormSub(false); setNuevaSub({ nombre: '', fecha_inicio: '', fecha_fin: '', indicadores_asociados: [] }); }}
                  className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                  Cancelar
                </button>
                <button onClick={crearSubaccion} disabled={creandoSub || !nuevaSub.nombre.trim()}
                  className="text-xs bg-guinda-500 text-white px-4 py-1.5 rounded-lg hover:bg-guinda-600 disabled:opacity-40 font-semibold transition-colors">
                  {creandoSub ? 'Creando…' : 'Crear tarea'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Columna derecha: ARCHIVOS + DISCUSIÓN */}
        <div className="w-[300px] flex-shrink-0 flex flex-col">
          <div className="flex border-b border-gray-100 px-3">
            {[
              { clave: 'indicadores', label: 'Indicadores', icono: BarChart3, count: indicadoresAccion.length },
              { clave: 'archivos',  label: 'Archivos',  icono: Paperclip,     count: todasEvidencias.length },
              { clave: 'discusion', label: 'Discusión', icono: MessageSquare, count: null },
            ].map(tab => (
              <button key={tab.clave} onClick={() => setTabDerecha(tab.clave)}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold border-b-2 -mb-px transition-colors ${
                  tabDerecha === tab.clave
                    ? 'border-guinda-500 text-guinda-600'
                    : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}>
                <tab.icono size={11}/>
                {tab.label}
                {tab.count !== null && tab.count > 0 && (
                  <span className="text-[10px] font-bold bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full tabular-nums">{tab.count}</span>
                )}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-3 max-h-[400px]">
            {tabDerecha === 'indicadores' && (
              <div className="space-y-2">
                {indicadoresDisponibles.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <BarChart3 size={20} className="text-gray-200 mb-2" />
                    <p className="text-xs text-gray-300">Sin indicadores definidos en {accion.id_etapa ? 'la etapa' : 'el proyecto'}</p>
                  </div>
                ) : (
                  <>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                      Aporte de esta acción a indicadores {accion.id_etapa ? 'de la etapa' : 'del proyecto'}
                    </p>
                    {indicadoresDisponibles.map(ind => (
                      <TarjetaIndicadorCascada
                        key={ind.id}
                        ind={ind}
                        asociado={indicadoresAccion.find(ia => ia.id_indicador === ind.id)}
                        resumen={resumenesAccion[ind.id]}
                        color={ind.id_etapa ? 'amber' : 'guinda'}
                        onToggle={() => !soloLectura && toggleIndicadorAccion(ind.id)}
                        onCambioModo={!soloLectura ? cambiarModoAccion : () => {}}
                        onCambioValor={!soloLectura ? actualizarAportacionAccion : () => {}}
                      />
                    ))}
                    {!soloLectura && (
                      <button onClick={guardarIndicadoresAccion} disabled={guardandoInd}
                        className="w-full flex items-center justify-center gap-1.5 h-8 text-xs bg-guinda-500 text-white hover:bg-guinda-600 rounded-lg font-semibold transition-colors disabled:opacity-50 mt-2">
                        <Save size={11}/> {guardandoInd ? 'Guardando…' : 'Guardar indicadores'}
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
            {tabDerecha === 'archivos' && (
              <div className="space-y-3">
                {cargandoEv ? (
                  <p className="text-xs text-gray-400 py-6 text-center animate-pulse">Cargando…</p>
                ) : todasEvidencias.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Paperclip size={20} className="text-gray-200 mb-2" />
                    <p className="text-xs text-gray-300">Sin archivos adjuntos</p>
                  </div>
                ) : (
                  <>
                    {evidenciasAccion.length > 0 && (
                      <div>
                        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                          <Tag size={8}/> Esta acción
                        </p>
                        <div className="space-y-0.5">
                          {evidenciasAccion.map(ev => (
                            <FilaEvidencia key={ev.id} ev={ev} soloLectura={soloLectura} onEliminar={eliminarEvidencia} />
                          ))}
                        </div>
                      </div>
                    )}
                    {subacciones.map(s => {
                      const evs = evidenciasSubs[s.id] || [];
                      if (evs.length === 0) return null;
                      return (
                        <div key={s.id}>
                          <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1 flex items-center gap-1 truncate">
                            <Tag size={8} className="flex-shrink-0"/><span className="truncate">{s.nombre}</span>
                          </p>
                          <div className="space-y-0.5">
                            {evs.map(ev => <FilaEvidencia key={ev.id} ev={ev} soloLectura={true} onEliminar={null} />)}
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
                {!soloLectura && (
                  <div className="pt-2 border-t border-gray-100 space-y-1.5">
                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Adjuntar a esta acción</p>
                    <select value={categoriaEv} onChange={e => setCategoriaEv(e.target.value)}
                      className="w-full text-xs h-7 px-2 rounded-lg border border-gray-200 bg-white text-gray-600 outline-none focus:border-guinda-400">
                      {CATEGORIAS_EVIDENCIA.map(c => (
                        <option key={c.valor} value={c.valor}>{c.etiqueta}</option>
                      ))}
                    </select>
                    <input type="text" value={notasEv} onChange={e => setNotasEv(e.target.value)}
                      placeholder="Notas opcionales…"
                      className="w-full text-xs h-7 px-2 rounded-lg border border-gray-200 bg-white outline-none focus:border-guinda-400" />
                    <input type="file" ref={fileRef} onChange={subirArchivo} className="hidden" />
                    <button type="button" disabled={subiendo} onClick={() => fileRef.current?.click()}
                      className="w-full flex items-center justify-center gap-1.5 h-7 text-xs bg-guinda-500 text-white hover:bg-guinda-600 rounded-lg font-semibold transition-colors disabled:opacity-50">
                      <Upload size={11}/> {subiendo ? 'Subiendo…' : 'Subir archivo'}
                    </button>
                  </div>
                )}
              </div>
            )}
            {tabDerecha === 'discusion' && (
              <HiloConsolidado
                entidades={[
                  { tipo: 'Accion', id: accion.id, etiqueta: 'Esta acción' },
                  ...subacciones.map(s => ({ tipo: 'Subaccion', id: s.id, etiqueta: s.nombre }))
                ]}
              />
            )}
          </div>
        </div>
      </div>

      {/* Drawer de subacción encima */}
      {subaccionDetalle && (() => {
        const subFresca = subacciones.find(s => s.id === subaccionDetalle.id) || subaccionDetalle;
        return (
          <DrawerSubaccion
            key={subFresca.id}
            sub={subFresca}
            soloLectura={soloLectura}
            onCerrar={() => setSubaccionDetalle(null)}
            onCambio={() => { cargarSubacciones(); onActualizado && onActualizado('subaccion'); }}
          />
        );
      })()}
    </div>
  );
}
