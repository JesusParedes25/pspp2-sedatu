/**
 * ARCHIVO: DetalleIndicador.jsx
 * PROPÓSITO: Pantalla de detalle de UN indicador — la pieza que faltaba
 *            del módulo de Indicadores: hasta ahora, cambiar el nombre o
 *            la definición de un indicador solo era posible entrando a
 *            "Editar proyecto" y buscándolo ahí, enterrado en una lista.
 *            Aquí vive todo lo propio de un indicador: su definición
 *            (reusa `CamposIndicadorProyecto`, ya bloquea nombre/tipo/
 *            unidad si viene del catálogo), su valor actual (reusa el
 *            hook `usarCapturaValorIndicador`, el mismo que usa el modal
 *            rápido de las tarjetas) y qué etapas/acciones/tareas
 *            aportan (reusa `ChipAportacion`, el mismo chip de la
 *            pestaña de Seguimiento — solo cambia qué texto es el
 *            principal: ahí el indicador, aquí el nodo).
 *
 * Permisos: el backend ya decide quién puede editar (PUT /indicadores/:id
 * exige ser responsable/colaborador del proyecto) — mismo patrón que el
 * resto del módulo, sin pre-chequeo aquí: los controles se muestran
 * siempre y un 403 real se traduce en un toast, no en ocultar la UI de
 * antemano.
 */
