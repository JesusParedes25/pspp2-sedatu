/**
 * ARCHIVO: ModalEditarProyecto.jsx
 * PROPÓSITO: Modal completo para editar todos los campos de un proyecto,
 *            incluyendo indicadores propios (crear/editar/eliminar) y etiquetas.
 *
 * MINI-CLASE: Edición completa de proyecto
 * ─────────────────────────────────────────────────────────────────
 * Pre-carga todos los campos del proyecto existente. Permite modificar
 * información general, clasificación, DG líder, programa, fechas,
 * indicadores y etiquetas. Los indicadores nuevos se crean vía POST,
 * los existentes se actualizan vía PUT, y los eliminados vía DELETE.
 * ─────────────────────────────────────────────────────────────────
 */
import { useState, useEffect, useRef } from 'react';
import { X, Plus, Trash2, ChevronDown, ChevronUp, ImagePlus } from 'lucide-react';
import * as catalogosApi from '../../api/catalogos';
import * as proyectosApi from '../../api/proyectos';
import * as indicadoresApi from '../../api/indicadores';

const TIPOS_INDICADOR = [
  { valor: 'Avance_fisico', etiqueta: 'Avance físico' },
  { valor: 'Avance_financiero', etiqueta: 'Avance financiero' },
  { valor: 'Monto', etiqueta: 'Monto ($)' },
  { valor: 'Cobertura', etiqueta: 'Cobertura' },
  { valor: 'Beneficiarios', etiqueta: 'Beneficiarios' },
  { valor: 'Gestion', etiqueta: 'Gestión' },
  { valor: 'Otro', etiqueta: 'Otro' },
];

const UNIDADES_INDICADOR = [
  { valor: 'Porcentaje', etiqueta: '% (porcentaje)' },
  { valor: 'Moneda_MXN', etiqueta: '$ MXN (pesos)' },
  { valor: 'Numero', etiqueta: 'Número (personalizable)' },
];

const ACUMULACIONES = [
  { valor: 'Suma', etiqueta: 'Suma' },
  { valor: 'Ultimo_valor', etiqueta: 'Último valor' },
  { valor: 'Promedio', etiqueta: 'Promedio' },
];

const INDICADOR_NUEVO = () => ({
  _key: Date.now() + Math.random(),
  _esNuevo: true,
  nombre: '', tipo: 'Avance_fisico', unidad: 'Numero',
  unidad_personalizada: '', acumulacion: 'Suma',
  meta_global: '', temporalidad: 'Global',
  anio_inicio: new Date().getFullYear(), anio_fin: new Date().getFullYear(),
  metas_anuales: [], descripcion: '', _abierto: true,
});

