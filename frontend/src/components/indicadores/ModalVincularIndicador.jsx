/**
 * ARCHIVO: ModalVincularIndicador.jsx
 * PROPÓSITO: Wizard de 3 pasos para vincular un nodo (o un proyecto
 *            completo) a un indicador del catálogo — crearlo si hace
 *            falta. Casa de "todo lo relacionado con indicadores" del
 *            módulo nuevo: se abre desde "Mis indicadores" (sin nada
 *            preseleccionado, el usuario navega) o desde la pestaña de
 *            un nodo en Seguimiento (con proyecto+nodo ya resueltos, el
 *            paso 1 se colapsa a una confirmación de una línea).
 *
 * 1. "¿Dónde vive este indicador?" — Proyecto → Etapa → Acción/Subacción
 *    → Tarea, todos opcionales salvo Proyecto ("detenerse aquí" en
 *    cualquier nivel = vincular a ese nivel). Solo se listan
 *    proyectos/nodos donde el usuario tiene permiso de edición. El
 *    select de proyecto se omite si ya viene fijo
 *    (`proyectoPreseleccionado`); los de etapa/acción/tarea se omiten
 *    si ya viene fijo el nodo (`nodoPreseleccionado`) — independientes
 *    entre sí, para cubrir también "proyecto fijo, nodo por elegir"
 *    (el caso de "+ Agregar nodo" desde el detalle de un indicador).
 * 2. "¿Qué vas a medir?" — SelectorIndicadorCatalogo, reusado tal cual
 *    (ya trae el buscador con sugerencias por similitud). Si el
 *    proyecto no tenía todavía un indicador para esa entrada del
 *    catálogo, se crea aquí (con una meta opcional). Se salta por
 *    completo si ya viene fijo el indicador (`indicadorPreseleccionado`
 *    — se llega directo del paso 1 al paso 3, ya se sabe qué medir).
 * 3. "¿Cómo aporta este nodo?" — solo si se eligió un nodo (no aplica a
 *    nivel proyecto): Manual (cuenta un valor fijo cuando el nodo se
 *    complete) o Automático (proporcional a su avance en cualquier
 *    momento).
 */
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, ChevronRight, Check, PenLine, TrendingUp } from 'lucide-react';
import * as proyectosApi from '../../api/proyectos';
import * as etapasApi from '../../api/etapas';
import * as indicadoresApi from '../../api/indicadores';
import { useUI } from '../../context/UIContext';
import SelectorIndicadorCatalogo from './SelectorIndicadorCatalogo';
import CamposIndicadorProyecto from './CamposIndicadorProyecto';
import { indicadorProyectoVacio, conDefaultsPorTipo } from '../../utils/tiposIndicador';

const PASOS = ['Dónde', 'Qué', 'Cómo'];

