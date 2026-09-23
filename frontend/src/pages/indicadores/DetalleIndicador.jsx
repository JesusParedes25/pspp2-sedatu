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
import { ArrowLeft, Loader2, Link2, AlertTriangle } from 'lucide-react';
import * as indicadoresApi from '../../api/indicadores';
import { useUI } from '../../context/UIContext';
import CamposIndicadorProyecto from '../../components/indicadores/CamposIndicadorProyecto';
import ChipAportacion from '../../components/indicadores/ChipAportacion';
import ModalVincularIndicador from '../../components/indicadores/ModalVincularIndicador';
import GraficaIndicador from '../../components/indicadores/GraficaIndicador';
import ListaCategoriasEditable from '../../components/indicadores/ListaCategoriasEditable';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import { usarCapturaValorIndicador } from '../../hooks/usarCapturaValorIndicador';
import { usarCapturaCategorias } from '../../hooks/usarCapturaCategorias';
import { formatearMoneda } from '../../utils/formatoMoneda';
import { excedeMeta } from '../../utils/estadoMeta';

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

  useEffect(() => { cargar(); cargarAportaciones(); }, [cargar, cargarAportaciones]);

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

      <SeccionDefinicion indicador={indicador} aportaciones={aportaciones} onGuardado={cargar} mostrarToast={mostrarToast} />

      {indicador.composicion === 'Categorias' ? (
        <SeccionCategorias indicador={indicador} aportaciones={aportaciones} onGuardado={cargar} mostrarToast={mostrarToast} />
      ) : (
        <SeccionValor indicador={indicador} onGuardado={cargar} mostrarToast={mostrarToast} tieneAportaciones={aportaciones.length > 0} />
      )}

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
          onVinculado={() => { setMostrarWizard(false); cargar(); cargarAportaciones(); }}
        />
      )}
    </div>
  );
}

function SeccionDefinicion({ indicador, aportaciones, onGuardado, mostrarToast }) {
  const [datos, setDatos] = useState(() => datosEditables(indicador));
  const [guardando, setGuardando] = useState(false);
  const [categoriasABorrar, setCategoriasABorrar] = useState(null);

  // Si se recarga el indicador (tras guardar, o tras un cambio hecho
  // desde otra pantalla), el formulario se resincroniza con lo real.
  useEffect(() => { setDatos(datosEditables(indicador)); }, [indicador]);

  async function guardarDeVerdad() {
    setGuardando(true);
    try {
      await indicadoresApi.actualizarIndicador(indicador.id, {
        nombre: datos.nombre,
        tipo: datos.tipo,
        unidad: datos.unidad,
        unidad_personalizada: datos.unidad_personalizada,
        meta_global: datos.meta_global === '' ? null : parseFloat(datos.meta_global),
        temporalidad: datos.temporalidad,
        unidad_periodo: datos.unidad_periodo,
        anio_inicio: datos.temporalidad === 'Anual' ? datos.anio_inicio : null,
        anio_fin: datos.temporalidad === 'Anual' ? datos.anio_fin : null,
        metas_anuales: datos.temporalidad === 'Anual' ? datos.metas_anuales : [],
        composicion: datos.composicion,
        tipo_grafico: datos.tipo_grafico,
        categorias: datos.composicion === 'Categorias' ? datos.categorias : [],
        descripcion: datos.descripcion,
      });
      mostrarToast('Indicador actualizado', 'exito');
      onGuardado();
    } catch (err) {
      mostrarToast(err.response?.data?.mensaje || 'No se pudo guardar el indicador', 'error');
    } finally {
      setGuardando(false);
    }
  }

  // El diff-upsert del backend (actualizar()) borra cualquier categoría
  // cuyo "id" ya no venga en el arreglo entrante — sus aportaciones
  // sobreviven con id_categoria=NULL (ON DELETE SET NULL, migración 072)
  // y quedan bajo "Sin categoría asignada", el total no cambia. El dato
  // resultante ya es correcto; lo que faltaba era avisar ANTES de que
  // pase, ya que hoy desaparece de la lista sin aviso.
  function guardar() {
    const idsEntrantes = new Set((datos.categorias || []).filter(c => c.id).map(c => c.id));
    const categoriasEliminadas = (indicador.categorias || []).filter(c => !idsEntrantes.has(c.id));
    const afectadas = categoriasEliminadas
      .map(cat => ({ cat, nAportaciones: (aportaciones || []).filter(a => a.id_categoria === cat.id).length }))
      .filter(x => x.nAportaciones > 0);

    if (afectadas.length > 0) {
      setCategoriasABorrar(afectadas);
      return;
    }
    guardarDeVerdad();
  }

  return (
    <section className="bg-white border border-gray-200 rounded-xl p-4">
      <h2 className="text-sm font-semibold text-gray-900 mb-3">Definición</h2>
      <CamposIndicadorProyecto indicador={datos} onCambio={patch => setDatos(prev => ({ ...prev, ...patch }))} />
      <div className="flex justify-end mt-3">
        <button onClick={guardar} disabled={guardando} className="btn-primary text-sm disabled:opacity-40">
          {guardando ? 'Guardando...' : 'Guardar'}
        </button>
      </div>

      <ConfirmDialog
        abierto={!!categoriasABorrar}
        variante="neutral"
        titulo="Categoría con nodos vinculados"
        mensaje={categoriasABorrar ? (
          categoriasABorrar.length === 1
            ? `La categoría "${categoriasABorrar[0].cat.nombre}" tiene ${categoriasABorrar[0].nAportaciones} nodo(s) vinculado(s). Al eliminarla, esos nodos quedarán como "Sin categoría asignada" — el total del indicador no cambia.`
            : `Las categorías ${categoriasABorrar.map(x => `"${x.cat.nombre}"`).join(', ')} tienen nodos vinculados. Al eliminarlas, esos nodos quedarán como "Sin categoría asignada" — el total del indicador no cambia.`
        ) : ''}
        textoConfirmar="Eliminar de todos modos"
        textoCancelar="Cancelar"
        onConfirmar={() => { setCategoriasABorrar(null); guardarDeVerdad(); }}
        onCancelar={() => setCategoriasABorrar(null)}
      />
    </section>
  );
}