import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft, Loader2, Link2, AlertTriangle, Pencil, Plus, Ban, Target,
} from 'lucide-react';
import { LineChart, Line, ReferenceLine, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import * as indicadoresApi from '../../api/indicadores';
import { useUI } from '../../context/UIContext';
import CamposIndicadorProyecto from '../../components/indicadores/CamposIndicadorProyecto';
import ChipAportacion from '../../components/indicadores/ChipAportacion';
import ModalVincularIndicador from '../../components/indicadores/ModalVincularIndicador';
import ModalRegistrarMovimiento from '../../components/indicadores/ModalRegistrarMovimiento';
import { etiquetaUnidad } from '../../components/indicadores/SelectorIndicadorCatalogo';
import { formatearMoneda, formatearMonedaCorta } from '../../utils/formatoMoneda';
import { formatFecha } from '../../utils/fecha';
import { excedeMeta } from '../../utils/estadoMeta';
import { formatoCorto } from '../../components/indicadores/TarjetaIndicador';

const GUINDA = '#7B1C3E';
const NIVEL_LABEL = { etapa: 'Etapa', accion: 'Acción', tarea: 'Tarea' };

// "Se completó 'X'" / "Registro a mano de Y" (Bloque 6 del encargo) — el
// origen de un movimiento, en una frase. `nota` ya trae el detalle que
// puso procesarCambioNodo ("Actividad completada", "Avance de la
// actividad vinculada: 60%"...) para los automáticos; para los
// manuales con nodo (Bloque 4, registrados desde la pestaña Indicadores
// de un nodo) no hay nota prefabricada, así que se compone aquí.
function descripcionOrigenMovimiento(m) {
  const nodo = m.nodo_nombre ? `${NIVEL_LABEL[m.nodo_tipo] || ''} "${m.nodo_nombre}"` : null;
  if (m.origen === 'migracion') return m.nota || 'Valor migrado de la versión anterior';
  if (m.origen === 'manual') return nodo ? `Registro a mano de ${nodo}` : (m.nota || 'Registro a mano');
  return nodo ? `${nodo}: ${m.nota || 'actualizada'}` : (m.nota || 'Actividad vinculada');
}

function datosEditables(indicador) {
  return {
    ...indicador,
    unidad_personalizada: indicador.unidad_personalizada || '',
    metas_anuales: indicador.metas_anuales || [],
    categorias: indicador.categorias || [],
    descripcion: indicador.descripcion || '',
  };
}

export default function DetalleIndicador() {
  const { id } = useParams();
  const { mostrarToast } = useUI();
  const [indicador, setIndicador] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [noEncontrado, setNoEncontrado] = useState(false);
  const [aportaciones, setAportaciones] = useState([]);
  const [cargandoAportaciones, setCargandoAportaciones] = useState(true);
  const [mostrarWizard, setMostrarWizard] = useState(false);
  const [movimientos, setMovimientos] = useState([]);
  const [cargandoMovimientos, setCargandoMovimientos] = useState(true);
  const [mostrarRegistrarMovimiento, setMostrarRegistrarMovimiento] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const datos = await indicadoresApi.obtenerIndicador(id);
      setIndicador(datos);
    } catch (err) {
      if (err.response?.status === 404) setNoEncontrado(true);
      else mostrarToast(err.response?.data?.mensaje || 'No se pudo cargar el indicador', 'error');
    } finally {
      setCargando(false);
    }
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const cargarAportaciones = useCallback(async () => {
    setCargandoAportaciones(true);
    try {
      const datos = await indicadoresApi.obtenerAportacionesIndicador(id);
      setAportaciones(datos);
    } catch (err) {
      console.error('Error cargando aportaciones:', err);
    } finally {
      setCargandoAportaciones(false);
    }
  }, [id]);

  const cargarMovimientos = useCallback(async () => {
    setCargandoMovimientos(true);
    try {
      const datos = await indicadoresApi.listarMovimientosIndicador(id);
      setMovimientos(datos);
    } catch (err) {
      console.error('Error cargando movimientos:', err);
    } finally {
      setCargandoMovimientos(false);
    }
  }, [id]);

  useEffect(() => { cargar(); cargarAportaciones(); cargarMovimientos(); }, [cargar, cargarAportaciones, cargarMovimientos]);

  // El spinner de página completa solo tiene sentido en el mount
  // inicial (todavía no hay nada que mostrar) — en cada refresh
  // posterior (tras vincular/editar un nodo) `cargando` también se
  // pone en true, y reemplazar TODO el árbol por un spinner lo vuelve
  // a montar de cero al terminar, lo que resetea el scroll del
  // navegador a top. Con contenido previo ya en pantalla, se queda
  // visible sin parpadeo mientras llega el dato nuevo.
  if (cargando && !indicador) {
    return (
      <div className="p-6 flex items-center justify-center py-16 gap-2 text-gray-400">
        <Loader2 size={18} className="animate-spin" />
        <span className="text-sm">Cargando indicador…</span>
      </div>
    );
  }

  if (noEncontrado || !indicador) {
    return (
      <div className="p-6">
        <Link to="/indicadores" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-guinda-500 transition-colors">
          <ArrowLeft size={16} /> Indicadores
        </Link>
        <p className="text-sm text-gray-500 mt-4">Este indicador no existe o fue retirado.</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl space-y-5">
      <div>
        <Link to="/indicadores" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-guinda-500 transition-colors">
          <ArrowLeft size={16} /> Indicadores
        </Link>
        <h1 className="text-lg font-bold text-gray-900 mt-2 break-words">{indicador.nombre}</h1>
        <p className="text-xs text-gray-500 mt-0.5">
          <Link to={`/proyectos/${indicador.proyecto_id}`} className="hover:text-guinda-600 hover:underline">
            {indicador.proyecto_nombre}
          </Link>
          {indicador.dg_siglas && <> · {indicador.dg_siglas}</>}
        </p>
      </div>

      <SeccionDefinicion indicador={indicador} onGuardado={cargar} mostrarToast={mostrarToast} />

      <SeccionValorMovimientos
        indicador={indicador}
        movimientos={movimientos}
        cargando={cargandoMovimientos}
        onRegistrar={() => setMostrarRegistrarMovimiento(true)}
        onActualizado={() => { cargar(); cargarMovimientos(); }}
        mostrarToast={mostrarToast}
      />

      <SeccionAportaciones
        indicador={indicador}
        aportaciones={aportaciones}
        cargando={cargandoAportaciones}
        proyectoId={indicador.proyecto_id}
        onActualizado={() => { cargar(); cargarAportaciones(); }}
        onAgregar={() => setMostrarWizard(true)}
        mostrarToast={mostrarToast}
        categorias={indicador.composicion === 'Categorias' ? indicador.categorias : undefined}
      />

      {mostrarWizard && (
        <ModalVincularIndicador
          proyectoPreseleccionado={{ id: indicador.proyecto_id, nombre: indicador.proyecto_nombre }}
          indicadorPreseleccionado={indicador}
          onCerrar={() => setMostrarWizard(false)}
          onVinculado={() => { setMostrarWizard(false); cargar(); cargarAportaciones(); cargarMovimientos(); }}
        />
      )}

      {mostrarRegistrarMovimiento && (
        <ModalRegistrarMovimiento
          indicadorId={indicador.id}
          indicadorNombre={indicador.nombre}
          idNodoOrigen={null}
          onCerrar={() => setMostrarRegistrarMovimiento(false)}
          onRegistrado={() => {
            setMostrarRegistrarMovimiento(false);
            cargar();
            cargarMovimientos();
            mostrarToast('Movimiento registrado', 'exito');
          }}
        />
      )}
    </div>
  );
}

// Bloque 6 del rediseño de Indicadores: "deja de ser un formulario" — por
// defecto se muestra como texto, con un solo botón "Editar" que revela el
// mismo formulario de siempre (CamposIndicadorProyecto) con un único
// "Guardar". Antes esta sección y "Valor actual" mostraban cada una su
// propio "Guardar" uno junto al otro, dos botones idénticos que no decían
// qué hacía cada uno.
function SeccionDefinicion({ indicador, onGuardado, mostrarToast }) {
  const [editando, setEditando] = useState(false);
  const [datos, setDatos] = useState(() => datosEditables(indicador));
  const [guardando, setGuardando] = useState(false);

  // Si se recarga el indicador (tras guardar, o tras un cambio hecho
  // desde otra pantalla), el formulario se resincroniza con lo real.
  useEffect(() => { setDatos(datosEditables(indicador)); }, [indicador]);

  // temporalidad/composicion/tipo_grafico/metas_anuales/categorias ya no
  // viajan: el formulario (CamposIndicadorProyecto) dejó de pedirlos
  // (Bloque 7 del rediseño) y actualizar() los ignora de todos modos
  // desde el Bloque 1 — nunca sobreescribe lo ya capturado por periodo o
  // categoría con solo editar nombre/meta/descripción.
  async function guardar() {
    setGuardando(true);
    try {
      await indicadoresApi.actualizarIndicador(indicador.id, {
        nombre: datos.nombre,
        tipo: datos.tipo,
        unidad: datos.unidad,
        unidad_personalizada: datos.unidad_personalizada,
        meta_global: datos.meta_global === '' ? null : parseFloat(datos.meta_global),
        descripcion: datos.descripcion,
      });
      mostrarToast('Indicador actualizado', 'exito');
      setEditando(false);
      onGuardado();
    } catch (err) {
      mostrarToast(err.response?.data?.mensaje || 'No se pudo guardar el indicador', 'error');
    } finally {
      setGuardando(false);
    }
  }

  if (!editando) {
    const esMoneda = indicador.unidad === 'Moneda_MXN';
    const meta = parseFloat(indicador.meta_global) || 0;
    return (
      <section className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <h2 className="text-sm font-semibold text-gray-900">Definición</h2>
          <button
            onClick={() => { setDatos(datosEditables(indicador)); setEditando(true); }}
            className="flex items-center gap-1 text-xs font-medium text-guinda-700 hover:underline flex-shrink-0"
          >
            <Pencil size={12} /> Editar
          </button>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
          <div>
            <dt className="text-gray-400">Tipo</dt>
            <dd className="text-gray-700">{indicador.tipo?.replaceAll('_', ' ') || 'Sin capturar'}</dd>
          </div>
          <div>
            <dt className="text-gray-400">Unidad</dt>
            <dd className="text-gray-700">{etiquetaUnidad(indicador)}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-gray-400">Cómo se mide</dt>
            <dd className="text-gray-700">{indicador.definicion || 'Sin definición capturada.'}</dd>
          </div>
          <div>
            <dt className="text-gray-400">Fuente del dato</dt>
            <dd className="text-gray-700">{indicador.fuente || 'Sin fuente capturada.'}</dd>
          </div>
          <div>
            <dt className="text-gray-400">Meta</dt>
            <dd className="text-gray-700">
              {meta > 0 ? (esMoneda ? formatearMoneda(meta) : meta.toLocaleString('es-MX')) : (
                // Mismo tratamiento discreto que ya usa la nota de fecha
                // límite — no capturar meta es una decisión válida, no un
                // campo olvidado.
                <span className="text-gray-400">
                  Sin meta, este indicador reporta el número pero no puede calcular porcentaje de avance
                </span>
              )}
            </dd>
          </div>
        </dl>
      </section>
    );
  }

  return (
    <section className="bg-white border border-gray-200 rounded-xl p-4">
      <h2 className="text-sm font-semibold text-gray-900 mb-3">Definición</h2>
      <CamposIndicadorProyecto indicador={datos} onCambio={patch => setDatos(prev => ({ ...prev, ...patch }))} />
      <div className="flex justify-end gap-2 mt-3">
        <button onClick={() => setEditando(false)} disabled={guardando} className="btn-secondary text-sm disabled:opacity-40">
          Cancelar
        </button>
        <button onClick={guardar} disabled={guardando} className="btn-primary text-sm disabled:opacity-40">
          {guardando ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </section>
  );
}

// Bloque 6 del rediseño de Indicadores: el historial de movimientos es
// lo más útil de la pantalla — reemplaza a las viejas "Valor actual"/
// "Valor por categoría" (formularios que pisaban un número sin dejar
// rastro). Aquí solo se MUESTRA valor/meta/gráfica/historial; capturar
// pasa siempre por ModalRegistrarMovimiento (mismo modal que ya usa la
// pestaña Indicadores de un nodo en Seguimiento, Bloque 4), que inserta
// un movimiento — nunca pisa el total directo.
function SeccionValorMovimientos({ indicador, movimientos, cargando, onRegistrar, onActualizado, mostrarToast }) {
  const esMoneda = indicador.unidad === 'Moneda_MXN';
  const unidad = etiquetaUnidad(indicador);
  const valor = parseFloat(indicador.valor_actual) || 0;
  const meta = parseFloat(indicador.meta_global) || 0;
  const tieneMeta = meta > 0;
  const pct = tieneMeta ? (valor / meta) * 100 : null;
  const [anulando, setAnulando] = useState(null); // id del movimiento con el campo de motivo abierto
  const [motivo, setMotivo] = useState('');
  const [procesando, setProcesando] = useState(false);

  // Orden cronológico ascendente para acumular, conservando el orden
  // DESC (más reciente arriba) para mostrar — un movimiento anulado no
  // suma al acumulado (coincide con cómo recalcularValorActual excluye
  // los anulados), pero se deja ver tachado en su lugar en el tiempo.
  const conAcumulado = (() => {
    const asc = [...movimientos].reverse();
    let acumulado = 0;
    const calculados = asc.map(m => {
      if (!m.anulado_en) acumulado += parseFloat(m.cantidad);
      return { ...m, acumuladoTrasEste: acumulado };
    });
    return calculados.reverse();
  })();

  const serieGrafica = (() => {
    const asc = [...movimientos].reverse().filter(m => !m.anulado_en);
    let acumulado = 0;
    return asc.map(m => {
      acumulado += parseFloat(m.cantidad);
      return { fecha: formatFecha(m.fecha, { day: '2-digit', month: 'short' }), valor: acumulado };
    });
  })();

  async function confirmarAnular(movimientoId) {
    if (!motivo.trim()) return;
    setProcesando(true);
    try {
      await indicadoresApi.anularMovimientoIndicador(movimientoId, motivo.trim());
      mostrarToast('Movimiento anulado', 'exito');
      setAnulando(null);
      setMotivo('');
      onActualizado();
    } catch (err) {
      mostrarToast(err.response?.data?.mensaje || 'No se pudo anular el movimiento', 'error');
    } finally {
      setProcesando(false);
    }
  }

  return (
    <section className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-start justify-between gap-2 mb-2">
        <h2 className="text-sm font-semibold text-gray-900">Valor actual</h2>
        <button onClick={onRegistrar} className="flex items-center gap-1 text-xs font-medium text-guinda-700 hover:underline flex-shrink-0">
          <Plus size={12} /> Registrar movimiento
        </button>
      </div>

      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <span className="text-2xl font-bold tabular-nums leading-none" style={{ color: GUINDA }} title={valor.toLocaleString('es-MX')}>
            {esMoneda ? formatearMonedaCorta(valor) : formatoCorto(valor)}
          </span>
          {tieneMeta ? (
            <span className="text-xs text-gray-500 ml-1.5">
              de {esMoneda ? formatearMonedaCorta(meta) : `${formatoCorto(meta)}${unidad ? ` ${unidad}` : ''}`}
            </span>
          ) : (!esMoneda && unidad && <span className="text-xs text-gray-500 ml-1.5">{unidad}</span>)}
        </div>
        {tieneMeta && (
          <span className="text-sm font-semibold tabular-nums flex-shrink-0 px-1.5 py-0.5 rounded" style={{ color: GUINDA, backgroundColor: 'rgba(123,28,62,0.07)' }}>
            {pct.toFixed(0)}%
          </span>
        )}
      </div>
      {tieneMeta ? (
        <div className="mt-2 h-2 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, pct)}%`, backgroundColor: GUINDA }} />
        </div>
      ) : (
        <p className="mt-1.5 flex items-center gap-1 text-[11px] text-gray-400">
          <Target size={10} /> Sin meta, este indicador reporta el número pero no puede calcular porcentaje de avance
        </p>
      )}

      {serieGrafica.length > 1 && (
        <div className="h-32 mt-4">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={serieGrafica}>
              <XAxis dataKey="fecha" tick={{ fontSize: 10 }} />
              <YAxis hide />
              <Tooltip contentStyle={{ fontSize: 11 }} formatter={v => esMoneda ? formatearMoneda(v) : Number(v).toLocaleString('es-MX')} />
              {tieneMeta && <ReferenceLine y={meta} stroke="#e5e7eb" strokeDasharray="4 3" label={{ value: 'Meta', fontSize: 10, fill: '#9ca3af', position: 'insideTopRight' }} />}
              <Line type="monotone" dataKey="valor" stroke={GUINDA} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <h3 className="text-xs font-semibold text-gray-600 mt-4 mb-1.5">Historial de movimientos</h3>
      {cargando ? (
        <div className="flex items-center gap-2 text-xs text-gray-400 py-2"><Loader2 size={13} className="animate-spin" /> Cargando…</div>
      ) : conAcumulado.length === 0 ? (
        <p className="text-xs text-gray-500">Todavía no hay ningún movimiento registrado.</p>
      ) : (
        <div className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
          {conAcumulado.map(m => {
            const anulado = !!m.anulado_en;
            const cantidad = parseFloat(m.cantidad);
            return (
              <div key={m.id} className={`px-3 py-2 text-xs ${anulado ? 'opacity-50' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className={`min-w-0 ${anulado ? 'line-through' : ''}`}>
                    <p className="text-gray-700">{descripcionOrigenMovimiento(m)}</p>
                    <p className="text-[10px] text-gray-400">
                      {formatFecha(m.fecha)}{m.creador_nombre ? ` · ${m.creador_nombre}` : ''}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`font-medium tabular-nums ${anulado ? 'line-through text-gray-400' : cantidad < 0 ? 'text-red-600' : 'text-gray-700'}`}>
                      {cantidad > 0 ? '+' : ''}{esMoneda ? formatearMoneda(cantidad) : cantidad.toLocaleString('es-MX')}
                    </p>
                    <p className="text-[10px] text-gray-400 tabular-nums">
                      acumulado: {esMoneda ? formatearMoneda(m.acumuladoTrasEste) : m.acumuladoTrasEste.toLocaleString('es-MX')}
                    </p>
                  </div>
                </div>
                {anulado ? (
                  <p className="text-[10px] text-gray-400 mt-1">
                    Anulado por {m.anulador_nombre || 'alguien'}{m.motivo_anulacion ? `: ${m.motivo_anulacion}` : ''}
                  </p>
                ) : anulando === m.id ? (
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <input
                      autoFocus
                      value={motivo}
                      onChange={e => setMotivo(e.target.value)}
                      placeholder="Motivo de la anulación"
                      className="flex-1 text-[11px] border border-gray-300 rounded px-2 py-1 focus:border-guinda-500 focus:ring-1 focus:ring-guinda-500/20 outline-none"
                    />
                    <button
                      onClick={() => confirmarAnular(m.id)}
                      disabled={procesando || !motivo.trim()}
                      className="text-[11px] font-medium text-red-600 hover:underline disabled:opacity-40"
                    >
                      Confirmar
                    </button>
                    <button onClick={() => { setAnulando(null); setMotivo(''); }} className="text-[11px] text-gray-400 hover:text-gray-600">
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setAnulando(m.id); setMotivo(''); }}
                    className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-red-600 mt-1"
                  >
                    <Ban size={10} /> Anular
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function filaAportacion(ap, proyectoId, onActualizado, mostrarToast, categorias) {
  const nombreNodo = ap.etapa_nombre || ap.accion_nombre || ap.tarea_nombre;
  const tipoNodo = ap.etapa_nombre ? 'Etapa' : ap.accion_nombre ? 'Acción' : 'Tarea';
  // Una aportación puede venir de un proyecto distinto al del
  // indicador (el módulo lo permite) — cuando eso pasa, se
  // deja explícito en vez de dejar que parezca un nodo propio.
  const esOtroProyecto = ap.nodo_proyecto_id && ap.nodo_proyecto_id !== proyectoId;
  const subtitulo = [tipoNodo, esOtroProyecto ? ap.nodo_proyecto_nombre : null].filter(Boolean).join(' · ');
  return (
    <ChipAportacion
      key={ap.id}
      ap={ap}
      etiquetaPrincipal={nombreNodo}
      subtitulo={subtitulo}
      onActualizado={onActualizado}
      mostrarToast={mostrarToast}
      categorias={categorias}
    />
  );
}

function SeccionAportaciones({ indicador, aportaciones, cargando, proyectoId, onActualizado, onAgregar, mostrarToast, categorias }) {
  const esMoneda = indicador.unidad === 'Moneda_MXN';
  const valorActual = parseFloat(indicador.valor_actual) || 0;
  const metaGlobal = parseFloat(indicador.meta_global) || 0;
  const esPorCategorias = indicador.composicion === 'Categorias';

  // Agrupar por categoría solo tiene sentido si el indicador es por
  // categorías — el total y el subtotal de cada grupo vienen del
  // rollup que ya hizo el backend (indicador.valor_actual/
  // categorias[].valor_actual), nunca recalculados aquí, para no
  // arriesgar que la suma en pantalla diverja de la real.
  const grupos = esPorCategorias
    ? (indicador.categorias || []).map(cat => ({
        categoria: cat,
        filas: aportaciones.filter(ap => ap.id_categoria === cat.id),
      })).filter(g => g.filas.length > 0)
    : null;
  const sinCategoria = esPorCategorias ? aportaciones.filter(ap => !ap.id_categoria) : [];

  return (
    <section className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-semibold text-gray-900">Nodos que aportan</h2>
        <button onClick={onAgregar} className="flex items-center gap-1 text-xs font-medium text-guinda-700 hover:underline">
          <Link2 size={12} /> Agregar nodo
        </button>
      </div>
      {aportaciones.length > 0 && (
        <p className={`text-xs mb-2 flex items-center gap-1 ${excedeMeta(valorActual, metaGlobal) ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
          {excedeMeta(valorActual, metaGlobal) && <AlertTriangle size={11} className="flex-shrink-0" />}
          Total: <span className="font-medium">{esMoneda ? formatearMoneda(valorActual) : valorActual.toLocaleString('es-MX')}</span>
          {metaGlobal > 0 && <> de {esMoneda ? formatearMoneda(metaGlobal) : metaGlobal.toLocaleString('es-MX')}</>}
        </p>
      )}
      {cargando ? (
        <div className="flex items-center gap-2 text-xs text-gray-400 py-2">
          <Loader2 size={14} className="animate-spin" /> Cargando…
        </div>
      ) : aportaciones.length === 0 ? (
        <p className="text-xs text-gray-500">Ningún nodo aporta a este indicador todavía.</p>
      ) : esPorCategorias ? (
        <div className="space-y-3">
          {grupos.map(({ categoria, filas }) => {
            const excede = excedeMeta(categoria.valor_actual, categoria.meta);
            return (
              <div key={categoria.id}>
                <p className="text-[11px] font-semibold text-gray-500 mb-1 flex items-center justify-between">
                  <span>{categoria.nombre}</span>
                  <span className={`font-normal flex items-center gap-1 ${excede ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
                    {excede && <AlertTriangle size={10} className="flex-shrink-0" />}
                    {esMoneda ? formatearMoneda(parseFloat(categoria.valor_actual) || 0) : (parseFloat(categoria.valor_actual) || 0).toLocaleString('es-MX')}
                  </span>
                </p>
                <div className="space-y-2">
                  {filas.map(ap => filaAportacion(ap, proyectoId, onActualizado, mostrarToast, categorias))}
                </div>
              </div>
            );
          })}
          {sinCategoria.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-amber-700 mb-1">Sin categoría asignada</p>
              <div className="space-y-2">
                {sinCategoria.map(ap => filaAportacion(ap, proyectoId, onActualizado, mostrarToast, categorias))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {aportaciones.map(ap => filaAportacion(ap, proyectoId, onActualizado, mostrarToast, categorias))}
        </div>
      )}
    </section>
  );
}
