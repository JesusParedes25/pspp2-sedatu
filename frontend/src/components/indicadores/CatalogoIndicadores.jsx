/**
 * ARCHIVO: CatalogoIndicadores.jsx
 * PROPÓSITO: Pantalla 3 del módulo de Indicadores — el catálogo único,
 *            abierto a lectura para cualquiera, con curaduría (editar,
 *            dar de baja, eliminar) exclusiva de superadmin.
 *
 * MINI-CLASE: eliminar vs. dar de baja
 * ─────────────────────────────────────────────────────────────────
 * Dar de baja (cambiarActivo) nunca borra nada: un proyecto que ya usa
 * esa entrada conserva su referencia y su historial. Eliminar sí borra
 * la fila de la base — por eso solo se permite cuando NINGÚN proyecto
 * la usa todavía (y por lo tanto no hay ningún movimiento capturado
 * contra ella que se perdería). El backend valida esa condición antes
 * de borrar, no solo el frontend: un DELETE directo a una entrada en
 * uso responde 409, nunca borra.
 *
 * MINI-CLASE: fichas, no filas — mismo criterio que TarjetaIndicador.jsx
 * ─────────────────────────────────────────────────────────────────
 * Cada entrada es una ficha en una grilla que enlaza de lleno al
 * detalle (`/indicadores/catalogo/:id`, DetalleCatalogo.jsx) — ahí es
 * donde se responde "¿algún proyecto ya le está aportando?" y se edita.
 * La ficha de la lista ya no tiene lápiz/ojo propios (mismo criterio
 * que ya usa `TarjetaIndicador.jsx` en "Mis indicadores": la ficha
 * entera ya es el link al editor, un ícono aparte sería redundante) —
 * el único control propio de la ficha es el bote de basura de
 * superadmin, que no navega al hacer clic (stopPropagation).
 * ─────────────────────────────────────────────────────────────────
 */
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Search, Tag, Trash2, AlertTriangle } from 'lucide-react';
import * as catalogoApi from '../../api/catalogo-indicadores';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import { usePsedatuTitulos } from '../../hooks/usePsedatuTitulos';
import { etiquetaOrigenIndicador } from '../../utils/tiposIndicador';
import FiltrosCatalogoIndicadores from './FiltrosCatalogoIndicadores';
import MigajaPsedatu from './MigajaPsedatu';

const LIMITE_PAGINA = 50;

// Nota de mantenimiento interna que el cargador del catálogo deja en
// `definicion` para una entrada cuya unidad original no era numérica
// (ver publico.controller.js::quitarNotaInterna, que la oculta en la
// API externa) — dentro de la plataforma SÍ se muestra, como la razón
// de por qué esa entrada está dada de baja.
function notaInterna(definicion) {
  const texto = (definicion || '').trim();
  return texto.startsWith('⚠ Revisar:') ? texto : null;
}

