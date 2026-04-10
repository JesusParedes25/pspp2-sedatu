/**
 * ARCHIVO: AccionItem.jsx
 * PROPÓSITO: Fila compacta de acción con expansión selectiva.
 *
 * MINI-CLASE: Lista compacta con expansión única
 * ─────────────────────────────────────────────────────────────────
 * Cada acción es una sola fila horizontal con:
 *   - Dot de estado (8px, color según estado)
 *   - Nombre + fechas (ellipsis si largo)
 *   - Mini barra de progreso (3px, ~80px)
 *   - Porcentaje con color del estado
 *   - Íconos de metadata (clip + badge subacciones)
 *   - Chevron que rota al expandir
 *
 * Solo una acción se expande a la vez — el padre (EtapaCard) controla
 * qué ID está expandido y pasa expandida=true/false a cada item.
 * Al expandir: subacciones como checklist con borde lateral izquierdo.
 * Acciones bloqueadas: banner de motivo SIEMPRE visible sin expandir.
 * Acciones completadas: opacidad ~0.55, nombre tachado.
 * ─────────────────────────────────────────────────────────────────
 */
import { useState, useRef } from 'react';
import { Lock, FileText, Upload, Download, Trash2, ChevronDown, Plus, Paperclip, MessageSquare } from 'lucide-react';
import HiloComentarios from '../comentarios/HiloComentarios';
import SubaccionItem from './SubaccionItem';
import DrawerSubaccion from './DrawerSubaccion';
import CATEGORIAS_EVIDENCIA from './categoriasEvidencia';
import * as accionesApi from '../../api/acciones';
import * as evidenciasApi from '../../api/evidencias';

// Colores del dot de estado
const DOT_COLORES = {
  Completada: 'bg-emerald-500',
  En_proceso: 'bg-orange-400',
  Bloqueada:  'bg-red-500',
  Cancelada:  'bg-gray-300',
  Pendiente:  'bg-gray-300',
};

// Colores de la mini barra de progreso
const BARRA_COLORES = {
  Completada: 'bg-emerald-400',
  En_proceso: 'bg-orange-400',
  Bloqueada:  'bg-red-400',
  Cancelada:  'bg-gray-200',
  Pendiente:  'bg-gray-300',
};

// Colores del texto de porcentaje
const PCT_COLORES = {
  Completada: 'text-emerald-600',
  En_proceso: 'text-orange-500',
  Bloqueada:  'text-red-500',
  Cancelada:  'text-gray-400',
  Pendiente:  'text-gray-400',
};

// Etiquetas para cambio de estado dentro del panel expandido
const ESTADOS = [
  { valor: 'Pendiente',  etiqueta: 'Pendiente' },
  { valor: 'En_proceso', etiqueta: 'En proceso' },
  { valor: 'Bloqueada',  etiqueta: 'Bloqueada' },
  { valor: 'Completada', etiqueta: 'Completada' },
  { valor: 'Cancelada',  etiqueta: 'Cancelada' },
];