export default function ModalEditarProyecto({ proyecto, onCerrar, onGuardado }) {
  const [dgs, setDgs]                       = useState([]);
  const [programas, setProgramas]           = useState([]);
  const [direccionesArea, setDireccionesArea] = useState([]);
  const [cargando, setCargando]             = useState(true);
  const [enviando, setEnviando]             = useState(false);
  const [textoEtiqueta, setTextoEtiqueta]   = useState('');
  const [imagenPortada, setImagenPortada]   = useState(null);
  const [previewPortada, setPreviewPortada] = useState(proyecto.imagen_url || null);
  const refEtiqueta = useRef(null);
  const refImagen   = useRef(null);

  const [datos, setDatos] = useState({
    nombre:                  proyecto.nombre || '',
    descripcion:             proyecto.descripcion || '',
    tipo:                    proyecto.tipo || 'Analisis_tecnico',
    meta_descripcion:        proyecto.meta_descripcion || '',
    es_prioritario:          proyecto.es_prioritario || false,
    ciclo_anual:             proyecto.ciclo_anual || false,
    dependencia_externa:     proyecto.dependencia_externa || false,
    descripcion_dependencia: proyecto.descripcion_dependencia || '',
    tiene_subproyectos:      proyecto.tiene_subproyectos || false,
    fecha_inicio:            proyecto.fecha_inicio ? proyecto.fecha_inicio.slice(0, 10) : '',
    fecha_limite:            proyecto.fecha_limite ? proyecto.fecha_limite.slice(0, 10) : '',
    id_dg_lider:             proyecto.id_dg_lider || '',
    id_direccion_area_lider: proyecto.id_direccion_area_lider || '',
    id_programa:             proyecto.id_programa || '',
    etiquetas:               [],
    indicadores:             [],
  });

  useEffect(() => {
    async function cargar() {
      try {
        const [resDgs, resProg, resDA, resEtiq, resInds] = await Promise.all([
          catalogosApi.obtenerDGs(),
          catalogosApi.obtenerProgramas(),
          catalogosApi.obtenerDireccionesArea(),
          proyectosApi.obtenerEtiquetasProyecto(proyecto.id),
          obtenerIndicadoresProyecto(proyecto.id),
        ]);
        setDgs(resDgs.datos || []);
        setProgramas(resProg.datos || []);
        setDireccionesArea(resDA.datos || []);
        const etiquetas = (resEtiq.datos || []).map(e => e.nombre);
        const indicadores = (resInds || []).map(ind => ({
          ...ind,
          _key: ind.id,
          _esNuevo: false,
          _abierto: false,
          metas_anuales: ind.metas_anuales || [],
        }));
        setDatos(prev => ({ ...prev, etiquetas, indicadores }));
      } catch (err) {
        console.error('Error cargando datos del modal:', err);
      } finally {
        setCargando(false);
      }
    }
    cargar();
  }, [proyecto.id]);

  async function obtenerIndicadoresProyecto(proyectoId) {
    try {
      const res = await indicadoresApi.obtenerIndicadoresProyecto(proyectoId);
      return res.datos || [];
    } catch { return []; }
  }

  function actualizar(campo, valor) {
    setDatos(prev => ({ ...prev, [campo]: valor }));
  }

  function seleccionarImagen(e) {
    const archivo = e.target.files[0];
    if (!archivo) return;
    setImagenPortada(archivo);
    setPreviewPortada(URL.createObjectURL(archivo));
  }

  function agregarIndicador() {
    setDatos(prev => ({ ...prev, indicadores: [...prev.indicadores, INDICADOR_NUEVO()] }));
  }

  function actualizarIndicador(key, campo, valor) {
    setDatos(prev => ({
      ...prev,
      indicadores: prev.indicadores.map(ind =>
        ind._key === key ? { ...ind, [campo]: valor } : ind
      ),
    }));
  }

  function toggleIndicador(key) {
    setDatos(prev => ({
      ...prev,
      indicadores: prev.indicadores.map(ind =>
        ind._key === key ? { ...ind, _abierto: !ind._abierto } : ind
      ),
    }));
  }

  function eliminarIndicador(key) {
    setDatos(prev => ({
      ...prev,
      indicadores: prev.indicadores.map(ind =>
        ind._key === key ? { ...ind, _eliminado: true, _abierto: false } : ind
      ),
    }));
  }

  function actualizarRangoAnual(key, inicio, fin, indicador) {
    const nuevas = [];
    for (let a = inicio; a <= fin; a++) {
      const existente = indicador.metas_anuales.find(m => m.anio === a);
      nuevas.push({ anio: a, meta: existente?.meta || '' });
    }
    actualizarIndicador(key, 'anio_inicio', inicio);
    actualizarIndicador(key, 'anio_fin', fin);
    setTimeout(() => actualizarIndicador(key, 'metas_anuales', nuevas), 0);
  }

  async function guardar() {
    if (!datos.nombre.trim() || enviando) return;
    setEnviando(true);
    try {
      await proyectosApi.actualizarProyecto(proyecto.id, {
        ...datos,
        indicadores: undefined,
      });

      // Imagen
      if (imagenPortada) {
        await proyectosApi.subirImagenProyecto(proyecto.id, imagenPortada);
      }

      // Indicadores: crear nuevos, actualizar existentes, eliminar marcados
      for (const ind of datos.indicadores) {
        if (ind._eliminado && !ind._esNuevo) {
          await indicadoresApi.eliminarIndicador(ind.id);
        } else if (ind._esNuevo && !ind._eliminado && ind.nombre.trim()) {
          await indicadoresApi.crearIndicador(proyecto.id, ind);
        } else if (!ind._esNuevo && !ind._eliminado && ind.nombre.trim()) {
          await indicadoresApi.actualizarIndicador(ind.id, ind);
        }
      }

      onGuardado && onGuardado();
      onCerrar();
    } catch (err) {
      alert(err.response?.data?.mensaje || 'Error al guardar el proyecto');
    } finally {
      setEnviando(false);
    }
  }

  const dasFiltradas = direccionesArea.filter(da => {
    if (!datos.id_dg_lider) return true;
    const dg = dgs.find(d => String(d.id) === String(datos.id_dg_lider));
    return dg && da.dg_siglas === dg.siglas;
  });

  const indicadoresVisibles = datos.indicadores.filter(ind => !ind._eliminado);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Editar proyecto</h2>
            <p className="text-xs text-gray-400 mt-0.5 truncate max-w-md">{proyecto.nombre}</p>
          </div>
          <button onClick={onCerrar} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X size={18} className="text-gray-400" />
          </button>
        </div>

        {/* Cuerpo scrollable */}
        {cargando ? (
          <div className="flex-1 flex items-center justify-center text-sm text-gray-400 animate-pulse p-8">
            Cargando datos del proyecto…
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

            {/* ── SECCIÓN: Información general ── */}
            <Section titulo="Información general">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del proyecto *</label>
                <input type="text" value={datos.nombre} onChange={e => actualizar('nombre', e.target.value)}
                  className="input-base" placeholder="Nombre del proyecto" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                <textarea value={datos.descripcion} onChange={e => actualizar('descripcion', e.target.value)}
                  rows={3} className="input-base resize-none" placeholder="Describe brevemente el proyecto…" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Imagen de encabezado <span className="text-gray-400 font-normal">(opcional)</span></label>
                {previewPortada ? (
                  <div className="relative h-28 rounded-lg overflow-hidden border border-gray-200">
                    <img src={previewPortada} alt="Preview" className="w-full h-full object-cover" />
                    <button type="button"
                      onClick={() => { setImagenPortada(null); setPreviewPortada(null); if (refImagen.current) refImagen.current.value = ''; }}
                      className="absolute top-2 right-2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1">
                      <X size={13} />
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => refImagen.current?.click()}
                    className="flex items-center gap-2 w-full h-20 border-2 border-dashed border-gray-300 hover:border-guinda-400 rounded-lg justify-center text-sm text-gray-400 hover:text-guinda-500 transition-colors">
                    <ImagePlus size={18} /> Seleccionar imagen
                  </button>
                )}
                <input ref={refImagen} type="file" accept="image/*" onChange={seleccionarImagen} className="hidden" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de inicio</label>
                  <input type="date" value={datos.fecha_inicio} onChange={e => actualizar('fecha_inicio', e.target.value)} className="input-base" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fecha límite</label>
                  <input type="date" value={datos.fecha_limite} onChange={e => actualizar('fecha_limite', e.target.value)} className="input-base" />
                </div>
              </div>
            </Section>

            {/* ── SECCIÓN: Clasificación ── */}
            <Section titulo="Clasificación">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de proyecto</label>
                <select value={datos.tipo} onChange={e => actualizar('tipo', e.target.value)} className="input-base">
                  <option value="Analisis_tecnico">Análisis técnico</option>
                  <option value="Obra_fisica">Obra física</option>
                  <option value="Programa_masivo">Programa masivo</option>
                  <option value="Regularizacion">Regularización</option>
                  <option value="Proceso_recurrente">Proceso recurrente</option>
                  <option value="Instrumento_planeacion">Instrumento de planeación</option>
                  <option value="Conflicto_agrario">Conflicto agrario</option>
                  <option value="Otro">Otro</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Meta del proyecto</label>
                <textarea value={datos.meta_descripcion} onChange={e => actualizar('meta_descripcion', e.target.value)}
                  rows={2} className="input-base resize-none" placeholder="Ej: Regularizar 92 ZMs a nivel nacional…" />
              </div>
              <div className="flex flex-col gap-2.5">
                {[
                  ['es_prioritario', 'Proyecto prioritario'],
                  ['ciclo_anual', 'Ciclo anual (se repite cada año)'],
                  ['tiene_subproyectos', 'Tiene subproyectos'],
                  ['dependencia_externa', 'Depende de entidad externa'],
                ].map(([campo, etiqueta]) => (
                  <label key={campo} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={!!datos[campo]} onChange={e => actualizar(campo, e.target.checked)}
                      className="rounded border-gray-300 text-guinda-500 focus:ring-guinda-500" />
                    <span className="text-sm text-gray-700">{etiqueta}</span>
                  </label>
                ))}
              </div>
              {datos.dependencia_externa && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Descripción de la dependencia</label>
                  <input type="text" value={datos.descripcion_dependencia}
                    onChange={e => actualizar('descripcion_dependencia', e.target.value)}
                    className="input-base" placeholder="Ej: Requiere aprobación de CONAGUA" />
                </div>
              )}
            </Section>

            {/* ── SECCIÓN: Organización ── */}
            <Section titulo="Organización">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">DG Líder</label>
                <select value={datos.id_dg_lider} onChange={e => actualizar('id_dg_lider', e.target.value)} className="input-base">
                  <option value="">Seleccionar DG…</option>
                  {dgs.map(dg => <option key={dg.id} value={dg.id}>{dg.siglas} — {dg.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Dirección de área líder</label>
                <select value={datos.id_direccion_area_lider} onChange={e => actualizar('id_direccion_area_lider', e.target.value)} className="input-base">
                  <option value="">Sin especificar</option>
                  {dasFiltradas.map(da => <option key={da.id} value={da.id}>{da.siglas} — {da.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Programa presupuestario</label>
                <select value={datos.id_programa} onChange={e => actualizar('id_programa', e.target.value)} className="input-base">
                  <option value="">Sin programa específico</option>
                  {(() => {
                    const dg = dgs.find(d => String(d.id) === String(datos.id_dg_lider));
                    const siglas = dg?.siglas || '';
                    const relacionados = programas.filter(p => siglas && p.unidad_responsable?.includes(siglas));
                    const otros = programas.filter(p => !relacionados.includes(p));
                    return (
                      <>
                        {relacionados.length > 0 && (
                          <optgroup label={`Programas de ${siglas}`}>
                            {relacionados.map(p => <option key={p.id} value={p.id}>{p.clave} — {p.nombre}</option>)}
                          </optgroup>
                        )}
                        <optgroup label={relacionados.length > 0 ? 'Otros programas' : 'Programas presupuestarios'}>
                          {otros.map(p => <option key={p.id} value={p.id}>{p.clave} — {p.nombre}</option>)}
                        </optgroup>
                      </>
                    );
                  })()}
                </select>
                {datos.id_programa && (() => {
                  const prog = programas.find(p => String(p.id) === String(datos.id_programa));
                  if (!prog) return null;
                  return (
                    <div className="mt-1.5 px-3 py-2 bg-gray-50 rounded-lg text-xs text-gray-500 space-y-0.5">
                      {prog.unidad_responsable && <p><span className="font-medium text-gray-600">UR:</span> {prog.unidad_responsable}</p>}
                      {prog.descripcion && <p>{prog.descripcion}</p>}
                    </div>
                  );
                })()}
              </div>
            </Section>

            {/* ── SECCIÓN: Indicadores ── */}
            <Section titulo="Indicadores">
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-400">Indicadores cuantitativos de avance del proyecto.</p>
                <button type="button" onClick={agregarIndicador}
                  className="text-xs text-guinda-600 hover:text-guinda-700 font-medium flex items-center gap-1">
                  <Plus size={13} /> Agregar
                </button>
              </div>
              {indicadoresVisibles.length === 0 && (
                <p className="text-xs text-gray-300 italic text-center py-3">Sin indicadores. Usa el botón para agregar.</p>
              )}
              <div className="space-y-2">
                {indicadoresVisibles.map(ind => (
                  <FilaIndicador key={ind._key} indicador={ind}
                    onCambio={(campo, valor) => actualizarIndicador(ind._key, campo, valor)}
                    onToggle={() => toggleIndicador(ind._key)}
                    onEliminar={() => eliminarIndicador(ind._key)}
                    onRangoAnual={(ini, fin) => actualizarRangoAnual(ind._key, ini, fin, ind)}
                  />
                ))}
              </div>
            </Section>

            {/* ── SECCIÓN: Etiquetas ── */}
            <Section titulo="Etiquetas">
              <div className="flex flex-wrap gap-1.5 p-2 input-base min-h-[42px] cursor-text"
                onClick={() => refEtiqueta.current?.focus()}>
                {datos.etiquetas.map((et, i) => (
                  <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-guinda-50 text-guinda-700 text-xs rounded-full">
                    {et}
                    <button type="button"
                      onClick={e => { e.stopPropagation(); actualizar('etiquetas', datos.etiquetas.filter((_, j) => j !== i)); }}
                      className="text-guinda-400 hover:text-guinda-600 text-sm leading-none">&times;</button>
                  </span>
                ))}
                <input ref={refEtiqueta} type="text" value={textoEtiqueta}
                  onChange={e => setTextoEtiqueta(e.target.value)}
                  onKeyDown={e => {
                    if ((e.key === 'Enter' || e.key === ',') && textoEtiqueta.trim()) {
                      e.preventDefault();
                      const nueva = textoEtiqueta.trim().replace(/,$/, '');
                      if (nueva && !datos.etiquetas.includes(nueva))
                        actualizar('etiquetas', [...datos.etiquetas, nueva]);
                      setTextoEtiqueta('');
                    }
                    if (e.key === 'Backspace' && !textoEtiqueta && datos.etiquetas.length > 0)
                      actualizar('etiquetas', datos.etiquetas.slice(0, -1));
                  }}
                  onBlur={() => {
                    if (textoEtiqueta.trim()) {
                      const nueva = textoEtiqueta.trim();
                      if (!datos.etiquetas.includes(nueva))
                        actualizar('etiquetas', [...datos.etiquetas, nueva]);
                      setTextoEtiqueta('');
                    }
                  }}
                  className="flex-1 min-w-[120px] border-none outline-none text-sm bg-transparent p-0"
                  placeholder={datos.etiquetas.length === 0 ? 'Escribe y presiona Enter…' : ''}
                />
              </div>
              <p className="text-xs text-gray-400">Presiona Enter o coma para agregar</p>
            </Section>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 flex-shrink-0 bg-white">
          <button type="button" onClick={onCerrar} className="btn-secondary">Cancelar</button>
          <button type="button" onClick={guardar} disabled={enviando || !datos.nombre.trim()}
            className="btn-primary">
            {enviando ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ titulo, children }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-700 mb-3 pb-1.5 border-b border-gray-100">{titulo}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function FilaIndicador({ indicador, onCambio, onToggle, onEliminar, onRangoAnual }) {
  const etiquetaTipo = TIPOS_INDICADOR.find(t => t.valor === indicador.tipo)?.etiqueta || indicador.tipo;
  const etiquetaUnidad = indicador.unidad === 'Porcentaje' ? '%'
    : indicador.unidad === 'Moneda_MXN' ? '$MXN' : indicador.unidad_personalizada || '#';

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 cursor-pointer" onClick={onToggle}>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-bold text-guinda-500 flex-shrink-0">{indicador._esNuevo ? '✦' : '#'}</span>
          <span className="text-sm font-medium text-gray-800 truncate">
            {indicador.nombre || 'Nuevo indicador'}
          </span>
          {indicador.meta_global && (
            <span className="text-xs text-gray-400 flex-shrink-0">
              — meta: {Number(indicador.meta_global).toLocaleString()} {etiquetaUnidad}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">{etiquetaTipo}</span>
          <button type="button" onClick={e => { e.stopPropagation(); onEliminar(); }}
            className="text-gray-400 hover:text-red-500 p-0.5 rounded">
            <Trash2 size={13} />
          </button>
          {indicador._abierto ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
        </div>
      </div>

      {indicador._abierto && (
        <div className="p-4 space-y-3 border-t border-gray-100">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
            <input type="text" value={indicador.nombre} onChange={e => onCambio('nombre', e.target.value)}
              className="input-base text-sm" placeholder="Ej: Viviendas regularizadas…" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
              <select value={indicador.tipo} onChange={e => onCambio('tipo', e.target.value)} className="input-base text-sm">
                {TIPOS_INDICADOR.map(t => <option key={t.valor} value={t.valor}>{t.etiqueta}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unidad</label>
              <select value={indicador.unidad} onChange={e => onCambio('unidad', e.target.value)} className="input-base text-sm">
                {UNIDADES_INDICADOR.map(u => <option key={u.valor} value={u.valor}>{u.etiqueta}</option>)}
              </select>
            </div>
          </div>
          {indicador.unidad === 'Numero' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Etiqueta de unidad</label>
              <input type="text" value={indicador.unidad_personalizada} onChange={e => onCambio('unidad_personalizada', e.target.value)}
                className="input-base text-sm" placeholder="Ej: viviendas, ZMs, hectáreas…" />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Meta global *</label>
              <input type="number" step="any" value={indicador.meta_global} onChange={e => onCambio('meta_global', e.target.value)}
                className="input-base text-sm" placeholder="0" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Acumulación</label>
              <select value={indicador.acumulacion} onChange={e => onCambio('acumulacion', e.target.value)} className="input-base text-sm">
                {ACUMULACIONES.map(a => <option key={a.valor} value={a.valor}>{a.etiqueta}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Temporalidad</label>
            <div className="flex gap-4">
              {[['Global', 'Meta global'], ['Anual', 'Por ejercicio fiscal']].map(([val, lbl]) => (
                <label key={val} className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
                  <input type="radio" checked={indicador.temporalidad === val}
                    onChange={() => {
                      onCambio('temporalidad', val);
                      if (val === 'Anual' && !indicador.metas_anuales.length)
                        onRangoAnual(indicador.anio_inicio, indicador.anio_fin);
                    }}
                    className="text-guinda-500 focus:ring-guinda-500" />
                  {lbl}
                </label>
              ))}
            </div>
          </div>
          {indicador.temporalidad === 'Anual' && (
            <div className="space-y-2 pl-4 border-l-2 border-blue-200">
              <div className="flex gap-3 items-end">
                {[['Año inicio', indicador.anio_inicio, v => onRangoAnual(Number(v), indicador.anio_fin)],
                  ['Año fin', indicador.anio_fin, v => onRangoAnual(indicador.anio_inicio, Number(v))]].map(([lbl, val, fn]) => (
                  <div key={lbl}>
                    <label className="block text-xs text-gray-500 mb-0.5">{lbl}</label>
                    <input type="number" value={val} onChange={e => fn(e.target.value)}
                      className="input-base text-sm w-24" min="2020" max="2040" />
                  </div>
                ))}
              </div>
              {indicador.metas_anuales.map((ma, mi) => (
                <div key={ma.anio} className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-10">{ma.anio}:</span>
                  <input type="number" step="any" value={ma.meta}
                    onChange={e => {
                      const copia = [...indicador.metas_anuales];
                      copia[mi] = { ...copia[mi], meta: e.target.value };
                      onCambio('metas_anuales', copia);
                    }}
                    className="input-base text-sm flex-1" placeholder="Meta para este año" />
                </div>
              ))}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descripción (opcional)</label>
            <input type="text" value={indicador.descripcion} onChange={e => onCambio('descripcion', e.target.value)}
              className="input-base text-sm" placeholder="Contexto o fórmula de cálculo…" />
          </div>
        </div>
      )}
    </div>
  );
}