function SeccionValor({ indicador, onGuardado, mostrarToast, tieneAportaciones }) {
  const esMoneda = indicador.unidad === 'Moneda_MXN';
  // modo_calculo nunca lo escribe el wizard (siempre queda en su
  // default 'manual'), así que por sí solo no basta para saber si el
  // valor se captura a mano — un indicador puede quedar en 'manual' y
  // a la vez tener nodos aportando. En cuanto hay al menos un nodo, el
  // valor se calcula solo (mismo criterio que ya aplica por categoría
  // en SeccionCategorias/establecerValorManual) y el input se oculta.
  const esManual = indicador.modo_calculo === 'manual' && !tieneAportaciones;
  const {
    mostrarSelectorPeriodo, sinPeriodos, periodos,
    idPeriodo, cambiarPeriodo, periodoActual,
    valor, setValor, guardando, error, guardar, metaActual,
  } = usarCapturaValorIndicador(indicador);

  async function manejarGuardar() {
    const ok = await guardar();
    if (ok) { mostrarToast('Valor actualizado', 'exito'); onGuardado(); }
  }

  return (
    <section className="bg-white border border-gray-200 rounded-xl p-4">
      <h2 className="text-sm font-semibold text-gray-900 mb-2">Valor actual</h2>
      {!esManual ? (
        <p className="text-xs text-gray-500">
          Este indicador se calcula automáticamente desde el avance de los nodos vinculados — no se edita a mano. Ver "Nodos que aportan" más abajo.
        </p>
      ) : sinPeriodos ? (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          Todavía no hay ningún periodo definido. Agrega uno en Definición (arriba) antes de poder registrar un valor.
        </p>
      ) : (
        <div className="space-y-2 max-w-sm">
          {mostrarSelectorPeriodo && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Periodo</label>
              <select value={idPeriodo || ''} onChange={e => cambiarPeriodo(e.target.value)} className="input-base text-sm">
                {periodos.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.etiqueta || p.anio}{p.valor_actual != null ? ` — ya capturado: ${esMoneda ? formatearMoneda(p.valor_actual) : p.valor_actual}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Valor{mostrarSelectorPeriodo ? ` ${periodoActual?.etiqueta || periodoActual?.anio || ''}` : ''}
            </label>
            <div className="flex items-center gap-2">
              <input type="number" step="any" value={valor} onChange={e => setValor(e.target.value)} className="input-base text-sm flex-1" />
              <button onClick={manejarGuardar} disabled={guardando} className="btn-primary text-sm disabled:opacity-40 flex-shrink-0">
                {guardando ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
            {metaActual > 0 && (
              <p className="text-[10px] text-gray-400 mt-1">Meta: {esMoneda ? formatearMoneda(metaActual) : metaActual}</p>
            )}
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      )}
      {mostrarSelectorPeriodo && periodos.length > 0 && (
        <GraficaIndicador
          tipo={indicador.tipo_grafico}
          filas={periodos.map(p => ({
            etiqueta: p.etiqueta || String(p.anio),
            meta: parseFloat(p.meta) || 0,
            real: parseFloat(p.valor_actual) || 0,
          }))}
        />
      )}
    </section>
  );
}

function SeccionCategorias({ indicador, aportaciones, onGuardado, mostrarToast }) {
  const categoriasConAportacion = new Set(aportaciones.map(a => a.id_categoria).filter(Boolean));
  const { categorias, sinCategorias, valores, cambiarValor, guardar, guardando, error } = usarCapturaCategorias(indicador, categoriasConAportacion);

  async function manejarGuardar() {
    const ok = await guardar();
    if (ok) { mostrarToast('Valores actualizados', 'exito'); onGuardado(); }
  }

  return (
    <section className="bg-white border border-gray-200 rounded-xl p-4">
      <h2 className="text-sm font-semibold text-gray-900 mb-2">Valor por categoría</h2>
      {sinCategorias ? (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          Todavía no hay ninguna categoría definida. Agrega al menos una en Definición (arriba) antes de poder registrar valores.
        </p>
      ) : (
        <div className="max-w-sm">
          <ListaCategoriasEditable
            indicador={indicador}
            categorias={categorias}
            valores={valores}
            onCambiarValor={cambiarValor}
            categoriasConAportacion={categoriasConAportacion}
          />
          <div className="flex justify-end mt-3">
            <button onClick={manejarGuardar} disabled={guardando} className="btn-primary text-sm disabled:opacity-40">
              {guardando ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
          {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
        </div>
      )}
      {!sinCategorias && (
        <GraficaIndicador
          tipo={indicador.tipo_grafico}
          filas={categorias.map(c => ({
            etiqueta: c.nombre,
            meta: parseFloat(c.meta) || 0,
            real: parseFloat(c.valor_actual) || 0,
          }))}
        />
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
