/**
 * ARCHIVO: NuevoProyecto.jsx
 * PROPÓSITO: Formulario de 4 pasos para crear un nuevo proyecto.
 *
 * MINI-CLASE: Formularios multi-paso con estado local
 * ─────────────────────────────────────────────────────────────────
 * Un formulario multi-paso divide un formulario largo en secciones
 * manejables. El estado de TODOS los campos se mantiene en un solo
 * objeto (datos). Los pasos son: (1) Info general, (2) Clasificación
 * y meta, (3) Indicador y etiquetas, (4) DGs participantes. Al
 * final, se envía TODO el objeto datos al backend con una sola
 * petición POST. Si el usuario regresa a un paso anterior, los
 * datos ya ingresados se mantienen.
 * ─────────────────────────────────────────────────────────────────
 */
import { useState, useEffect, useRef } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useUI } from '../../context/UIContext';
import { useAuth } from '../../context/AuthContext';
import { usePermisosGlobales } from '../../hooks/usePermisos';
import * as proyectosApi from '../../api/proyectos';
import * as catalogosApi from '../../api/catalogos';

const PASOS = [
  'Información general',
  'Clasificación y meta',
  'Indicadores y etiquetas',
  'Revisión y crear'
];

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
  { valor: 'Suma', etiqueta: 'Suma — los valores se acumulan' },
  { valor: 'Ultimo_valor', etiqueta: 'Último valor — solo cuenta el más reciente' },
  { valor: 'Promedio', etiqueta: 'Promedio — media de los valores' },
];

const INDICADOR_NUEVO = () => ({
  nombre: '', tipo: 'Avance_fisico', unidad: 'Numero',
  unidad_personalizada: '', acumulacion: 'Suma',
  meta_global: '', temporalidad: 'Global',
  anio_inicio: new Date().getFullYear(), anio_fin: new Date().getFullYear(),
  metas_anuales: [], descripcion: '', _abierto: true
});