export default function CatalogoIndicadores() {
  const { usuario } = useAuth();
  const { mostrarToast } = useUI();
  const esSuperadmin = usuario?.rol === 'superadmin';

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [filtros, setFiltros] = useState({ instrumento: null, producto: null, area: null });
  const titulosPsedatu = usePsedatuTitulos();
  const [verRetirados, setVerRetirados] = useState(false);
  const [error, setError] = useState('');

  // Eliminar de verdad (distinto de dar de baja): confirmación pendiente
  // y si ya se está borrando, para deshabilitar el botón del modal.
  const [porEliminar, setPorEliminar] = useState(null);
  const [eliminando, setEliminando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const res = await catalogoApi.listarCatalogoIndicadores({
        busqueda: busqueda || undefined,
        incluirInactivos: esSuperadmin ? verRetirados : false,
        instrumento: filtros.instrumento || undefined,
        producto: filtros.producto || undefined,
        area: filtros.area || undefined,
        pagina,
        limite: LIMITE_PAGINA,
      });
      setItems(res.datos || []);
      setTotal(res.total || 0);
    } catch {
      setError('No se pudo cargar el catálogo.');
    } finally { setCargando(false); }
  }, [busqueda, verRetirados, esSuperadmin, filtros, pagina]);

  useEffect(() => {
    const t = setTimeout(cargar, busqueda ? 250 : 0);
    return () => clearTimeout(t);
  }, [cargar, busqueda]);

  const totalPaginas = Math.ceil(total / LIMITE_PAGINA);

  async function confirmarEliminar() {
    if (!porEliminar) return;
    setEliminando(true);
    try {
      const res = await catalogoApi.eliminarIndicadorCatalogo(porEliminar.id);
      mostrarToast(res.mensaje || 'Indicador eliminado', 'exito');
      setPorEliminar(null);
      cargar();
    } catch (err) {
      mostrarToast(err.response?.data?.mensaje || 'No se pudo eliminar.', 'error');
    } finally {
      setEliminando(false);
    }
  }

  async function darDeBaja(ind) {
    try {
      await catalogoApi.cambiarActivoIndicadorCatalogo(ind.id, false);
      mostrarToast('Indicador dado de baja', 'exito');
      cargar();
    } catch (err) {
      mostrarToast(err.response?.data?.mensaje || 'No se pudo dar de baja.', 'error');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-800">Catálogo de indicadores</h2>
          <p className="text-xs text-gray-500 mt-0.5 max-w-2xl">
            La definición única de cada indicador. Los proyectos eligen de aquí, así que dos
            proyectos que miden lo mismo quedan comparables entre sí.
            {esSuperadmin ? ' Cualquier usuario puede dar de alta uno que falte; aquí se cura.' : ''}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={busqueda}
            onChange={e => { setBusqueda(e.target.value); setPagina(1); }}
            placeholder="Buscar por nombre, clave, categoría o área..."
            className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg shadow-sm focus:outline-none focus:border-guinda-400 focus:ring-2 focus:ring-guinda-100 transition-shadow"
          />
        </div>
        {esSuperadmin && (
          <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer flex-shrink-0">
            <input type="checkbox" checked={verRetirados} onChange={e => { setVerRetirados(e.target.checked); setPagina(1); }} className="accent-guinda-600" />
            Mostrar dados de baja
          </label>
        )}
      </div>

      <FiltrosCatalogoIndicadores valor={filtros} onCambio={patch => { setFiltros(f => ({ ...f, ...patch })); setPagina(1); }} />

      {!cargando && <p className="text-xs text-gray-500">{total} indicador{total !== 1 ? 'es' : ''} encontrado{total !== 1 ? 's' : ''}</p>}

      {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}

      {cargando ? (
        <div className="flex justify-center py-10"><Loader2 size={18} className="animate-spin text-gray-400" /></div>
      ) : items.length === 0 ? (
        <p className="text-xs text-gray-500 text-center py-8">
          {busqueda ? 'Ningún indicador coincide con la búsqueda.' : 'El catálogo está vacío.'}
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {items.map(ind => (
            <FichaCatalogo
              key={ind.id}
              indicador={ind}
              esSuperadmin={esSuperadmin}
              onEliminar={setPorEliminar}
              onDarDeBaja={darDeBaja}
              titulosPsedatu={titulosPsedatu}
            />
          ))}
        </div>
      )}

      {totalPaginas > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            onClick={() => setPagina(p => p - 1)}
            disabled={pagina <= 1}
            className="btn-secondary text-xs disabled:opacity-50"
          >
            Anterior
          </button>
          <span className="text-sm text-gray-600">
            Página {pagina} de {totalPaginas}
          </span>
          <button
            onClick={() => setPagina(p => p + 1)}
            disabled={pagina >= totalPaginas}
            className="btn-secondary text-xs disabled:opacity-50"
          >
            Siguiente
          </button>
        </div>
      )}

      {/* ─── Confirmar eliminación real ─── */}
      {porEliminar && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => !eliminando && setPorEliminar(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Eliminar &quot;{porEliminar.nombre}&quot;</h3>
            <p className="text-xs text-gray-600 mb-4">
              Se borra de verdad del catálogo, no solo se da de baja. No se puede deshacer.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setPorEliminar(null)} disabled={eliminando} className="btn-secondary text-sm disabled:opacity-50">
                Cancelar
              </button>
              <button
                onClick={confirmarEliminar}
                disabled={eliminando}
                className="text-sm px-3 py-1.5 rounded-lg text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
              >
                {eliminando ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Una ficha del catálogo. La ficha ENTERA es el link al detalle (mismo
// criterio que TarjetaIndicador.jsx: sin lápiz/ojo propios, el detalle
// es donde se edita con más contexto) — el único control propio es el
// bote de basura de superadmin, que corta la navegación con
// stopPropagation/preventDefault.
function FichaCatalogo({ indicador: ind, esSuperadmin, onEliminar, onDarDeBaja, titulosPsedatu }) {
  const razonBaja = notaInterna(ind.definicion);
  const contenido = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span className={`text-sm font-semibold line-clamp-2 ${ind.activo ? 'text-gray-800' : 'text-gray-400 line-through'}`}>
            {ind.nombre}
          </span>
        </div>
        {esSuperadmin && (
          <BotonEliminar indicador={ind} onEliminar={onEliminar} onDarDeBaja={onDarDeBaja} />
        )}
      </div>
      {!ind.activo && (
        <div className="mt-1">
          <span className="inline-block text-[10px] px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-600 font-medium">Dado de baja</span>
          {razonBaja && <p className="mt-1 text-[10px] text-amber-700">{razonBaja}</p>}
        </div>
      )}
      {ind.producto && (
        <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-sky-700 bg-sky-50 border border-sky-100 rounded-full px-2 py-0.5 max-w-full">
          <Tag size={10} className="flex-shrink-0 text-sky-400" />
          <span className="truncate">{ind.producto.length > 60 ? `${ind.producto.slice(0, 60)}…` : ind.producto}</span>
        </p>
      )}
      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
        {(() => {
          const origen = etiquetaOrigenIndicador(ind);
          return (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
              origen.institucional ? 'bg-sky-50 text-sky-700' : 'bg-gray-100 text-gray-600'
            }`}>
              {origen.texto}
            </span>
          );
        })()}
        {ind.unidad_personalizada && <span className="text-[10px] text-gray-400">{ind.unidad_personalizada}</span>}
      </div>
      <MigajaPsedatu
        codigoLineaAccion={ind.codigo_linea_accion}
        instrumento={ind.instrumento}
        titulos={titulosPsedatu}
      />
      <p className="mt-2 pt-2 border-t border-gray-100 text-[11px] text-gray-500">
        {ind.usos > 0
          ? `${ind.usos} proyecto${ind.usos !== 1 ? 's' : ''}${ind.dgs?.length ? ` · ${ind.dgs.join(', ')}` : ''}`
          : 'Sin proyectos todavía'}
      </p>
    </>
  );

  // Recuadro con el nombre y la categoría completos, sin truncar — la
  // ficha en sí se queda truncada (line-clamp/slice), esto solo aparece
  // al pasar el mouse. Primer tooltip propio de la app: no existe
  // ningún componente de tooltip/popover reutilizable en el frontend,
  // así que se arma con group/group-hover de Tailwind (ya usado en el
  // resto del proyecto), sin dependencia nueva.
  const infoHover = (
    <div className="pointer-events-none absolute left-0 right-0 top-full mt-1.5 z-20 hidden group-hover:block">
      <div className="bg-white border border-gray-200 shadow-lg rounded-lg p-3 text-xs space-y-1.5">
        <p className="font-semibold text-gray-900">{ind.nombre}</p>
        {ind.producto && (
          <p className="flex items-start gap-1 text-gray-600">
            <Tag size={11} className="flex-shrink-0 mt-0.5 text-sky-500" />
            <span>{ind.producto}</span>
          </p>
        )}
      </div>
    </div>
  );

  const clases = `group relative block rounded-xl border bg-white p-3.5 transition-all hover:border-guinda-200 hover:shadow-sm ${
    ind.activo ? 'border-gray-200' : 'border-gray-200 bg-gray-50/70'
  }`;

  return <Link to={`/indicadores/catalogo/${ind.id}`} className={clases}>{contenido}{infoHover}</Link>;
}

// Bote de basura de la ficha — eliminar de verdad (sin proyectos
// vinculados) o, si ya lo usa alguno, deshabilitado con un aviso que
// explica por qué y ofrece dar de baja en su lugar. `usos` ya viene
// calculado en la misma consulta que alimenta la grilla (listar()).
function BotonEliminar({ indicador, onEliminar, onDarDeBaja }) {
  const [mostrarAviso, setMostrarAviso] = useState(false);
  const enUso = (indicador.usos || 0) > 0;

  if (!enUso) {
    return (
      <button
        type="button"
        onClick={e => { e.preventDefault(); e.stopPropagation(); onEliminar(indicador); }}
        className="flex-shrink-0 p-1 text-gray-300 hover:text-red-600 transition-colors"
        title="Eliminar del catálogo"
      >
        <Trash2 size={14} />
      </button>
    );
  }

  return (
    <div
      className="relative flex-shrink-0"
      onMouseEnter={() => setMostrarAviso(true)}
      onMouseLeave={() => setMostrarAviso(false)}
    >
      <button
        type="button"
        disabled
        className="p-1 text-gray-200 cursor-not-allowed"
        title={`No se puede eliminar: ${indicador.usos} proyecto${indicador.usos !== 1 ? 's' : ''} lo usa${indicador.usos !== 1 ? 'n' : ''}.`}
      >
        <Trash2 size={14} />
      </button>
      {mostrarAviso && (
        <div
          className="absolute right-0 top-full mt-1 z-30 w-56 bg-white border border-gray-200 shadow-lg rounded-lg p-2.5"
          onClick={e => { e.preventDefault(); e.stopPropagation(); }}
        >
          <p className="flex items-start gap-1.5 text-[11px] text-gray-600">
            <AlertTriangle size={12} className="flex-shrink-0 mt-0.5 text-amber-500" />
            <span>
              No se puede eliminar: {indicador.usos} proyecto{indicador.usos !== 1 ? 's' : ''} lo usa
              {indicador.usos !== 1 ? 'n' : ''}.
            </span>
          </p>
          <button
            type="button"
            onClick={e => { e.preventDefault(); e.stopPropagation(); setMostrarAviso(false); onDarDeBaja(indicador); }}
            className="mt-1.5 text-[11px] font-medium text-guinda-700 hover:underline"
          >
            Dar de baja en su lugar
          </button>
        </div>
      )}
    </div>
  );
}
