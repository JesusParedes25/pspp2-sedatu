/**
 * ARCHIVO: DetalleCatalogo.jsx
 * PROPÓSITO: Página de detalle de UNA entrada del catálogo de
 *            indicadores — responde directamente lo que antes vivía
 *            oculto detrás de un acordeón por fila en
 *            CatalogoIndicadores.jsx: ¿cómo se mide?, ¿algún proyecto
 *            ya le está aportando?, ¿qué etapa/acción/tarea reporta
 *            esto? Mismo molde que DetalleIndicador.jsx (página propia
 *            con ruta, no modal) — es la convención ya establecida en
 *            este módulo para cualquier detalle con varias secciones.
 *
 * Cero endpoints nuevos: GET /catalogo-indicadores/:id, /:id/uso y
 * /:id/nodos ya existían (los usaba el acordeón que esta página
 * reemplaza) — solo se movió la presentación a un lugar más visual y a
 * un clic más directo desde la ficha de la lista.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Loader2, Pencil, EyeOff, Eye, Tag, X } from 'lucide-react';
import * as catalogoApi from '../../api/catalogo-indicadores';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import { useCierreConDatosSinGuardar } from '../../hooks/useCierreConDatosSinGuardar';
import { usePsedatuTitulos } from '../../hooks/usePsedatuTitulos';
import { TIPOS_INDICADOR as TIPOS } from '../../utils/tiposIndicador';
import BarraProgreso from '../../components/common/BarraProgreso';
import MigajaPsedatu from '../../components/indicadores/MigajaPsedatu';

const INSTRUMENTOS = ['Informe de Gobierno', 'Informe de Labores', 'PSEDATU 2025-2030'];
const ETIQUETA_TIPO_NODO = { etapa: 'Etapa', accion: 'Acción', tarea: 'Tarea' };
const ETIQUETA_MODO_APORTACION = { al_concluir: 'Manual', proporcional: 'Automático' };

export default function DetalleCatalogo() {
  const { id } = useParams();
  const { usuario } = useAuth();
  const { mostrarToast } = useUI();
  const esSuperadmin = usuario?.rol === 'superadmin';
  const titulosPsedatu = usePsedatuTitulos();

  const [indicador, setIndicador] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [noEncontrado, setNoEncontrado] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const datos = await catalogoApi.obtenerIndicadorCatalogo(id);
      if (!datos) { setNoEncontrado(true); return; }
      setIndicador(datos);
    } catch {
      setNoEncontrado(true);
    } finally {
      setCargando(false);
    }
  }, [id]);

  useEffect(() => { cargar(); }, [cargar]);

  async function alternarActivo() {
    try {
      await catalogoApi.cambiarActivoIndicadorCatalogo(indicador.id, !indicador.activo);
      mostrarToast(indicador.activo ? 'Indicador retirado' : 'Indicador reactivado', 'exito');
      cargar();
    } catch (err) {
      mostrarToast(err.response?.data?.mensaje || 'No se pudo cambiar el estado.', 'error');
    }
  }

  if (cargando && !indicador) {
    return <div className="p-6 flex justify-center"><Loader2 size={20} className="animate-spin text-gray-400" /></div>;
  }

  if (noEncontrado || !indicador) {
    return (
      <div className="p-6">
        <Link to="/indicadores?vista=catalogo" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-guinda-500 transition-colors">
          <ArrowLeft size={16} /> Catálogo de indicadores
        </Link>
        <p className="text-sm text-gray-500 mt-4">Este indicador del catálogo no existe.</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl space-y-5">
      <div>
        <Link to="/indicadores?vista=catalogo" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-guinda-500 transition-colors">
          <ArrowLeft size={16} /> Catálogo de indicadores
        </Link>
        <div className="flex items-start justify-between gap-3 mt-2">
          <h1 className="text-lg font-bold text-gray-900 break-words">
            {indicador.nombre}
            {!indicador.activo && <span className="ml-2 align-middle text-[11px] px-2 py-0.5 rounded-full bg-gray-200 text-gray-600 font-medium">retirado</span>}
          </h1>
        </div>
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <code className="text-[11px] px-1.5 py-0.5 rounded bg-gray-50 text-gray-400 font-mono">{indicador.clave}</code>
          {indicador.instrumento && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-guinda-50 text-guinda-700 border border-guinda-100 font-medium">
              {indicador.instrumento}
            </span>
          )}
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">
            {TIPOS.find(t => t.valor === indicador.tipo)?.etiqueta || indicador.tipo}
          </span>
        </div>
        {indicador.producto && (
          <p className="mt-1.5 inline-flex items-center gap-1 text-xs text-sky-700 bg-sky-50 border border-sky-100 rounded-full px-2.5 py-1 max-w-full" title={indicador.producto}>
            <Tag size={12} className="flex-shrink-0 text-sky-400" />
            <span>{indicador.producto}</span>
          </p>
        )}
        <MigajaPsedatu
          codigoLineaAccion={indicador.codigo_linea_accion}
          instrumento={indicador.instrumento}
          titulos={titulosPsedatu}
        />
      </div>

      <SeccionDefinicion indicador={indicador} esSuperadmin={esSuperadmin} onGuardado={cargar} mostrarToast={mostrarToast} />
      <SeccionProyectosVinculados catalogoId={indicador.id} />
      <SeccionNodosVinculados catalogoId={indicador.id} />

      {esSuperadmin && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <button
            onClick={alternarActivo}
            className="flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-amber-700"
          >
            {indicador.activo ? <><EyeOff size={15} /> Retirar del catálogo</> : <><Eye size={15} /> Reactivar</>}
          </button>
        </div>
      )}
    </div>
  );
}

function datosEditables(indicador) {
  return {
    nombre: indicador.nombre || '',
    tipo: indicador.tipo || 'Otro',
    unidad_personalizada: indicador.unidad_personalizada || '',
    definicion: indicador.definicion || '',
    fuente: indicador.fuente || '',
    referencia: indicador.referencia || '',
    instrumento: indicador.instrumento || null,
    area_sugerida: indicador.area_sugerida || '',
    producto: indicador.producto || '',
    codigo_linea_accion: indicador.codigo_linea_accion || '',
  };
}

function SeccionDefinicion({ indicador, esSuperadmin, onGuardado, mostrarToast }) {
  const [editando, setEditando] = useState(false);
  const [datos, setDatos] = useState(() => datosEditables(indicador));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const datosInicialesRef = useRef(datos);

  useEffect(() => { if (!editando) setDatos(datosEditables(indicador)); }, [indicador, editando]);

  function empezarEdicion() {
    datosInicialesRef.current = datosEditables(indicador);
    setDatos(datosInicialesRef.current);
    setError('');
    setEditando(true);
  }

  const hayCambiosSinGuardar = editando && JSON.stringify(datos) !== JSON.stringify(datosInicialesRef.current);
  const { cerrarConConfirmacion: cancelarConConfirmacion } = useCierreConDatosSinGuardar(hayCambiosSinGuardar, () => setEditando(false));

  async function guardar() {
    setGuardando(true);
    setError('');
    try {
      await catalogoApi.actualizarIndicadorCatalogo(indicador.id, datos);
      mostrarToast('Indicador actualizado', 'exito');
      setEditando(false);
      onGuardado();
    } catch (err) {
      setError(err.response?.data?.mensaje || 'No se pudo guardar.');
    } finally {
      setGuardando(false);
    }
  }

  if (!editando) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-sm font-semibold text-gray-900">Definición</h2>
          {esSuperadmin && (
            <button onClick={empezarEdicion} className="flex items-center gap-1 text-xs font-medium text-guinda-700 hover:text-guinda-800">
              <Pencil size={12} /> Editar
            </button>
          )}
        </div>
        <div>
          <p className="text-[11px] font-semibold text-gray-500 mb-0.5">Cómo se mide</p>
          <p className="text-sm text-gray-700">{indicador.definicion || <span className="text-gray-400">Sin definición capturada.</span>}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold text-gray-500 mb-0.5">Fuente del dato</p>
          <p className="text-sm text-gray-700">{indicador.fuente || <span className="text-gray-400">Sin fuente capturada.</span>}</p>
        </div>
        {(indicador.referencia || indicador.area_sugerida) && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 pt-1 border-t border-gray-100">
            {indicador.referencia && <span>{indicador.referencia}</span>}
            {indicador.area_sugerida && <span>Área: {indicador.area_sugerida}</span>}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">Editar definición</h2>
        <button onClick={cancelarConConfirmacion} className="p-1 text-gray-400 hover:text-gray-700"><X size={16} /></button>
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">Clave</label>
        <code className="block text-xs px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-500 font-mono">{indicador.clave}</code>
        <p className="text-[10px] text-gray-400 mt-1">
          No se puede cambiar: es el identificador con el que otra plataforma consumirá este indicador.
        </p>
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">Nombre</label>
        <input value={datos.nombre} onChange={e => setDatos(v => ({ ...v, nombre: e.target.value }))}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-guinda-400" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Tipo</label>
          <select value={datos.tipo} onChange={e => setDatos(v => ({ ...v, tipo: e.target.value }))}
            className="w-full px-2 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-guinda-400">
            {TIPOS.map(t => <option key={t.valor} value={t.valor}>{t.etiqueta}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Unidad</label>
          <input value={datos.unidad_personalizada} onChange={e => setDatos(v => ({ ...v, unidad_personalizada: e.target.value }))}
            placeholder="viviendas, hectáreas..."
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-guinda-400" />
        </div>
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">Cómo se mide</label>
        <textarea value={datos.definicion} onChange={e => setDatos(v => ({ ...v, definicion: e.target.value }))}
          rows={3}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-guinda-400" />
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">Fuente del dato</label>
        <input value={datos.fuente} onChange={e => setDatos(v => ({ ...v, fuente: e.target.value }))}
          placeholder="De dónde viene el dato, ej. INEGI, CONAPO..."
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-guinda-400" />
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">Referencia</label>
        <input value={datos.referencia} onChange={e => setDatos(v => ({ ...v, referencia: e.target.value }))}
          placeholder="Dónde ubicarlo, ej. página 261 del informe"
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-guinda-400" />
      </div>
      <div className="pt-2 border-t border-gray-100">
        <p className="text-[11px] font-semibold text-gray-500 mb-2">Metadatos de importación institucional</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Instrumento</label>
            <select value={datos.instrumento || ''} onChange={e => setDatos(v => ({ ...v, instrumento: e.target.value || null }))}
              className="w-full px-2 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-guinda-400">
              <option value="">— ninguno —</option>
              {INSTRUMENTOS.map(i => <option key={i} value={i}>{i}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Área sugerida</label>
            <input value={datos.area_sugerida} onChange={e => setDatos(v => ({ ...v, area_sugerida: e.target.value }))}
              placeholder="Ej. DGOTU; DGPV"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-guinda-400" />
          </div>
        </div>
        <div className="mt-3">
          <label className="block text-xs font-semibold text-gray-700 mb-1">Categoría</label>
          <textarea value={datos.producto} onChange={e => setDatos(v => ({ ...v, producto: e.target.value }))}
            rows={2}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-guinda-400" />
        </div>
        {datos.instrumento === 'PSEDATU 2025-2030' && (
          <div className="mt-3">
            <label className="block text-xs font-semibold text-gray-700 mb-1">Código de línea de acción</label>
            <input value={datos.codigo_linea_accion} onChange={e => setDatos(v => ({ ...v, codigo_linea_accion: e.target.value }))}
              placeholder="Ej. 1.1.1"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-guinda-400" />
          </div>
        )}
      </div>
      {indicador.usos > 0 && (
        <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          Este indicador se usa en {indicador.usos} proyecto{indicador.usos !== 1 ? 's' : ''}. Cambiar tipo o unidad
          se bloquea; el resto de los campos se actualiza en todos.
        </p>
      )}
      {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
      <div className="flex items-center justify-end gap-2 pt-1">
        <button onClick={cancelarConConfirmacion} className="btn-secondary text-sm">Cancelar</button>
        <button onClick={guardar} disabled={guardando || !datos.nombre.trim()} className="btn-primary text-sm disabled:opacity-40">
          {guardando ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </div>
  );
}

// "¿Algún proyecto ya le está aportando algo?" — la pregunta concreta
// que motivó este rediseño. Cada proyecto vinculado es su propia
// mini-ficha con una barra de progreso real (mismo criterio de % sin
// tope en el texto, topado solo en la barra, ya usado en toda la
// plataforma), no un simple número de texto.
function SeccionProyectosVinculados({ catalogoId }) {
  const [usos, setUsos] = useState(null);
  useEffect(() => {
    setUsos(null);
    catalogoApi.obtenerUsoIndicadorCatalogo(catalogoId)
      .then(r => setUsos(r.datos || []))
      .catch(() => setUsos([]));
  }, [catalogoId]);

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <h2 className="text-sm font-semibold text-gray-900 mb-3">Proyectos vinculados</h2>
      {usos === null ? (
        <div className="flex justify-center py-4"><Loader2 size={16} className="animate-spin text-gray-400" /></div>
      ) : usos.length === 0 ? (
        <p className="text-sm text-gray-500">Ningún proyecto lo usa todavía.</p>
      ) : (
        <div className="space-y-2">
          {usos.map(u => {
            const actual = u.valor_actual ?? 0;
            const meta = u.meta_global ?? 0;
            const porcentaje = meta > 0 ? (actual / meta) * 100 : 0;
            return (
              <Link
                key={u.indicador_id}
                to={`/indicadores/${u.indicador_id}`}
                className="block rounded-lg border border-gray-100 px-3 py-2.5 hover:border-guinda-200 hover:bg-guinda-50/20 transition-colors"
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="min-w-0 truncate text-sm font-medium text-gray-800">
                    {u.proyecto_nombre}{u.dg_siglas ? <span className="text-gray-400 font-normal"> · {u.dg_siglas}</span> : ''}
                  </span>
                </div>
                {u.meta_global != null ? (
                  <BarraProgreso porcentaje={porcentaje} actual={actual} meta={meta} />
                ) : (
                  <p className="text-xs text-gray-400">Sin meta capturada</p>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// "¿Qué etapa/acción/tarea reporta esto?" — agrupado por proyecto para
// leerse como "quién exactamente está reportando", no una lista plana.
function SeccionNodosVinculados({ catalogoId }) {
  const [nodos, setNodos] = useState(null);
  useEffect(() => {
    setNodos(null);
    catalogoApi.obtenerNodosVinculadosCatalogo(catalogoId)
      .then(setNodos)
      .catch(() => setNodos([]));
  }, [catalogoId]);

  const porProyecto = {};
  for (const n of nodos || []) {
    const clave = n.proyecto_id;
    if (!porProyecto[clave]) porProyecto[clave] = { proyecto_nombre: n.proyecto_nombre, dg_siglas: n.dg_siglas, nodos: [] };
    porProyecto[clave].nodos.push(n);
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <h2 className="text-sm font-semibold text-gray-900 mb-3">Nodos vinculados</h2>
      {nodos === null ? (
        <div className="flex justify-center py-4"><Loader2 size={16} className="animate-spin text-gray-400" /></div>
      ) : nodos.length === 0 ? (
        <p className="text-sm text-gray-500">Ninguna etapa/acción/tarea aporta a este indicador todavía.</p>
      ) : (
        <div className="space-y-3">
          {Object.values(porProyecto).map(grupo => (
            <div key={grupo.proyecto_nombre}>
              <p className="text-xs font-semibold text-gray-600 mb-1">
                {grupo.proyecto_nombre}{grupo.dg_siglas ? <span className="text-gray-400 font-normal"> · {grupo.dg_siglas}</span> : ''}
              </p>
              <div className="space-y-0.5">
                {grupo.nodos.map(n => (
                  <Link
                    key={`${n.indicador_id}-${n.id_nodo}`}
                    to={`/proyectos/${n.proyecto_id}?tab=seguimiento&nodo=${n.id_nodo}`}
                    className="flex items-center justify-between gap-2 text-xs px-2 py-1.5 rounded hover:bg-gray-50 transition-colors"
                  >
                    <span className="min-w-0 truncate">
                      <span className="text-gray-800">{n.nombre_nodo}</span>
                      <span className="text-gray-400"> · {ETIQUETA_TIPO_NODO[n.tipo_nodo] || n.tipo_nodo}</span>
                    </span>
                    <span className="text-gray-400 flex-shrink-0">{ETIQUETA_MODO_APORTACION[n.modo] || n.modo}</span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
