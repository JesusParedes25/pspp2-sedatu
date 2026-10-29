/**
 * ARCHIVO: IndicadoresProyecto.jsx
 * PROPÓSITO: Ruta /proyectos/:id/indicadores — sección propia de
 *            Indicadores dentro de un proyecto, al mismo nivel que
 *            Seguimiento/Resumen/Riesgos/Documentos/Bitácora/
 *            Configuración. Antes los indicadores del proyecto no
 *            tenían un lugar propio para administrarse: solo se
 *            mencionaban de pasada en la línea de cifras de la tarjeta
 *            de Resumen, y vincular/editar uno exigía entrar a "Editar
 *            proyecto" (un formulario pensado para los datos generales
 *            del proyecto, no para esto) o al detalle de cada indicador
 *            por separado.
 *
 * Esta pantalla NO reinventa ninguna pieza: reusa ModalVincularIndicador
 * (vincular uno nuevo o agregarle un nodo), ModalRegistrarMovimiento
 * (capturar avance) y ChipAportacion (listar/editar/quitar los nodos que
 * aportan, el mismo componente que ya usa la ficha de un indicador) —
 * ver DetalleIndicador.jsx, que resuelve exactamente lo mismo a nivel de
 * UN indicador. Aquí se administran TODOS los del proyecto en una sola
 * lista, con el detalle de nodos colapsado por renglón.
 *
 * MINI-CLASE: tres vistas de indicadores, tres alcances distintos
 * ─────────────────────────────────────────────────────────────────
 * "Mis indicadores" (menú lateral, Indicadores.jsx): todos los
 * indicadores de todos los proyectos donde participa el usuario — para
 * ver el conjunto completo, no para administrar uno en particular. Esta
 * pantalla (pestaña Indicadores de un proyecto): los indicadores de
 * ESTE proyecto, y el lugar donde se administran (vincular, definir
 * meta, capturar avance, agregar/quitar nodos, desvincular). La
 * pestaña Indicadores de una etapa/acción/tarea dentro de Seguimiento
 * (SeccionAportaciones.jsx): solo lo que ESE nodo en particular aporta,
 * sin el resto del proyecto. El texto de cada pantalla nombra a las
 * otras dos, para que el usuario sepa a cuál entrar según lo que busca.
 * ─────────────────────────────────────────────────────────────────
 *
 * Permisos: el backend ya decide quién puede mutar algo (ver cada
 * llamada en api/indicadores.js — todas pasan por middleware de
 * autorización existente, nada nuevo en este archivo); aquí solo se
 * ocultan los controles para quien tiene acceso de solo lectura,
 * mismo criterio que RiesgosProyecto.jsx.
 */
import { useState, useEffect, useCallback } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import {
  BarChart3, Plus, ChevronDown, ChevronRight, Loader2, Link2, Pencil, Trash2, Target,
} from 'lucide-react';
import * as indicadoresApi from '../../api/indicadores';
import { useUI } from '../../context/UIContext';
import ModalVincularIndicador from '../../components/indicadores/ModalVincularIndicador';
import ModalRegistrarMovimiento from '../../components/indicadores/ModalRegistrarMovimiento';
import ChipAportacion from '../../components/indicadores/ChipAportacion';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import { etiquetaOrigenIndicador } from '../../utils/tiposIndicador';
import { etiquetaUnidad } from '../../components/indicadores/SelectorIndicadorCatalogo';
import { formatearMoneda } from '../../utils/formatoMoneda';
import { formatoCorto } from '../../components/indicadores/TarjetaIndicador';
import { formatFecha } from '../../utils/fecha';

