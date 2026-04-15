/**
 * ARCHIVO: EtapaCard.jsx
 * PROPÓSITO: Card expandible para una etapa con acciones, comentarios
 *            y riesgos. Diseño moderno con barra de progreso visual.
 *
 * MINI-CLASE: Etapa como contenedor visual
 * ─────────────────────────────────────────────────────────────────
 * El header muestra orden + nombre + barra de progreso + conteo.
 * Al expandir: metadata → riesgos → acciones → comentarios.
 * Las acciones se cargan con useAcciones() y se pueden ordenar
 * por criterio (orden, inicio, entrega, avance). Recarga silenciosa
 * para cambios de subacciones (no desmonta hijos).
 * ─────────────────────────────────────────────────────────────────
 */
import { useState, useEffect, useMemo } from 'react';
import { ChevronDown, Plus, AlertTriangle, Shield, Trash2, ListOrdered, CalendarClock, Flag, BarChart3, Pencil, SlidersHorizontal } from 'lucide-react';
import PanelAccionInline from './PanelAccionInline';
import HiloComentarios from '../comentarios/HiloComentarios';
import RiesgoCard from '../riesgos/RiesgoCard';
import ModalEditarEtapa from './ModalEditarEtapa';
import { useAcciones } from '../../hooks/useAcciones';
import * as riesgosApi from '../../api/riesgos';
import * as etapasApi from '../../api/etapas';

const ESTADO_CONFIG_FICHA = {
  Completada: { text: 'text-emerald-600', dot: 'bg-emerald-400' },
  En_proceso: { text: 'text-orange-500',  dot: 'bg-orange-400'  },
  Pendiente:  { text: 'text-gray-400',    dot: 'bg-gray-300'    },
  Bloqueada:  { text: 'text-red-600',     dot: 'bg-red-400'     },
  Cancelada:  { text: 'text-gray-300',    dot: 'bg-gray-200'    },
};

const CRITERIOS_ORDEN = [
  { clave: 'orden',   icono: ListOrdered,   etiqueta: 'Orden de subida' },
  { clave: 'inicio',  icono: CalendarClock, etiqueta: 'Inicio' },
  { clave: 'entrega', icono: Flag,          etiqueta: 'Entrega' },
  { clave: 'avance',  icono: BarChart3,     etiqueta: 'Avance' },
];