export default function ModalVincularIndicador({
  proyectosDisponibles = [],
  proyectoPreseleccionado = null,
  nodoPreseleccionado = null,
  indicadorPreseleccionado = null,
  onVinculado,
  onCerrar,
}) {
  const { mostrarToast } = useUI();

  // Sin ambigüedad que resolver (un único proyecto accesible), se
  // preselecciona en vez de obligar a elegirlo de una lista de uno solo.
  const [proyecto, setProyecto] = useState(
    proyectoPreseleccionado || (proyectosDisponibles.length === 1 ? proyectosDisponibles[0] : null)
  );
  const [permisos, setPermisos] = useState(null);
  const [arbol, setArbol] = useState(null);
  const [cargandoProyecto, setCargandoProyecto] = useState(false);

  const [etapaId, setEtapaId] = useState(nodoPreseleccionado?.tipo === 'etapa' ? nodoPreseleccionado.id : '');
  const [accionId, setAccionId] = useState(nodoPreseleccionado?.tipo === 'accion' ? nodoPreseleccionado.id : '');
  const [tareaId, setTareaId] = useState(nodoPreseleccionado?.tipo === 'tarea' ? nodoPreseleccionado.id : '');

  // Sin ambigüedad de "dónde" (proyecto+nodo ya resueltos), se arranca
  // más adelante: directo en "qué medir" (paso 2), o directo en "cómo
  // aporta" (paso 3) si además ya viene fijo el indicador — el botón
  // "Atrás" nunca retrocede antes de este punto (ver más abajo).
  const pasoInicial = (proyectoPreseleccionado && nodoPreseleccionado)
    ? (indicadorPreseleccionado ? 3 : 2)
    : 1;
  const [paso, setPaso] = useState(pasoInicial);
  const [mostrarCatalogo, setMostrarCatalogo] = useState(false);
  const [catalogoElegido, setCatalogoElegido] = useState(null);
  const [indicadorExistente, setIndicadorExistente] = useState(null);
  const [indicadoresProyecto, setIndicadoresProyecto] = useState([]);
  // Indicador nuevo (cuando la entrada del catálogo elegida no tiene
  // todavía un indicador en este proyecto) — mismos campos que "Crear
  // proyecto"/"Editar proyecto" (meta, temporalidad, año fiscal), antes
  // ausentes aquí: este wizard solo pedía la meta y creaba siempre con
  // temporalidad 'Global', así que un indicador financiero no tenía
  // forma de marcarse "por ejercicio fiscal" desde este flujo.
  const [indicadorNuevo, setIndicadorNuevo] = useState(indicadorProyectoVacio());
  const [modoAportacion, setModoAportacion] = useState('al_concluir');
  const [valorAportacion, setValorAportacion] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  // Cargar árbol + permisos + indicadores ya capturados del proyecto elegido.
  useEffect(() => {
    if (!proyecto?.id) { setArbol(null); setPermisos(null); setIndicadoresProyecto([]); return; }
    let vivo = true;
    setCargandoProyecto(true);
    Promise.all([
      etapasApi.obtenerArbol(proyecto.id),
      proyectosApi.obtenerMisPermisos(proyecto.id),
      indicadoresApi.listarTodosPorProyecto(proyecto.id),
    ]).then(([arbolRes, permisosRes, indsRes]) => {
      if (!vivo) return;
      setArbol(arbolRes.datos || arbolRes || []);
      setPermisos(permisosRes.datos || permisosRes);
      setIndicadoresProyecto(indsRes || []);
    }).catch(() => { if (vivo) setError('No se pudo cargar la información del proyecto.'); })
      .finally(() => { if (vivo) setCargandoProyecto(false); });
    return () => { vivo = false; };
  }, [proyecto?.id]);

  function puedeEditar(tipo, id) {
    if (!permisos) return true; // provisional mientras carga
    if (!permisos.nodos_editables) return permisos.puede_capturar_proyecto !== false;
    if (permisos.puede_capturar_proyecto) return true;
    return (permisos.nodos_editables[tipo] || []).includes(id);
  }

  const etapas = arbol || [];
  const etapaActual = etapas.find(e => e.id === etapaId);
  const acciones = (etapaActual?.acciones || []).filter(a => !a.id_accion_padre);
  const accionActual = acciones.find(a => a.id === accionId)
    || (etapaActual?.acciones || []).flatMap(a => a.subacciones || []).find(s => s.id === accionId);
  const subaccionesYTareas = [
    ...(acciones.find(a => a.id === accionId)?.subacciones || []).map(s => ({ ...s, _tipo: 'subaccion' })),
    ...(acciones.find(a => a.id === accionId)?.tareas || []).map(t => ({ ...t, _tipo: 'tarea' })),
  ];

  // Nodo final resuelto para el paso 3 (o null = a nivel proyecto).
  const nodoFinal = tareaId
    ? { tipo: 'tarea', id: tareaId }
    : accionId
    ? { tipo: 'accion', id: accionId }
    : etapaId
    ? { tipo: 'etapa', id: etapaId }
    : null;

  function nombreNodoFinal() {
    if (nodoPreseleccionado) return nodoPreseleccionado.nombre;
    if (tareaId) return subaccionesYTareas.find(x => x.id === tareaId)?.nombre;
    if (accionId) return accionActual?.nombre || acciones.find(a => a.id === accionId)?.nombre;
    if (etapaId) return etapaActual?.nombre;
    return null;
  }

  function irSiguienteDesdePaso1() {
    setError('');
    // Ya se sabe qué medir (indicadorPreseleccionado) — nada que elegir
    // en el paso 2, se salta directo a "cómo aporta".
    setPaso(indicadorPreseleccionado ? 3 : 2);
  }

  // El botón "Atrás" nunca retrocede antes de pasoInicial (no hay nada
  // que mostrar ahí — esos pasos se saltaron a propósito). Desde el
  // paso 3 con indicadorPreseleccionado, retrocede al paso 1 (el 2 no
  // se visitó, saltarlo también al volver).
  function irAtras() {
    if (paso === 3 && indicadorPreseleccionado && pasoInicial === 1) { setPaso(1); return; }
    if (paso > pasoInicial) { setPaso(paso - 1); return; }
    onCerrar();
  }

  async function alElegirCatalogo(entradaCatalogo) {
    setMostrarCatalogo(false);
    setCatalogoElegido(entradaCatalogo);
    const existente = indicadoresProyecto.find(i => i.id_catalogo === entradaCatalogo.id);
    setIndicadorExistente(existente || null);
    if (existente) {
      // Ya existe un indicador de este proyecto para esa entrada del
      // catálogo — nada nuevo que definir, se avanza directo.
      setPaso(3);
      return;
    }
    // Precargar nombre/tipo/unidad del catálogo — mismo criterio que
    // "Crear proyecto"/"Editar proyecto": la identidad del indicador
    // viene del catálogo, aquí solo se completa lo propio de este
    // proyecto (meta, temporalidad, año). Se queda en el paso 2 para
    // que esos campos sean visibles antes de avanzar — antes brincaba
    // directo al paso 3 y la meta/temporalidad nunca llegaban a
    // mostrarse, por eso no había forma de marcar un indicador
    // financiero "por ejercicio fiscal" desde este wizard.
    setIndicadorNuevo(conDefaultsPorTipo({
      ...indicadorProyectoVacio(),
      id_catalogo: entradaCatalogo.id,
      nombre: entradaCatalogo.nombre,
      tipo: entradaCatalogo.tipo,
      unidad: entradaCatalogo.unidad,
      unidad_personalizada: entradaCatalogo.unidad_personalizada || '',
      descripcion: entradaCatalogo.descripcion || '',
    }));
  }

  async function confirmarVinculo() {
    setError('');
    setGuardando(true);
    try {
      let indicadorId = indicadorPreseleccionado?.id || indicadorExistente?.id;

      if (!indicadorId) {
        const res = await indicadoresApi.crearIndicador(proyecto.id, {
          nombre: indicadorNuevo.nombre,
          tipo: indicadorNuevo.tipo,
          unidad: indicadorNuevo.unidad,
          unidad_personalizada: indicadorNuevo.unidad_personalizada,
          id_catalogo: indicadorNuevo.id_catalogo,
          meta_global: indicadorNuevo.meta_global === '' ? null : parseFloat(indicadorNuevo.meta_global),
          temporalidad: indicadorNuevo.temporalidad,
          // unidad_periodo faltaba aquí: elegir Sexenio/Personalizado en
          // este wizard se perdía en silencio (el backend defaulteaba a
          // 'Anio') — bug real encontrado al agregar composicion/categorias.
          unidad_periodo: indicadorNuevo.unidad_periodo,
          anio_inicio: indicadorNuevo.temporalidad === 'Anual' ? indicadorNuevo.anio_inicio : null,
          anio_fin: indicadorNuevo.temporalidad === 'Anual' ? indicadorNuevo.anio_fin : null,
          metas_anuales: indicadorNuevo.temporalidad === 'Anual' ? indicadorNuevo.metas_anuales : [],
          composicion: indicadorNuevo.composicion,
          tipo_grafico: indicadorNuevo.tipo_grafico,
          categorias: indicadorNuevo.composicion === 'Categorias' ? indicadorNuevo.categorias : [],
          descripcion: indicadorNuevo.descripcion,
        });
        indicadorId = res.datos.id;
      }

      const nodo = nodoPreseleccionado || nodoFinal;
      if (nodo) {
        await indicadoresApi.crearAportacion(indicadorId, {
          tipo_nodo: nodo.tipo,
          id_nodo: nodo.id,
          valor_aportacion: valorAportacion === '' ? 0 : parseFloat(valorAportacion),
          modo: modoAportacion,
        });
      }

      mostrarToast('Indicador vinculado', 'exito');
      onVinculado?.();
    } catch (err) {
      setError(err.response?.data?.mensaje || 'No se pudo vincular el indicador');
      setGuardando(false);
    }
  }

  return createPortal((
    <div className="fixed inset-0 bg-black/40 z-[9999] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[88vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 flex-shrink-0">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-gray-900">Vincular indicador</h3>
            <div className="flex items-center gap-1 mt-0.5">
              {PASOS.map((p, i) => (
                <span key={p} className={`flex items-center gap-1 text-[10px] font-medium ${
                  paso === i + 1 ? 'text-guinda-700' : paso > i + 1 ? 'text-gray-400' : 'text-gray-300'
                }`}>
                  {paso > i + 1 && <Check size={10} />}
                  {i + 1}. {p}
                  {i < PASOS.length - 1 && <ChevronRight size={10} className="mx-0.5 text-gray-300" />}
                </span>
              ))}
            </div>
          </div>
          <button onClick={onCerrar} className="p-1 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100 flex-shrink-0"><X size={18} /></button>
        </div>

        <div className="px-5 py-4 overflow-y-auto space-y-3 flex-1">
          {/* ── Paso 1: dónde ── */}
          {paso === 1 && (
            <>
              <p className="text-xs font-semibold text-gray-700">¿Dónde vive este indicador?</p>
              {indicadorPreseleccionado && (
                <p className="text-[11px] text-gray-500">
                  Agregando un nodo que aporte a <strong>{indicadorPreseleccionado.nombre}</strong>.
                </p>
              )}

              {proyectoPreseleccionado ? (
                <div className="text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">
                  Proyecto: <strong>{proyectoPreseleccionado.nombre}</strong>
                </div>
              ) : (
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">Proyecto</label>
                  <select
                    value={proyecto?.id || ''}
                    onChange={e => {
                      const p = proyectosDisponibles.find(pr => pr.id === e.target.value);
                      setProyecto(p || null);
                      setEtapaId(''); setAccionId(''); setTareaId('');
                    }}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-guinda-400"
                  >
                    <option value="">— elige un proyecto —</option>
                    {proyectosDisponibles.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </select>
                </div>
              )}

              {cargandoProyecto && (
                <div className="flex items-center gap-2 text-xs text-gray-400 py-2"><Loader2 size={13} className="animate-spin" /> Cargando proyecto…</div>
              )}

              {nodoPreseleccionado ? (
                <div className="text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">
                  Nodo: <strong>{nodoPreseleccionado.nombre}</strong>
                </div>
              ) : proyecto && !cargandoProyecto && (
                <>
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-1">Etapa <span className="text-gray-400">(opcional — déjalo vacío para vincular a nivel proyecto)</span></label>
                    <select
                      value={etapaId}
                      onChange={e => { setEtapaId(e.target.value); setAccionId(''); setTareaId(''); }}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-guinda-400"
                    >
                      <option value="">— a nivel de todo el proyecto —</option>
                      {etapas.map(e => (
                        <option key={e.id} value={e.id} disabled={!puedeEditar('etapa', e.id)}>
                          {e.nombre}{!puedeEditar('etapa', e.id) ? ' (sin permiso)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {etapaId && (
                    <div>
                      <label className="block text-[11px] text-gray-500 mb-1">Acción <span className="text-gray-400">(opcional)</span></label>
                      <select
                        value={accionId}
                        onChange={e => { setAccionId(e.target.value); setTareaId(''); }}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-guinda-400"
                      >
                        <option value="">— a nivel de esta etapa —</option>
                        {acciones.map(a => (
                          <option key={a.id} value={a.id} disabled={!puedeEditar('accion', a.id)}>
                            {a.nombre}{!puedeEditar('accion', a.id) ? ' (sin permiso)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {accionId && subaccionesYTareas.length > 0 && (
                    <div>
                      <label className="block text-[11px] text-gray-500 mb-1">Subacción o tarea <span className="text-gray-400">(opcional)</span></label>
                      <select
                        value={tareaId}
                        onChange={e => setTareaId(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-guinda-400"
                      >
                        <option value="">— a nivel de esta acción —</option>
                        {subaccionesYTareas.map(s => (
                          <option key={s.id} value={s.id} disabled={!puedeEditar(s._tipo === 'tarea' ? 'tarea' : 'accion', s.id)}>
                            {s.nombre}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* ── Paso 2: qué ── */}
          {paso === 2 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-gray-700">¿Qué vas a medir?</p>
              {catalogoElegido ? (
                <div className="flex items-center justify-between gap-2 px-3 py-2.5 border border-guinda-200 bg-guinda-50/50 rounded-lg">
                  <span className="text-sm text-gray-800 truncate">{catalogoElegido.nombre}</span>
                  <button onClick={() => setMostrarCatalogo(true)} className="text-xs text-guinda-600 hover:underline flex-shrink-0">Cambiar</button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setMostrarCatalogo(true)}
                  className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-guinda-200 rounded-xl text-sm font-medium text-guinda-700 hover:bg-guinda-50 transition-colors"
                >
                  Elegir indicador del catálogo
                </button>
              )}

              {catalogoElegido && !indicadorExistente && (
                <CamposIndicadorProyecto
                  indicador={indicadorNuevo}
                  onCambio={(patch) => setIndicadorNuevo(prev => ({ ...prev, ...patch }))}
                  mostrarDescripcion={false}
                />
              )}
              {catalogoElegido && indicadorExistente && (
                <p className="text-[11px] text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                  Este proyecto ya tiene un indicador para "{catalogoElegido.nombre}" — se usará ese, no se crea uno nuevo.
                </p>
              )}
            </div>
          )}

          {/* ── Paso 3: cómo ── */}
          {paso === 3 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-gray-700">
                {(nodoPreseleccionado || nodoFinal) ? '¿Cómo aporta este nodo?' : 'Vinculando a nivel de todo el proyecto'}
              </p>
              {(nodoPreseleccionado || nodoFinal) ? (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setModoAportacion('al_concluir')}
                      className={`flex flex-col items-start gap-1 p-3 rounded-lg border text-left transition-colors ${
                        modoAportacion === 'al_concluir' ? 'border-guinda-300 bg-guinda-50/50' : 'border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <span className="flex items-center gap-1.5 text-sm font-medium text-gray-800"><PenLine size={13} /> Manual</span>
                      <span className="text-[11px] text-gray-500 leading-snug">Tú escribes el número. Cuenta cuando esto se complete.</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setModoAportacion('proporcional')}
                      className={`flex flex-col items-start gap-1 p-3 rounded-lg border text-left transition-colors ${
                        modoAportacion === 'proporcional' ? 'border-guinda-300 bg-guinda-50/50' : 'border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <span className="flex items-center gap-1.5 text-sm font-medium text-gray-800"><TrendingUp size={13} /> Automático</span>
                      <span className="text-[11px] text-gray-500 leading-snug">Se calcula solo, proporcional a su avance.</span>
                    </button>
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-1">
                      {modoAportacion === 'al_concluir' ? 'Cuánto aporta al completarse' : 'Cuánto aporta si llega al 100%'}
                    </label>
                    <input
                      type="number" step="any" min="0"
                      value={valorAportacion}
                      onChange={e => setValorAportacion(e.target.value)}
                      placeholder="0"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-guinda-400"
                    />
                  </div>
                </>
              ) : (
                <p className="text-[11px] text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                  No elegiste una etapa/acción/tarea específica, así que el indicador queda a nivel del proyecto — su valor se captura después, directamente.
                </p>
              )}
            </div>
          )}

          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded p-2 leading-snug">{error}</p>}
        </div>

        <div className="flex justify-between gap-2 px-5 py-3.5 border-t border-gray-100 flex-shrink-0">
          <button
            onClick={irAtras}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            {(paso > pasoInicial || (paso === 3 && indicadorPreseleccionado && pasoInicial === 1)) ? 'Atrás' : 'Cancelar'}
          </button>
          {paso === 1 && (
            <button
              onClick={irSiguienteDesdePaso1}
              disabled={!proyecto}
              className="px-4 py-2 text-sm font-medium text-white bg-guinda-700 rounded-lg disabled:opacity-50"
            >
              Siguiente
            </button>
          )}
          {paso === 2 && (catalogoElegido && !indicadorExistente) && (
            <button
              onClick={() => setPaso(3)}
              disabled={!indicadorNuevo.nombre.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-guinda-700 rounded-lg disabled:opacity-50"
            >
              Siguiente
            </button>
          )}
          {paso === 3 && (
            <button
              onClick={confirmarVinculo}
              disabled={guardando}
              className="px-4 py-2 text-sm font-medium text-white bg-guinda-700 rounded-lg disabled:opacity-50 flex items-center gap-2"
            >
              {guardando && <Loader2 size={14} className="animate-spin" />}
              Vincular
            </button>
          )}
        </div>
      </div>

      {mostrarCatalogo && (
        <SelectorIndicadorCatalogo
          onElegir={alElegirCatalogo}
          onCerrar={() => setMostrarCatalogo(false)}
          yaUsados={indicadoresProyecto.map(i => i.id_catalogo).filter(Boolean)}
        />
      )}
    </div>
  ), document.body);
}