export default function IndicadoresProyecto() {
  const { proyecto, proyectoId, permisos, incrementarStats } = useOutletContext();
  const { mostrarToast } = useUI();
  const [searchParams, setSearchParams] = useSearchParams();
  const [indicadores, setIndicadores] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [expandido, setExpandido] = useState(null);
  const [nodosPorIndicador, setNodosPorIndicador] = useState({});
  const [cargandoNodosDe, setCargandoNodosDe] = useState(null);
  // null (cerrado) | {} (vincular uno nuevo) | { indicador } (agregar nodo a uno existente)
  const [modalVincular, setModalVincular] = useState(null);
  const [registrarMovimientoPara, setRegistrarMovimientoPara] = useState(null);
  const [desvincularPara, setDesvincularPara] = useState(null); // { indicador, mensaje }
  const [editandoMetaDe, setEditandoMetaDe] = useState(null);
  const [valorMeta, setValorMeta] = useState('');
  const [guardandoMeta, setGuardandoMeta] = useState(false);

  const soloLectura = !!permisos?.esSoloLectura;

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const datos = await indicadoresApi.listarTodosPorProyecto(proyectoId);
      setIndicadores(datos || []);
    } catch {
      setIndicadores([]);
    } finally {
      setCargando(false);
    }
  }, [proyectoId]);

  useEffect(() => { cargar(); }, [cargar]);

  // Atajo "Vincular indicador" de la tarjeta de Portada (?vincular=1):
  // abre el modal de alta directo al llegar, mismo criterio que
  // RiesgosProyecto con ?nuevo=1.
  useEffect(() => {
    if (searchParams.get('vincular') === '1') {
      setModalVincular({});
      setSearchParams(prev => { const p = new URLSearchParams(prev); p.delete('vincular'); return p; }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function cargarNodos(indicadorId) {
    setCargandoNodosDe(indicadorId);
    try {
      const datos = await indicadoresApi.obtenerAportacionesIndicador(indicadorId);
      setNodosPorIndicador(prev => ({ ...prev, [indicadorId]: datos }));
    } catch {
      setNodosPorIndicador(prev => ({ ...prev, [indicadorId]: [] }));
    } finally {
      setCargandoNodosDe(null);
    }
  }

  function toggleExpandir(ind) {
    const abrir = expandido !== ind.id;
    setExpandido(abrir ? ind.id : null);
    if (abrir && !nodosPorIndicador[ind.id]) cargarNodos(ind.id);
  }

  function refrescarNodosDe(indicadorId) {
    cargar();
    cargarNodos(indicadorId);
    incrementarStats?.();
  }

  async function iniciarDesvincular(ind) {
    try {
      const check = await indicadoresApi.eliminarIndicadorConConfirm(ind.id, false);
      if (check.requiere_confirmacion) {
        setDesvincularPara({ indicador: ind, mensaje: check.mensaje });
      } else {
        await indicadoresApi.eliminarIndicadorConConfirm(ind.id, true);
        mostrarToast('Indicador desvinculado del proyecto', 'exito');
        cargar();
        incrementarStats?.();
      }
    } catch (err) {
      mostrarToast(err.response?.data?.mensaje || 'No se pudo desvincular el indicador', 'error');
    }
  }

  async function confirmarDesvincular() {
    const ind = desvincularPara?.indicador;
    if (!ind) return;
    try {
      await indicadoresApi.eliminarIndicadorConConfirm(ind.id, true);
      mostrarToast('Indicador desvinculado del proyecto', 'exito');
      setDesvincularPara(null);
      cargar();
      incrementarStats?.();
    } catch (err) {
      mostrarToast(err.response?.data?.mensaje || 'No se pudo desvincular el indicador', 'error');
      setDesvincularPara(null);
    }
  }

  function iniciarEditarMeta(ind) {
    setEditandoMetaDe(ind.id);
    setValorMeta(ind.meta_global ?? '');
  }

  // PUT /indicadores/:id sobrescribe la fila completa (no es un PATCH
  // parcial) — hay que mandar el indicador entero con solo meta_global
  // cambiado, nunca solo {meta_global}, o nombre/tipo/unidad se
  // perderían en silencio (ver indicadores.queries.js::actualizar).
  async function guardarMeta(ind) {
    setGuardandoMeta(true);
    try {
      await indicadoresApi.actualizarIndicador(ind.id, {
        ...ind,
        meta_global: valorMeta === '' ? null : parseFloat(valorMeta),
      });
      mostrarToast('Meta actualizada', 'exito');
      setEditandoMetaDe(null);
      cargar();
    } catch (err) {
      mostrarToast(err.response?.data?.mensaje || 'No se pudo actualizar la meta', 'error');
    } finally {
      setGuardandoMeta(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-xs text-gray-500 max-w-2xl leading-relaxed">
          Los indicadores que mide este proyecto: aquí se vinculan, se les define una meta y
          se registra su avance. Para verlos junto con los de tus otros proyectos usa{' '}
          <span className="font-medium text-gray-600">Mis indicadores</span> en el menú; para ver
          solo lo que aporta una etapa, acción o tarea en particular, entra a su pestaña
          Indicadores dentro de Seguimiento.
        </p>
        {!soloLectura && indicadores.length > 0 && (
          <button
            onClick={() => setModalVincular({})}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium bg-guinda-700 text-white hover:bg-guinda-600 transition-colors flex-shrink-0"
          >
            <Plus size={15} /> Vincular indicador
          </button>
        )}
      </div>

      {cargando ? (
        <div className="flex items-center justify-center py-16 gap-2 text-gray-400">
          <Loader2 size={18} className="animate-spin" />
          <span className="text-sm">Cargando indicadores…</span>
        </div>
      ) : indicadores.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-2">
          <BarChart3 size={36} className="opacity-30" />
          <p className="text-sm text-center max-w-sm">
            Este proyecto todavía no mide ningún indicador. Un indicador te permite reportar una
            cifra de resultado (personas atendidas, viviendas mejoradas, trámites resueltos...) y
            seguir su avance en el tiempo.
          </p>
          {!soloLectura && (
            <button
              onClick={() => setModalVincular({})}
              className="mt-2 flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium bg-guinda-700 text-white hover:bg-guinda-600 transition-colors"
            >
              <Plus size={15} /> Vincular el primero
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2.5">
          {indicadores.map(ind => (
            <FilaIndicador
              key={ind.id}
              indicador={ind}
              proyectoId={proyectoId}
              abierto={expandido === ind.id}
              onToggle={() => toggleExpandir(ind)}
              nodos={nodosPorIndicador[ind.id]}
              cargandoNodos={cargandoNodosDe === ind.id}
              soloLectura={soloLectura}
              mostrarToast={mostrarToast}
              onNodosActualizados={() => refrescarNodosDe(ind.id)}
              onAgregarNodo={() => setModalVincular({ indicador: ind })}
              onRegistrarMovimiento={() => setRegistrarMovimientoPara(ind)}
              onDesvincular={() => iniciarDesvincular(ind)}
              editandoMeta={editandoMetaDe === ind.id}
              valorMeta={valorMeta}
              onCambiarValorMeta={setValorMeta}
              onIniciarEditarMeta={() => iniciarEditarMeta(ind)}
              onCancelarEditarMeta={() => setEditandoMetaDe(null)}
              onGuardarMeta={() => guardarMeta(ind)}
              guardandoMeta={guardandoMeta}
            />
          ))}
        </div>
      )}

      {modalVincular && (
        <ModalVincularIndicador
          proyectoPreseleccionado={{ id: proyectoId, nombre: proyecto.nombre }}
          indicadorPreseleccionado={modalVincular.indicador || null}
          onCerrar={() => setModalVincular(null)}
          onVinculado={() => {
            setModalVincular(null);
            cargar();
            if (modalVincular.indicador) cargarNodos(modalVincular.indicador.id);
            incrementarStats?.();
          }}
        />
      )}

      {registrarMovimientoPara && (
        <ModalRegistrarMovimiento
          indicadorId={registrarMovimientoPara.id}
          indicadorNombre={registrarMovimientoPara.nombre}
          idNodoOrigen={null}
          onCerrar={() => setRegistrarMovimientoPara(null)}
          onRegistrado={() => {
            setRegistrarMovimientoPara(null);
            mostrarToast('Movimiento registrado', 'exito');
            cargar();
            incrementarStats?.();
          }}
        />
      )}

      <ConfirmDialog
        abierto={!!desvincularPara}
        titulo="Desvincular indicador"
        mensaje={desvincularPara ? `${desvincularPara.mensaje} Esta acción no se puede deshacer.` : ''}
        textoConfirmar="Desvincular"
        onConfirmar={confirmarDesvincular}
        onCancelar={() => setDesvincularPara(null)}
      />
    </div>
  );
}

function valorFormateado(valor, esMoneda) {
  const n = parseFloat(valor) || 0;
  return esMoneda ? formatearMoneda(n) : formatoCorto(n);
}

function FilaIndicador({
  indicador: ind, proyectoId, abierto, onToggle, nodos, cargandoNodos, soloLectura, mostrarToast,
  onNodosActualizados, onAgregarNodo, onRegistrarMovimiento, onDesvincular,
  editandoMeta, valorMeta, onCambiarValorMeta, onIniciarEditarMeta, onCancelarEditarMeta, onGuardarMeta, guardandoMeta,
}) {
  const esMoneda = ind.unidad === 'Moneda_MXN';
  const meta = parseFloat(ind.meta_global) || 0;
  const valor = parseFloat(ind.valor_actual) || 0;
  const tieneMeta = meta > 0;
  const pct = tieneMeta ? Math.round((valor / meta) * 100) : null;
  const origen = etiquetaOrigenIndicador(ind);
  const esPorCategorias = ind.composicion === 'Categorias';

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900 truncate">{ind.nombre}</p>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
              origen.institucional ? 'bg-sky-50 text-sky-700' : 'bg-gray-100 text-gray-600'
            }`}>
              {origen.texto}
            </span>
            <span className="text-[10px] text-gray-400">{etiquetaUnidad(ind) || ind.unidad}</span>
          </div>
        </div>
        <div className="flex items-center gap-4 flex-shrink-0 text-right">
          <div className="hidden sm:block">
            <p className="text-sm font-semibold tabular-nums text-gray-800">
              {valorFormateado(valor, esMoneda)}
              {tieneMeta && <span className="text-xs font-normal text-gray-400"> / {valorFormateado(meta, esMoneda)}</span>}
            </p>
            <p className="text-[10px] text-gray-400">
              {tieneMeta ? `${pct}% de avance` : 'Sin meta definida'}
            </p>
          </div>
          <div className="hidden md:block text-[11px] text-gray-400 w-28">
            {ind.fecha_corte ? `Último: ${formatFecha(ind.fecha_corte)}` : 'Sin movimientos'}
          </div>
          <div className="text-[11px] text-gray-400 w-20">
            {ind.num_nodos || 0} nodo{ind.num_nodos !== 1 ? 's' : ''}
          </div>
          {abierto ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
        </div>
      </button>

      {abierto && (
        <div className="px-4 pb-4 pt-1 border-t border-gray-100 space-y-3">
          <div className="flex items-center gap-4 flex-wrap text-xs">
            {editandoMeta ? (
              <div className="flex items-center gap-1.5">
                <span className="text-gray-500">Meta:</span>
                <input
                  type="number" step="any" min="0" autoFocus
                  value={valorMeta}
                  onChange={e => onCambiarValorMeta(e.target.value)}
                  className="w-24 text-xs border border-gray-300 rounded px-2 py-1 focus:border-guinda-500 focus:ring-1 focus:ring-guinda-500/20 outline-none"
                />
                <button onClick={onGuardarMeta} disabled={guardandoMeta} className="text-guinda-700 font-medium hover:underline disabled:opacity-40">
                  Guardar
                </button>
                <button onClick={onCancelarEditarMeta} className="text-gray-400 hover:text-gray-600">Cancelar</button>
              </div>
            ) : !soloLectura && (
              <button onClick={onIniciarEditarMeta} className="flex items-center gap-1 text-gray-600 hover:text-guinda-700">
                <Target size={12} /> {tieneMeta ? 'Cambiar meta' : 'Definir meta'}
              </button>
            )}
            {!soloLectura && (
              <>
                <button onClick={onRegistrarMovimiento} className="flex items-center gap-1 text-gray-600 hover:text-guinda-700">
                  <Plus size={12} /> Registrar movimiento
                </button>
                <button onClick={onAgregarNodo} className="flex items-center gap-1 text-gray-600 hover:text-guinda-700">
                  <Link2 size={12} /> Agregar nodo
                </button>
                <button onClick={onDesvincular} className="flex items-center gap-1 text-gray-400 hover:text-red-600 ml-auto">
                  <Trash2 size={12} /> Desvincular indicador
                </button>
              </>
            )}
          </div>

          <div>
            <h4 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Nodos que aportan
            </h4>
            {cargandoNodos ? (
              <div className="flex items-center gap-2 text-xs text-gray-400 py-2">
                <Loader2 size={13} className="animate-spin" /> Cargando…
              </div>
            ) : !nodos || nodos.length === 0 ? (
              <p className="text-xs text-gray-500">Ningún nodo aporta a este indicador todavía.</p>
            ) : (
              <div className="space-y-1.5">
                {nodos.map(ap => {
                  const nombreNodo = ap.etapa_nombre || ap.accion_nombre || ap.tarea_nombre;
                  const tipoNodo = ap.etapa_nombre ? 'Etapa' : ap.accion_nombre ? 'Acción' : 'Tarea';
                  const esOtroProyecto = ap.nodo_proyecto_id && ap.nodo_proyecto_id !== proyectoId;
                  const subtitulo = [tipoNodo, esOtroProyecto ? ap.nodo_proyecto_nombre : null].filter(Boolean).join(' · ');
                  return (
                    <ChipAportacion
                      key={ap.id}
                      ap={ap}
                      etiquetaPrincipal={nombreNodo}
                      subtitulo={subtitulo}
                      soloLectura={soloLectura}
                      onActualizado={onNodosActualizados}
                      mostrarToast={mostrarToast}
                      categorias={esPorCategorias ? ind.categorias : undefined}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