export default function EtapaCard({ etapa, proyecto, etapas = [], soloLectura = false, onAccionCreada, onEtapaActualizada }) {
  const [expandida, setExpandida] = useState(false);
  const [mostrarRiesgos, setMostrarRiesgos] = useState(false);
  const [riesgos, setRiesgos] = useState([]);
  const [ordenActivo, setOrdenActivo] = useState('orden');
  const [mostrarOrden, setMostrarOrden] = useState(false);
  const [modalEdicion, setModalEdicion] = useState(false);
  const [accionExpandida, setAccionExpandida] = useState(null);
  const { acciones, cargando, recargar, recargarSilencioso } = useAcciones(
    expandida ? etapa.id : null
  );

  const pctEtapa = parseFloat(etapa.porcentaje_calculado || 0);
  const completadas = parseInt(etapa.acciones_completadas || 0);
  const totalAcc = parseInt(etapa.total_acciones || 0);

  const accionesOrdenadas = useMemo(() => {
    if (!acciones || acciones.length === 0) return acciones;
    const copia = [...acciones];
    switch (ordenActivo) {
      case 'orden':
        return copia.sort((a, b) => new Date(a.created_at || '9999') - new Date(b.created_at || '9999'));
      case 'inicio':
        return copia.sort((a, b) => new Date(a.fecha_inicio || '9999') - new Date(b.fecha_inicio || '9999'));
      case 'entrega':
        return copia.sort((a, b) => new Date(a.fecha_fin || '9999') - new Date(b.fecha_fin || '9999'));
      case 'avance':
        return copia.sort((a, b) => parseFloat(b.porcentaje_avance || 0) - parseFloat(a.porcentaje_avance || 0));
      default:
        return copia;
    }
  }, [acciones, ordenActivo]);

  useEffect(() => {
    if (!expandida || !etapa.id) return;
    riesgosApi.obtenerRiesgosEtapa(etapa.id)
      .then(res => setRiesgos(res.datos || []))
      .catch(() => {});
  }, [expandida, etapa.id]);

  const periodo = etapa.fecha_inicio && etapa.fecha_fin
    ? `${new Date(etapa.fecha_inicio).toLocaleDateString('es-MX', { month: 'short', year: 'numeric' })} — ${new Date(etapa.fecha_fin).toLocaleDateString('es-MX', { month: 'short', year: 'numeric' })}`
    : null;

  return (
    <div className={`rounded-2xl transition-all duration-200 ${
      expandida
        ? 'bg-white shadow-lg ring-1 ring-gray-200/60'
        : 'bg-white shadow-sm ring-1 ring-gray-100 hover:shadow-md hover:ring-gray-200/80'
    }`}>
      {/* ── Header ── */}
      <button onClick={() => setExpandida(!expandida)}
        className="w-full text-left p-4 pb-3 group">
        <div className="flex items-center gap-3">
          {/* Número de etapa */}
          <span className="w-7 h-7 bg-guinda-500 text-white rounded-lg text-xs font-bold flex items-center justify-center flex-shrink-0 shadow-sm">
            {etapa.orden}
          </span>

          {/* Nombre + metadata */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-800 truncate">{etapa.nombre}</span>
              {riesgos.length > 0 && (
                <span className="flex items-center gap-0.5 text-[10px] text-orange-500 bg-orange-50 px-1.5 py-0.5 rounded-full font-medium flex-shrink-0">
                  <Shield size={10} /> {riesgos.length}
                </span>
              )}
            </div>
            {(periodo || etapa.responsable_nombre) && (
              <div className="flex items-center gap-2 mt-0.5 text-[11px] text-gray-400">
                {etapa.dg_siglas && <span className="text-guinda-400 font-medium">{etapa.dg_siglas}</span>}
                {etapa.responsable_nombre && <span>{etapa.responsable_nombre}</span>}
                {periodo && <span className="hidden md:inline">· {periodo}</span>}
              </div>
            )}
          </div>

          {/* Progreso + conteo */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="text-right hidden sm:block">
              <span className="text-lg font-bold tabular-nums text-gray-700">{pctEtapa.toFixed(0)}%</span>
              <p className="text-[10px] text-gray-400 -mt-0.5">{completadas}/{totalAcc} acciones</p>
            </div>
            <ChevronDown size={18} className={`text-gray-300 transition-transform duration-200 ${expandida ? 'rotate-180' : ''}`} />
          </div>
        </div>

        {/* Barra de progreso — siempre visible */}
        <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-700 ${
            pctEtapa >= 100 ? 'bg-emerald-400' : pctEtapa > 0 ? 'bg-guinda-400' : 'bg-gray-200'
          }`} style={{ width: `${Math.min(pctEtapa, 100)}%` }} />
        </div>
      </button>

      {/* ── Cuerpo expandible ── */}
      {expandida && (
        <div className="px-4 pb-4">
          {/* Metadata compacta */}
          {(etapa.descripcion || etapa.depende_de_nombre) && (
            <div className="mb-3 text-xs text-gray-500 space-y-1">
              {etapa.descripcion && <p>{etapa.descripcion}</p>}
              {etapa.depende_de_nombre && (
                <p className="text-orange-500">Depende de: {etapa.depende_de_nombre}</p>
              )}
            </div>
          )}

          {/* Alertas */}
          {etapa.estado === 'Bloqueada' && (
            <div className="mb-3 flex items-center gap-2 px-3 py-2 bg-yellow-50 rounded-lg text-xs text-yellow-700">
              <AlertTriangle size={14} className="flex-shrink-0" />
              Etapa bloqueada
            </div>
          )}
          {etapa.tipo_meta === 'Cuantitativa' && etapa.meta_valor && (
            <div className="mb-3 px-3 py-2 bg-blue-50 rounded-lg text-xs text-blue-600">
              Meta: {etapa.meta_valor} {etapa.meta_unidad}
            </div>
          )}

          {/* Riesgos */}
          {riesgos.length > 0 && (
            <div className="mb-3">
              <button onClick={() => setMostrarRiesgos(!mostrarRiesgos)}
                className="flex items-center gap-2 text-xs font-medium text-orange-500 hover:text-orange-600 transition-colors">
                <Shield size={13} />
                {riesgos.length} riesgo(s)
                <ChevronDown size={12} className={`transition-transform ${mostrarRiesgos ? 'rotate-180' : ''}`} />
              </button>
              {mostrarRiesgos && (
                <div className="mt-2 space-y-2">
                  {riesgos.map(r => <RiesgoCard key={r.id} riesgo={r} compacto />)}
                </div>
              )}
            </div>
          )}

          {/* Toolbar: ordenar + editar + eliminar */}
          <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-100">
            {/* Toggle ordenar */}
            {acciones.length > 1 ? (
              <div className="flex items-center gap-1 flex-wrap">
                <button
                  onClick={() => setMostrarOrden(v => !v)}
                  className={`flex items-center gap-1 px-2 py-1 text-[11px] rounded-lg transition-colors ${
                    mostrarOrden ? 'bg-guinda-50 text-guinda-600 font-medium' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                  }`}>
                  <SlidersHorizontal size={11} />
                  Ordenar por
                </button>
                {mostrarOrden && CRITERIOS_ORDEN.map(c => {
                  const Icono = c.icono;
                  const activo = ordenActivo === c.clave;
                  return (
                    <button key={c.clave} onClick={() => setOrdenActivo(c.clave)}
                      className={`flex items-center gap-1 px-2 py-1 text-[11px] rounded-lg transition-colors ${
                        activo
                          ? 'bg-guinda-100 text-guinda-700 font-medium'
                          : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                      }`}>
                      <Icono size={11} />
                      {c.etiqueta}
                    </button>
                  );
                })}
              </div>
            ) : <div />}

            {/* Acciones de edición */}
            {!soloLectura && (
              <div className="flex items-center gap-0.5">
                <button
                  onClick={() => setModalEdicion(true)}
                  className="text-gray-300 hover:text-guinda-500 transition-colors p-1"
                  title="Editar etapa / subproyecto">
                  <Pencil size={14} />
                </button>
                <button
                  onClick={async () => {
                    if (!confirm(`¿Eliminar la etapa "${etapa.nombre}" y todas sus acciones?`)) return;
                    try {
                      await etapasApi.eliminarEtapa(etapa.id);
                      onEtapaActualizada && onEtapaActualizada();
                    } catch (err) {
                      alert(err.response?.data?.mensaje || 'Error al eliminar etapa / subproyecto');
                    }
                  }}
                  className="text-gray-300 hover:text-red-500 transition-colors p-1"
                  title="Eliminar etapa / subproyecto">
                  <Trash2 size={14} />
                </button>
              </div>
            )}
          </div>

          {/* Lista de acciones expandibles inline */}
          {cargando ? (
            <p className="text-xs text-gray-400 text-center py-6 animate-pulse">Cargando acciones…</p>
          ) : acciones.length === 0 ? (
            <p className="text-xs text-gray-300 text-center py-6">Sin acciones registradas</p>
          ) : (
            <div className="space-y-0 mb-2 rounded-xl overflow-hidden border border-gray-100">
              {accionesOrdenadas.map((accion, idx) => {
                const cfg = ESTADO_CONFIG_FICHA[accion.estado] || ESTADO_CONFIG_FICHA.Pendiente;
                const pct = parseFloat(accion.porcentaje_avance || 0);
                const abierta = accionExpandida === accion.id;
                const ahora = new Date();
                const vencida = accion.fecha_fin && new Date(accion.fecha_fin) < ahora
                  && !['Completada','Cancelada'].includes(accion.estado);
                return (
                  <div key={accion.id} className={`border-b border-gray-100 last:border-0 ${
                    abierta ? 'bg-white' : 'bg-white hover:bg-gray-50/60'
                  }`}>
                    {/* Fila de la acción */}
                    <button
                      onClick={() => setAccionExpandida(abierta ? null : accion.id)}
                      className="w-full text-left px-4 py-3 flex items-center gap-3 transition-colors"
                    >
                      {/* Número */}
                      <span className={`text-[11px] font-black tabular-nums w-5 text-right flex-shrink-0 ${cfg.text}`}>
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      {/* Dot de estado */}
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
                      {/* Nombre */}
                      <span className={`flex-1 text-sm font-medium truncate min-w-0 ${
                        accion.estado === 'Bloqueada' ? 'text-red-700'
                        : accion.estado === 'Completada' ? 'text-gray-500'
                        : 'text-gray-800'
                      }`}>
                        {accion.tipo === 'Hito' && (
                          <span className="mr-1.5 text-[9px] font-bold text-purple-600 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded-full align-middle">HITO</span>
                        )}
                        {accion.nombre}
                      </span>
                      {/* Badges de alertas */}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {vencida && (
                          <span className="text-[10px] font-bold text-red-500 bg-red-50 px-1.5 py-0.5 rounded-full border border-red-100">Vencida</span>
                        )}
                        {accion.estado === 'Bloqueada' && (
                          <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full border border-red-100">Bloq.</span>
                        )}
                        {/* Dots de subacciones */}
                        {parseInt(accion.total_subacciones || 0) > 0 && (
                          <span className="text-[10px] text-gray-400 tabular-nums">
                            {accion.total_subacciones} tar.
                          </span>
                        )}
                        {/* Porcentaje */}
                        <span className={`text-[11px] font-black tabular-nums w-9 text-right ${cfg.text}`}>
                          {pct.toFixed(0)}%
                        </span>
                        {/* Fecha fin */}
                        {accion.fecha_fin && (
                          <span className={`text-[10px] tabular-nums w-16 text-right ${
                            vencida ? 'text-red-400 font-semibold' : 'text-gray-300'
                          }`}>
                            {new Date(accion.fecha_fin).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
                          </span>
                        )}
                        {/* Chevron */}
                        <ChevronDown size={13} className={`text-gray-300 transition-transform flex-shrink-0 ${
                          abierta ? 'rotate-180' : ''
                        }`} />
                      </div>
                    </button>
                    {/* Panel expandido inline */}
                    {abierta && (
                      <PanelAccionInline
                        accion={accion}
                        soloLectura={soloLectura}
                        onActualizado={(origen) => {
                          if (origen === 'subaccion') {
                            recargarSilencioso();
                            onEtapaActualizada && onEtapaActualizada();
                          } else {
                            recargar();
                            onEtapaActualizada && onEtapaActualizada();
                          }
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Agregar acción */}
          {!soloLectura && (
            <button onClick={() => onAccionCreada && onAccionCreada(etapa.id)}
              className="flex items-center gap-2 w-full px-3 py-2.5 mt-1 text-xs text-gray-400 hover:text-guinda-500 hover:bg-guinda-50/50 rounded-xl transition-colors">
              <Plus size={14} />
              Agregar acción
            </button>
          )}

          {/* Comentarios de etapa */}
          <div className="mt-4 pt-3 border-t border-gray-100">
            <HiloComentarios entidadTipo="Etapa" entidadId={etapa.id} compacto />
          </div>
        </div>
      )}

      {/* Modal de edición */}
      {modalEdicion && (
        <ModalEditarEtapa
          etapa={etapa}
          proyecto={proyecto}
          etapas={etapas}
          onCerrar={() => setModalEdicion(false)}
          onGuardar={async (etapaId, datosActualizados) => {
            await etapasApi.actualizarEtapa(etapaId, datosActualizados);
            setModalEdicion(false);
            onEtapaActualizada && onEtapaActualizada();
          }}
        />
      )}

    </div>
  );
}