export default function AccionItem({ accion, soloLectura, expandida, onToggleExpandir, onPorcentajeCambio, onActualizado }) {
  const [evidencias, setEvidencias] = useState([]);
  const [cargandoEvidencias, setCargandoEvidencias] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [notasEvidencia, setNotasEvidencia] = useState('');
  const [categoriaEvidencia, setCategoriaEvidencia] = useState('Otro');
  const [cambiandoEstado, setCambiandoEstado] = useState(false);
  const [subacciones, setSubacciones] = useState([]);
  const [mostrarFormSub, setMostrarFormSub] = useState(false);
  const [nuevaSub, setNuevaSub] = useState({ nombre: '', fecha_inicio: '', fecha_fin: '' });
  const [creandoSub, setCreandoSub] = useState(false);
  const [seccionActiva, setSeccionActiva] = useState('tareas');
  const [subaccionDetalle, setSubaccionDetalle] = useState(null);
  const fileInputRef = useRef(null);

  const esCompletada = accion.estado === 'Completada';
  const esBloqueada  = accion.estado === 'Bloqueada';
  const esCancelada  = accion.estado === 'Cancelada';
  const esHito       = accion.tipo === 'Hito';
  const tieneSubs    = parseInt(accion.total_subacciones) > 0 || subacciones.length > 0;
  const esEditable   = !soloLectura && !esCompletada && !esCancelada;
  const pct          = parseFloat(accion.porcentaje_avance || 0);
  const estaVencida  = !esCompletada && !esCancelada && accion.fecha_fin && new Date(accion.fecha_fin) < new Date();
  const totalEv      = parseInt(accion.total_evidencias) || 0;
  const totalSubs    = parseInt(accion.total_subacciones) || 0;

  const formatearFecha = (f) => f ? new Date(f).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }) : '';

  async function cargarEvidencias() {
    setCargandoEvidencias(true);
    try {
      const res = await evidenciasApi.obtenerEvidenciasAccion(accion.id);
      setEvidencias(res.datos || []);
    } catch { /* silenciar */ }
    finally { setCargandoEvidencias(false); }
  }

  async function cargarSubacciones() {
    try {
      const res = await accionesApi.obtenerSubacciones(accion.id);
      setSubacciones(res.datos || []);
    } catch { /* silenciar */ }
  }

  function handleToggle() {
    const abriendo = !expandida;
    onToggleExpandir(accion.id);
    if (abriendo) {
      cargarEvidencias();
      cargarSubacciones();
    }
  }

  async function cambiarEstado(nuevoEstado) {
    if (cambiandoEstado) return;
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

  async function subirArchivo(e) {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    setSubiendo(true);
    try {
      await evidenciasApi.subirEvidenciaAccion(accion.id, archivo, {
        categoria: categoriaEvidencia, notas: notasEvidencia,
      });
      setNotasEvidencia('');
      await cargarEvidencias();
      onActualizado && onActualizado();
    } catch (err) {
      alert(err.response?.data?.mensaje || 'Error al subir evidencia');
    } finally {
      setSubiendo(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function crearSubaccion() {
    if (!nuevaSub.nombre.trim() || !nuevaSub.fecha_inicio || !nuevaSub.fecha_fin) return;
    setCreandoSub(true);
    try {
      await accionesApi.crearSubaccion(accion.id, nuevaSub);
      setNuevaSub({ nombre: '', fecha_inicio: '', fecha_fin: '' });
      setMostrarFormSub(false);
      await cargarSubacciones();
      onActualizado && onActualizado();
    } catch (err) {
      alert(err.response?.data?.mensaje || 'Error al crear subacción');
    } finally { setCreandoSub(false); }
  }

  async function eliminarEvidencia(evId) {
    if (!confirm('¿Eliminar esta evidencia?')) return;
    try {
      await evidenciasApi.eliminarEvidencia(evId);
      await cargarEvidencias();
      onActualizado && onActualizado();
    } catch { /* silenciar */ }
  }

  // Subacciones completadas para el badge "X/Y"
  const subsCompletadas = subacciones.filter(s => s.estado === 'Completada').length;

  const dotColor  = DOT_COLORES[accion.estado]  || 'bg-gray-300';
  const barColor  = BARRA_COLORES[accion.estado] || 'bg-gray-300';
  const pctColor  = PCT_COLORES[accion.estado]   || 'text-gray-400';

  return (
    <div className={`transition-all duration-200 ${
      esCompletada ? 'opacity-55' : ''
    }`}>
      {/* ── Fila compacta ── */}
      <button
        onClick={handleToggle}
        className={`w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-colors duration-150 ${
          expandida
            ? 'bg-guinda-50/60 ring-1 ring-guinda-100'
            : 'hover:bg-gray-50/80'
        }`}
      >
        {/* Dot de estado */}
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`} />

        {/* Nombre + fechas */}
        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-1.5">
            {esHito && (
              <span className="text-[9px] font-bold text-purple-600 bg-purple-50 px-1 py-0.5 rounded flex-shrink-0">HITO</span>
            )}
            <span className={`text-[13px] font-medium truncate leading-tight ${
              esCompletada ? 'line-through text-gray-400' : esBloqueada ? 'text-red-700' : 'text-gray-800'
            }`}>
              {accion.nombre}
            </span>
          </div>
          {accion.fecha_inicio && (
            <p className={`text-[10px] mt-0.5 ${estaVencida ? 'text-orange-500 font-medium' : 'text-gray-400'}`}>
              {formatearFecha(accion.fecha_inicio)} → {formatearFecha(accion.fecha_fin)}
            </p>
          )}
        </div>

        {/* Mini barra de progreso */}
        <div className="flex-shrink-0 w-20 h-[3px] bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>

        {/* Porcentaje */}
        {tieneSubs ? (
          <span className={`text-[11px] font-semibold tabular-nums flex-shrink-0 w-10 text-right ${pctColor}`}>
            {pct.toFixed(0)}%
            <span className="text-[9px] font-normal text-gray-300 ml-0.5">auto</span>
          </span>
        ) : esEditable ? (
          <div className="flex items-center flex-shrink-0 w-12 justify-end" onClick={e => e.stopPropagation()}>
            <input
              type="number" min="0" max="100" value={pct}
              onChange={e => onPorcentajeCambio(accion.id, parseFloat(e.target.value) || 0)}
              className={`w-9 text-[11px] text-right font-semibold bg-transparent border-b border-dashed border-gray-300 focus:border-guinda-400 outline-none tabular-nums py-0 ${pctColor}`}
            />
            <span className="text-[10px] text-gray-300 ml-0.5">%</span>
          </div>
        ) : (
          <span className={`text-[11px] font-semibold tabular-nums flex-shrink-0 w-10 text-right ${pctColor}`}>
            {pct.toFixed(0)}%
          </span>
        )}

        {/* Íconos de metadata */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {totalEv > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] text-gray-400">
              <Paperclip size={10} />
              <span className="tabular-nums">{totalEv}</span>
            </span>
          )}
          {totalSubs > 0 && (
            <span className="text-[10px] text-gray-400 tabular-nums">
              {subsCompletadas}/{totalSubs}
            </span>
          )}
        </div>

        {/* Chevron */}
        <ChevronDown
          size={14}
          className={`text-gray-300 transition-transform duration-200 flex-shrink-0 ${expandida ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Banner de bloqueo — siempre visible sin necesidad de expandir */}
      {esBloqueada && accion.motivo_bloqueo && (
        <div className="mx-3 mb-1 flex items-center gap-2 px-3 py-1.5 bg-red-50 rounded-lg text-[11px] text-red-600 border border-red-100">
          <Lock size={11} className="flex-shrink-0" />
          <span className="truncate">{accion.motivo_bloqueo}</span>
        </div>
      )}

      {/* ═══ Panel expandible ═══ */}
      {expandida && (
        <div className="ml-4 pl-3 border-l-2 border-guinda-100 pb-3 mt-1">
          {/* Cambio de estado — pills compactos */}
          {!soloLectura && (
            <div className="flex items-center gap-1 pb-2.5 mb-2.5 border-b border-gray-100 flex-wrap">
              {ESTADOS.map(est => (
                <button
                  key={est.valor}
                  disabled={cambiandoEstado || accion.estado === est.valor}
                  onClick={() => cambiarEstado(est.valor)}
                  className={`px-2.5 py-1 text-[11px] rounded-lg transition-colors ${
                    accion.estado === est.valor
                      ? 'bg-guinda-500 text-white font-medium shadow-sm'
                      : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  {est.etiqueta}
                </button>
              ))}
            </div>
          )}

          {/* Tabs de secciones */}
          <div className="flex items-center gap-0.5 mb-2.5 border-b border-gray-100">
            {[
              { clave: 'tareas',   icono: Plus,          etiqueta: `Tareas (${subacciones.length})` },
              { clave: 'archivos', icono: Paperclip,     etiqueta: `Archivos (${evidencias.length})` },
              { clave: 'discusion',icono: MessageSquare, etiqueta: 'Discusión' },
            ].map(tab => (
              <button
                key={tab.clave}
                onClick={() => setSeccionActiva(tab.clave)}
                className={`flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium border-b-2 -mb-px transition-colors ${
                  seccionActiva === tab.clave
                    ? 'border-guinda-500 text-guinda-600'
                    : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}
              >
                <tab.icono size={12} />
                {tab.etiqueta}
              </button>
            ))}
          </div>

          {/* ── Tab: Tareas (subacciones) ── */}
          {seccionActiva === 'tareas' && (
            <div>
              {subacciones.length > 0 ? (
                <div className="space-y-0">
                  {subacciones.map(sub => (
                    <SubaccionItem
                      key={sub.id}
                      sub={sub}
                      soloLectura={soloLectura}
                      onCambio={() => { cargarSubacciones(); onActualizado && onActualizado('subaccion'); }}
                      onAbrirDetalle={(s) => setSubaccionDetalle(s)}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-300 py-2 text-center">Sin tareas registradas</p>
              )}
              {!soloLectura && !mostrarFormSub && (
                <button
                  onClick={() => setMostrarFormSub(true)}
                  className="flex items-center gap-1.5 mt-1.5 text-xs text-gray-400 hover:text-guinda-500 transition-colors py-1"
                >
                  <Plus size={12} /> Agregar tarea
                </button>
              )}
              {mostrarFormSub && (
                <div className="mt-2 p-3 bg-gray-50 rounded-lg space-y-2">
                  <input
                    type="text"
                    placeholder="Nombre de la tarea"
                    value={nuevaSub.nombre}
                    onChange={e => setNuevaSub(p => ({ ...p, nombre: e.target.value }))}
                    className="w-full text-sm px-3 py-1.5 rounded-lg border border-gray-200 outline-none focus:border-guinda-400 focus:ring-1 focus:ring-guinda-100"
                  />
                  <div className="flex gap-2">
                    <input
                      type="date"
                      value={nuevaSub.fecha_inicio}
                      onChange={e => setNuevaSub(p => ({ ...p, fecha_inicio: e.target.value }))}
                      className="text-xs px-2 py-1.5 rounded-lg border border-gray-200 flex-1 outline-none focus:border-guinda-400"
                    />
                    <input
                      type="date"
                      value={nuevaSub.fecha_fin}
                      onChange={e => setNuevaSub(p => ({ ...p, fecha_fin: e.target.value }))}
                      className="text-xs px-2 py-1.5 rounded-lg border border-gray-200 flex-1 outline-none focus:border-guinda-400"
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => setMostrarFormSub(false)}
                      className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={crearSubaccion}
                      disabled={creandoSub}
                      className="text-xs bg-guinda-500 text-white px-3 py-1.5 rounded-lg hover:bg-guinda-600 disabled:opacity-50 font-medium"
                    >
                      {creandoSub ? 'Creando…' : 'Crear'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Tab: Archivos (evidencias) ── */}
          {seccionActiva === 'archivos' && (
            <div>
              {cargandoEvidencias ? (
                <p className="text-xs text-gray-400 py-2 text-center animate-pulse">Cargando…</p>
              ) : evidencias.length > 0 ? (
                <div className="space-y-1">
                  {evidencias.map(ev => (
                    <div
                      key={ev.id}
                      className="group/file flex items-center gap-2 text-[12px] py-1.5 px-2 -mx-1 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <FileText size={13} className="text-gray-300 flex-shrink-0" />
                      <span className="flex-1 truncate text-gray-700">{ev.nombre_original}</span>
                      <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded flex-shrink-0">{ev.categoria}</span>
                      <a
                        href={evidenciasApi.obtenerUrlDescarga(ev.id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-guinda-400 hover:text-guinda-600 p-1 flex-shrink-0"
                        title="Descargar"
                      >
                        <Download size={12} />
                      </a>
                      {!soloLectura && (
                        <button
                          onClick={() => eliminarEvidencia(ev.id)}
                          className="text-gray-300 hover:text-red-500 p-1 flex-shrink-0 opacity-0 group-hover/file:opacity-100 transition-opacity"
                          title="Eliminar"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-300 py-2 text-center">Sin archivos adjuntos</p>
              )}

              {/* Subida */}
              {!soloLectura && (
                <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                  <select
                    value={categoriaEvidencia}
                    onChange={e => setCategoriaEvidencia(e.target.value)}
                    className="text-xs h-7 px-2 pr-6 rounded-lg border border-gray-200 bg-white text-gray-600 outline-none focus:border-guinda-400"
                  >
                    {CATEGORIAS_EVIDENCIA.map(c => (
                      <option key={c.valor} value={c.valor}>{c.etiqueta}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={notasEvidencia}
                    onChange={e => setNotasEvidencia(e.target.value)}
                    placeholder="Notas (opcional)"
                    className="text-xs h-7 px-3 rounded-lg border border-gray-200 bg-white outline-none focus:border-guinda-400 flex-1 min-w-[80px]"
                  />
                  <input type="file" ref={fileInputRef} onChange={subirArchivo} className="hidden" />
                  <button
                    type="button"
                    disabled={subiendo}
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1 h-7 px-3 text-xs bg-guinda-500 text-white hover:bg-guinda-600 rounded-lg font-medium transition-colors disabled:opacity-50"
                  >
                    <Upload size={11} />
                    {subiendo ? 'Subiendo…' : 'Subir'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Tab: Discusión ── */}
          {seccionActiva === 'discusion' && (
            <HiloComentarios entidadTipo="Accion" entidadId={accion.id} compacto />
          )}
        </div>
      )}

      {/* Drawer lateral de subacción */}
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