export default function NuevoProyecto() {
  const navigate = useNavigate();
  const { mostrarToast } = useUI();
  const { usuario } = useAuth();
  const { puedeCrearProyecto } = usePermisosGlobales();
  const [pasoActual, setPasoActual] = useState(0);
  const [enviando, setEnviando] = useState(false);

  // Catálogos para selects
  const [dgs, setDgs] = useState([]);
  const [programas, setProgramas] = useState([]);
  const [direccionesArea, setDireccionesArea] = useState([]);

  // Datos del formulario
  const [datos, setDatos] = useState({
    nombre: '',
    descripcion: '',
    tipo: 'Analisis_tecnico',
    meta_descripcion: '',
    indicadores: [],
    es_prioritario: false,
    ciclo_anual: false,
    dependencia_externa: false,
    descripcion_dependencia: '',
    tiene_subproyectos: false,
    fecha_inicio: '',
    fecha_limite: '',
    id_dg_lider: usuario?.id_dg || '',
    id_direccion_area_lider: usuario?.id_direccion_area || '',
    id_programa: '',
    etiquetas: [],
  });

  // Estado local para el input de etiquetas (texto crudo)
  const [textoEtiqueta, setTextoEtiqueta] = useState('');
  const refEtiqueta = useRef(null);

  // Cargar catálogos al montar
  useEffect(() => {
    async function cargarCatalogos() {
      try {
        const [resDgs, resProg, resDA] = await Promise.all([
          catalogosApi.obtenerDGs(),
          catalogosApi.obtenerProgramas(),
          catalogosApi.obtenerDireccionesArea()
        ]);
        setDgs(resDgs.datos);
        setProgramas(resProg.datos);
        setDireccionesArea(resDA.datos);
      } catch (err) {
        console.error('Error cargando catálogos:', err);
      }
    }
    cargarCatalogos();
  }, []);

  // Operativo no puede crear proyectos
  if (!puedeCrearProyecto) return <Navigate to="/proyectos" replace />;

  // Actualizar un campo del formulario
  function actualizar(campo, valor) {
    setDatos(prev => ({ ...prev, [campo]: valor }));
  }

  // Navegar entre pasos
  function siguiente() {
    if (pasoActual < PASOS.length - 1) setPasoActual(prev => prev + 1);
  }
  function anterior() {
    if (pasoActual > 0) setPasoActual(prev => prev - 1);
  }

  // Enviar formulario
  async function crearProyecto() {
    setEnviando(true);
    try {
      const respuesta = await proyectosApi.crearProyecto(datos);
      mostrarToast('Proyecto creado exitosamente', 'exito');
      navigate(`/proyectos/${respuesta.datos.id}`);
    } catch (err) {
      mostrarToast(err.response?.data?.mensaje || 'Error al crear proyecto', 'error');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Título */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Nuevo proyecto</h1>
        <p className="text-sm text-gray-500 mt-1">Completa la información en {PASOS.length} pasos</p>
      </div>

      {/* Indicador de pasos */}
      <div className="flex items-center gap-2">
        {PASOS.map((paso, indice) => (
          <div key={indice} className="flex items-center gap-2 flex-1">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
              indice < pasoActual ? 'bg-green-500 text-white'
                : indice === pasoActual ? 'bg-guinda-500 text-white'
                : 'bg-gray-200 text-gray-500'
            }`}>
              {indice < pasoActual ? '✓' : indice + 1}
            </div>
            <span className={`text-xs hidden sm:block ${indice === pasoActual ? 'text-guinda-600 font-medium' : 'text-gray-400'}`}>
              {paso}
            </span>
            {indice < PASOS.length - 1 && <div className="flex-1 h-px bg-gray-200" />}
          </div>
        ))}
      </div>

      {/* Contenido del paso actual */}
      <div className="card p-6">
        {pasoActual === 0 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Información general</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del proyecto *</label>
              <input type="text" value={datos.nombre} onChange={e => actualizar('nombre', e.target.value)}
                placeholder="Ej: Programa Nacional de Regularización de Lotes" className="input-base" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
              <textarea value={datos.descripcion} onChange={e => actualizar('descripcion', e.target.value)}
                rows={3} className="input-base resize-none" placeholder="Describe brevemente el proyecto..." />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de inicio</label>
                <input type="date" value={datos.fecha_inicio} onChange={e => actualizar('fecha_inicio', e.target.value)} className="input-base" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha límite</label>
                <input type="date" value={datos.fecha_limite} onChange={e => actualizar('fecha_limite', e.target.value)} className="input-base" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">DG Líder</label>
              <select value={datos.id_dg_lider} onChange={e => actualizar('id_dg_lider', e.target.value)} className="input-base">
                <option value="">Seleccionar DG...</option>
                {dgs.map(dg => <option key={dg.id} value={dg.id}>{dg.siglas} — {dg.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Dirección de área líder</label>
              <select value={datos.id_direccion_area_lider} onChange={e => actualizar('id_direccion_area_lider', e.target.value)} className="input-base">
                <option value="">Seleccionar dirección de área...</option>
                {direccionesArea.filter(da => !datos.id_dg_lider || da.dg_siglas === dgs.find(d => d.id === datos.id_dg_lider)?.siglas).map(da => (
                  <option key={da.id} value={da.id}>{da.siglas} — {da.nombre}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {pasoActual === 1 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Clasificación y meta</h2>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Descripción de la meta</label>
              <textarea value={datos.meta_descripcion} onChange={e => actualizar('meta_descripcion', e.target.value)}
                rows={2} className="input-base resize-none" placeholder="Ej: Regularizar 92 ZMs a nivel nacional..." />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Programa presupuestario</label>
              <select value={datos.id_programa} onChange={e => actualizar('id_programa', e.target.value)} className="input-base">
                <option value="">Sin programa específico</option>
                {(() => {
                  // Separar programas relacionados con la DG del usuario vs el resto
                  const dgUsuario = dgs.find(d => d.id === (datos.id_dg_lider || usuario?.id_dg));
                  const siglasUsuario = dgUsuario?.siglas || '';
                  const relacionados = programas.filter(p => p.unidad_responsable && siglasUsuario && p.unidad_responsable.includes(siglasUsuario));
                  const otros = programas.filter(p => !relacionados.includes(p));

                  return (
                    <>
                      {relacionados.length > 0 && (
                        <optgroup label={`Programas de ${siglasUsuario}`}>
                          {relacionados.map(p => (
                            <option key={p.id} value={p.id}>{p.clave} — {p.nombre}</option>
                          ))}
                        </optgroup>
                      )}
                      <optgroup label={relacionados.length > 0 ? 'Otros programas' : 'Programas presupuestarios'}>
                        {otros.map(p => (
                          <option key={p.id} value={p.id}>{p.clave} — {p.nombre}</option>
                        ))}
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
            <div className="flex flex-col gap-3">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={datos.es_prioritario} onChange={e => actualizar('es_prioritario', e.target.checked)} className="rounded border-gray-300 text-guinda-500 focus:ring-guinda-500" />
                <span className="text-sm text-gray-700">Es proyecto prioritario</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={datos.ciclo_anual} onChange={e => actualizar('ciclo_anual', e.target.checked)} className="rounded border-gray-300 text-guinda-500 focus:ring-guinda-500" />
                <span className="text-sm text-gray-700">Ciclo anual (se repite cada año)</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={datos.tiene_subproyectos} onChange={e => actualizar('tiene_subproyectos', e.target.checked)} className="rounded border-gray-300 text-guinda-500 focus:ring-guinda-500" />
                <span className="text-sm text-gray-700">Tiene subproyectos</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={datos.dependencia_externa} onChange={e => actualizar('dependencia_externa', e.target.checked)} className="rounded border-gray-300 text-guinda-500 focus:ring-guinda-500" />
                <span className="text-sm text-gray-700">Depende de entidad externa</span>
              </label>
            </div>
            {datos.dependencia_externa && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descripción de la dependencia externa</label>
                <input type="text" value={datos.descripcion_dependencia} onChange={e => actualizar('descripcion_dependencia', e.target.value)}
                  className="input-base" placeholder="Ej: Requiere aprobación de CONAGUA" />
              </div>
            )}
          </div>
        )}

        {pasoActual === 2 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-gray-900">Indicadores y etiquetas</h2>

            {/* ─── Indicadores ─── */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-gray-700">Indicadores cuantitativos</p>
                <button type="button" onClick={() => actualizar('indicadores', [...datos.indicadores, INDICADOR_NUEVO()])}
                  className="text-xs text-guinda-600 hover:text-guinda-700 font-medium flex items-center gap-1">
                  <span className="text-base leading-none">+</span> Agregar indicador
                </button>
              </div>

              {datos.indicadores.length === 0 && (
                <p className="text-xs text-gray-400 italic">Sin indicadores. Puedes agregar uno o más indicadores de avance, financieros, cobertura, etc.</p>
              )}

              <div className="space-y-3">
                {datos.indicadores.map((ind, idx) => (
                  <FormIndicador key={idx} indicador={ind} indice={idx}
                    onChange={(campo, valor) => {
                      const copia = [...datos.indicadores];
                      copia[idx] = { ...copia[idx], [campo]: valor };
                      actualizar('indicadores', copia);
                    }}
                    onEliminar={() => actualizar('indicadores', datos.indicadores.filter((_, i) => i !== idx))}
                    onToggle={() => {
                      const copia = [...datos.indicadores];
                      copia[idx] = { ...copia[idx], _abierto: !copia[idx]._abierto };
                      actualizar('indicadores', copia);
                    }}
                  />
                ))}
              </div>
            </div>

            {/* ─── Etiquetas (chip input) ─── */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Etiquetas</label>
              <div className="flex flex-wrap gap-1.5 p-2 input-base min-h-[42px] cursor-text" onClick={() => refEtiqueta.current?.focus()}>
                {datos.etiquetas.map((et, i) => (
                  <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-guinda-50 text-guinda-700 text-xs rounded-full">
                    {et}
                    <button type="button" onClick={e => { e.stopPropagation(); actualizar('etiquetas', datos.etiquetas.filter((_, j) => j !== i)); }}
                      className="text-guinda-400 hover:text-guinda-600 leading-none text-sm">&times;</button>
                  </span>
                ))}
                <input ref={refEtiqueta} type="text" value={textoEtiqueta}
                  onChange={e => setTextoEtiqueta(e.target.value)}
                  onKeyDown={e => {
                    if ((e.key === 'Enter' || e.key === ',') && textoEtiqueta.trim()) {
                      e.preventDefault();
                      const nueva = textoEtiqueta.trim().replace(/,$/, '');
                      if (nueva && !datos.etiquetas.includes(nueva)) {
                        actualizar('etiquetas', [...datos.etiquetas, nueva]);
                      }
                      setTextoEtiqueta('');
                    }
                    if (e.key === 'Backspace' && !textoEtiqueta && datos.etiquetas.length > 0) {
                      actualizar('etiquetas', datos.etiquetas.slice(0, -1));
                    }
                  }}
                  onBlur={() => {
                    if (textoEtiqueta.trim()) {
                      const nueva = textoEtiqueta.trim();
                      if (!datos.etiquetas.includes(nueva)) {
                        actualizar('etiquetas', [...datos.etiquetas, nueva]);
                      }
                      setTextoEtiqueta('');
                    }
                  }}
                  className="flex-1 min-w-[120px] border-none outline-none text-sm bg-transparent p-0"
                  placeholder={datos.etiquetas.length === 0 ? 'Escribe y presiona Enter...' : ''}
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">Presiona Enter o coma para agregar</p>
            </div>
          </div>
        )}

        {pasoActual === 3 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Revisión</h2>
            <p className="text-sm text-gray-500 mb-4">Verifica que la información sea correcta antes de crear el proyecto.</p>
            <div className="space-y-3 text-sm">
              <ResumenCampo titulo="Nombre" valor={datos.nombre} />
              <ResumenCampo titulo="Tipo" valor={datos.tipo?.replace(/_/g, ' ')} />
              <ResumenCampo titulo="DG Líder" valor={dgs.find(d => String(d.id) === String(datos.id_dg_lider))?.siglas || 'No seleccionada'} />
              <ResumenCampo titulo="Fechas" valor={`${datos.fecha_inicio || '—'} a ${datos.fecha_limite || '—'}`} />
              <ResumenCampo titulo="Programa" valor={(() => { const p = programas.find(pr => String(pr.id) === String(datos.id_programa)); return p ? `${p.clave} — ${p.nombre}` : 'Sin programa específico'; })()} />
              <ResumenCampo titulo="Meta" valor={datos.meta_descripcion || 'Sin descripción'} />
              <ResumenCampo titulo="Indicadores" valor={datos.indicadores.length > 0 ? `${datos.indicadores.length} indicador(es)` : 'Ninguno'} />
              {datos.indicadores.map((ind, i) => (
                <div key={i} className="pl-6 text-xs text-gray-500">
                  <span className="font-medium text-gray-700">{ind.nombre || '(sin nombre)'}:</span>{' '}
                  meta {ind.meta_global} {ind.unidad === 'Porcentaje' ? '%' : ind.unidad === 'Moneda_MXN' ? 'MXN' : ind.unidad_personalizada || ''}
                  {ind.temporalidad === 'Anual' && ` (${ind.anio_inicio}–${ind.anio_fin})`}
                </div>
              ))}
              <ResumenCampo titulo="Prioritario" valor={datos.es_prioritario ? 'Sí' : 'No'} />
              {datos.etiquetas.length > 0 && <ResumenCampo titulo="Etiquetas" valor={datos.etiquetas.join(', ')} />}
            </div>
          </div>
        )}
      </div>

      {/* Botones de navegación */}
      <div className="flex justify-between">
        <button onClick={anterior} disabled={pasoActual === 0} className="btn-secondary disabled:opacity-50">
          Anterior
        </button>
        {pasoActual < PASOS.length - 1 ? (
          <button onClick={siguiente} className="btn-primary">Siguiente</button>
        ) : (
          <button onClick={crearProyecto} disabled={enviando || !datos.nombre} className="btn-verde">
            {enviando ? 'Creando...' : 'Crear proyecto'}
          </button>
        )}
      </div>
    </div>
  );
}

// Sub-componente para mostrar un campo en la revisión
function ResumenCampo({ titulo, valor }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-gray-500 font-medium w-28 flex-shrink-0">{titulo}:</span>
      <span className="text-gray-900">{valor}</span>
    </div>
  );
}

// Sub-componente: formulario inline de un indicador (colapsable)
function FormIndicador({ indicador, indice, onChange, onEliminar, onToggle }) {
  const etiquetaTipo = TIPOS_INDICADOR.find(t => t.valor === indicador.tipo)?.etiqueta || indicador.tipo;
  const etiquetaUnidad = indicador.unidad === 'Porcentaje' ? '%' : indicador.unidad === 'Moneda_MXN' ? '$MXN' : indicador.unidad_personalizada || '#';

  // Generar filas de metas anuales cuando cambia temporalidad o rango
  function actualizarRangoAnual(inicio, fin) {
    onChange('anio_inicio', inicio);
    onChange('anio_fin', fin);
    const nuevas = [];
    for (let a = inicio; a <= fin; a++) {
      const existente = indicador.metas_anuales.find(m => m.anio === a);
      nuevas.push({ anio: a, meta: existente?.meta || '' });
    }
    // Usamos setTimeout para evitar conflicto de setState batching
    setTimeout(() => onChange('metas_anuales', nuevas), 0);
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Header colapsable */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 cursor-pointer" onClick={onToggle}>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-bold text-guinda-500 flex-shrink-0">#{indice + 1}</span>
          <span className="text-sm font-medium text-gray-800 truncate">
            {indicador.nombre || 'Nuevo indicador'}
          </span>
          {indicador.meta_global && (
            <span className="text-xs text-gray-400 flex-shrink-0">— meta: {indicador.meta_global} {etiquetaUnidad}</span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">{etiquetaTipo}</span>
          <button type="button" onClick={e => { e.stopPropagation(); onEliminar(); }}
            className="text-gray-400 hover:text-red-500 text-sm">✕</button>
          <span className="text-gray-400 text-xs">{indicador._abierto ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* Cuerpo expandido */}
      {indicador._abierto && (
        <div className="p-4 space-y-3 border-t border-gray-100">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nombre del indicador *</label>
            <input type="text" value={indicador.nombre} onChange={e => onChange('nombre', e.target.value)}
              className="input-base text-sm" placeholder="Ej: Viviendas construidas, Presupuesto ejercido..." />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tipo</label>
              <select value={indicador.tipo} onChange={e => onChange('tipo', e.target.value)} className="input-base text-sm">
                {TIPOS_INDICADOR.map(t => <option key={t.valor} value={t.valor}>{t.etiqueta}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Unidad de medida</label>
              <select value={indicador.unidad} onChange={e => onChange('unidad', e.target.value)} className="input-base text-sm">
                {UNIDADES_INDICADOR.map(u => <option key={u.valor} value={u.valor}>{u.etiqueta}</option>)}
              </select>
            </div>
          </div>

          {indicador.unidad === 'Numero' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Etiqueta de la unidad</label>
              <input type="text" value={indicador.unidad_personalizada} onChange={e => onChange('unidad_personalizada', e.target.value)}
                className="input-base text-sm" placeholder="Ej: viviendas, hectáreas, ZMs, expedientes..." />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Meta global *</label>
              <input type="number" step="any" value={indicador.meta_global} onChange={e => onChange('meta_global', e.target.value)}
                className="input-base text-sm" placeholder={indicador.unidad === 'Porcentaje' ? '100' : indicador.unidad === 'Moneda_MXN' ? '150000000' : '500'} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Acumulación</label>
              <select value={indicador.acumulacion} onChange={e => onChange('acumulacion', e.target.value)} className="input-base text-sm">
                {ACUMULACIONES.map(a => <option key={a.valor} value={a.valor}>{a.etiqueta}</option>)}
              </select>
            </div>
          </div>

          {/* Temporalidad */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Temporalidad</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-1.5 text-sm text-gray-700">
                <input type="radio" checked={indicador.temporalidad === 'Global'}
                  onChange={() => onChange('temporalidad', 'Global')}
                  className="text-guinda-500 focus:ring-guinda-500" />
                Meta global (sin desglose anual)
              </label>
              <label className="flex items-center gap-1.5 text-sm text-gray-700">
                <input type="radio" checked={indicador.temporalidad === 'Anual'}
                  onChange={() => {
                    onChange('temporalidad', 'Anual');
                    if (!indicador.metas_anuales.length) {
                      actualizarRangoAnual(indicador.anio_inicio, indicador.anio_fin);
                    }
                  }}
                  className="text-guinda-500 focus:ring-guinda-500" />
                Metas por ejercicio fiscal
              </label>
            </div>
          </div>

          {indicador.temporalidad === 'Anual' && (
            <div className="space-y-2 pl-4 border-l-2 border-blue-200">
              <div className="flex gap-3 items-end">
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">Año inicio</label>
                  <input type="number" value={indicador.anio_inicio}
                    onChange={e => actualizarRangoAnual(Number(e.target.value), indicador.anio_fin)}
                    className="input-base text-sm w-24" min="2020" max="2040" />
                </div>
                <span className="text-gray-400 pb-2">—</span>
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">Año fin</label>
                  <input type="number" value={indicador.anio_fin}
                    onChange={e => actualizarRangoAnual(indicador.anio_inicio, Number(e.target.value))}
                    className="input-base text-sm w-24" min="2020" max="2040" />
                </div>
              </div>
              <div className="space-y-1">
                {indicador.metas_anuales.map((ma, mi) => (
                  <div key={ma.anio} className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 w-10">{ma.anio}:</span>
                    <input type="number" step="any" value={ma.meta}
                      onChange={e => {
                        const copia = [...indicador.metas_anuales];
                        copia[mi] = { ...copia[mi], meta: e.target.value };
                        onChange('metas_anuales', copia);
                      }}
                      className="input-base text-sm flex-1" placeholder="Meta para este año" />
                  </div>
                ))}
              </div>
              {indicador.metas_anuales.length > 0 && (
                <p className="text-xs text-gray-400">
                  Suma anual: {indicador.metas_anuales.reduce((s, m) => s + (parseFloat(m.meta) || 0), 0).toLocaleString()}
                  {indicador.meta_global ? ` / Meta global: ${Number(indicador.meta_global).toLocaleString()}` : ''}
                </p>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Descripción (opcional)</label>
            <input type="text" value={indicador.descripcion} onChange={e => onChange('descripcion', e.target.value)}
              className="input-base text-sm" placeholder="Contexto o fórmula de cálculo..." />
          </div>
        </div>
      )}
    </div>
  );
}
