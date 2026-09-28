/**
 * ARCHIVO: CatalogoIndicadores.jsx
 * PROPÓSITO: Pantalla 3 del módulo de Indicadores — el catálogo único,
 *            abierto a lectura para cualquiera, con curaduría (editar,
 *            retirar, fusionar duplicados) exclusiva de superadmin.
 *
 * MINI-CLASE: por qué "fusionar" y no solo "retirar"
 * ─────────────────────────────────────────────────────────────────
 * Retirar una entrada duplicada no arreglaba la fragmentación que
 * causó: los proyectos ya vinculados a esa entrada quedaban huérfanos
 * (su dato dejaba de sumar en cualquier lado, porque las pantallas
 * agrupan por catálogo activo). Fusionar reapunta esos proyectos hacia
 * la entrada que sobrevive antes de retirar la duplicada — es la
 * operación que de verdad corrige el catálogo, no solo lo esconde.
 *
 * MINI-CLASE: fichas, no filas — mismo criterio que TarjetaIndicador.jsx
 * ─────────────────────────────────────────────────────────────────
 * Cada entrada es una ficha en una grilla que enlaza de lleno al
 * detalle (`/indicadores/catalogo/:id`, DetalleCatalogo.jsx) — ahí es
 * donde se responde "¿algún proyecto ya le está aportando?", se edita y
 * se retira. La ficha de la lista ya no tiene lápiz/ojo propios (mismo
 * criterio que ya usa `TarjetaIndicador.jsx` en "Mis indicadores": la
 * ficha entera ya es el link al editor, un ícono aparte sería
 * redundante). En modo fusión, la ficha deja de navegar y se vuelve
 * seleccionable — el resto del flujo de fusión no cambia.
 * ─────────────────────────────────────────────────────────────────
 */
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Search, GitMerge, CheckSquare, Square, Tag, X } from 'lucide-react';
import * as catalogoApi from '../../api/catalogo-indicadores';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import { usePsedatuTitulos } from '../../hooks/usePsedatuTitulos';
import { TIPOS_INDICADOR as TIPOS } from '../../utils/tiposIndicador';
import FiltrosCatalogoIndicadores from './FiltrosCatalogoIndicadores';
import MigajaPsedatu from './MigajaPsedatu';

export default function CatalogoIndicadores() {
  const { usuario } = useAuth();
  const { mostrarToast } = useUI();
  const esSuperadmin = usuario?.rol === 'superadmin';

  const [items, setItems] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [filtros, setFiltros] = useState({ instrumento: null, producto: null, area: null });
  const titulosPsedatu = usePsedatuTitulos();
  const [verRetirados, setVerRetirados] = useState(false);
  const [error, setError] = useState('');

  // Modo fusión: selección múltiple entre entradas duplicadas.
  const [modoFusion, setModoFusion] = useState(false);
  const [seleccionados, setSeleccionados] = useState(new Set());
  const [sobrevive, setSobrevive] = useState(null);
  const [confirmandoFusion, setConfirmandoFusion] = useState(false);
  const [fusionando, setFusionando] = useState(false);

  // Sugerencias automáticas de posibles duplicados (pg_trgm) al entrar en
  // modo fusión — antes solo existía la selección manual, obligando a
  // adivinar cuáles entradas se parecen entre sí.
  const [sugerencias, setSugerencias] = useState([]);
  const [cargandoSugerencias, setCargandoSugerencias] = useState(false);
  const [umbralSugerencias, setUmbralSugerencias] = useState(0.5);

  useEffect(() => {
    if (!modoFusion) return;
    setCargandoSugerencias(true);
    catalogoApi.buscarDuplicadosSugeridos(umbralSugerencias)
      .then(setSugerencias)
      .catch(() => setSugerencias([]))
      .finally(() => setCargandoSugerencias(false));
  }, [modoFusion, umbralSugerencias]);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const res = await catalogoApi.listarCatalogoIndicadores({
        busqueda: busqueda || undefined,
        incluirInactivos: esSuperadmin ? verRetirados : false,
        instrumento: filtros.instrumento || undefined,
        producto: filtros.producto || undefined,
        area: filtros.area || undefined,
      });
      setItems(res.datos || []);
    } catch {
      setError('No se pudo cargar el catálogo.');
    } finally { setCargando(false); }
  }, [busqueda, verRetirados, esSuperadmin, filtros]);

  useEffect(() => {
    const t = setTimeout(cargar, busqueda ? 250 : 0);
    return () => clearTimeout(t);
  }, [cargar, busqueda]);

  function alternarSeleccion(id) {
    setSeleccionados(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function salirModoFusion() {
    setModoFusion(false);
    setSeleccionados(new Set());
    setSobrevive(null);
    setSugerencias([]);
  }

  function seleccionarSugerencia(par) {
    setSeleccionados(prev => new Set([...prev, par.entrada1.id, par.entrada2.id]));
  }

  const itemsSeleccionados = items.filter(i => seleccionados.has(i.id));

  function abrirConfirmacionFusion() {
    // Por default, sobrevive la entrada con más proyectos usándola — es
    // la que menos reapuntamientos necesita y la más probable de ser la
    // "correcta" entre las duplicadas.
    const porUso = [...itemsSeleccionados].sort((a, b) => (b.usos || 0) - (a.usos || 0));
    setSobrevive(porUso[0]?.id || null);
    setConfirmandoFusion(true);
  }

  async function confirmarFusion() {
    setFusionando(true);
    try {
      const res = await catalogoApi.fusionarIndicadoresCatalogo(sobrevive, [...seleccionados]);
      mostrarToast(res.mensaje || 'Fusionado', 'exito');
      setConfirmandoFusion(false);
      salirModoFusion();
      cargar();
    } catch (err) {
      mostrarToast(err.response?.data?.mensaje || 'No se pudo fusionar.', 'error');
    } finally {
      setFusionando(false);
    }
  }

  const sobrevivienteEntrada = itemsSeleccionados.find(i => i.id === sobrevive);
  const perdedoras = itemsSeleccionados.filter(i => i.id !== sobrevive);
  const totalReapuntados = perdedoras.reduce((s, i) => s + (i.usos || 0), 0);

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
        {esSuperadmin && !modoFusion && (
          <button
            onClick={() => setModoFusion(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-guinda-700 border border-guinda-200 rounded-lg hover:bg-guinda-50 flex-shrink-0"
          >
            <GitMerge size={13} /> Fusionar duplicados
          </button>
        )}
      </div>

      {modoFusion && (
        <div className="flex items-center justify-between gap-3 bg-guinda-50/60 border border-guinda-200 rounded-lg px-3 py-2.5">
          <p className="text-xs text-guinda-800">
            Selecciona 2 o más entradas que midan lo mismo.
            {seleccionados.size > 0 && ` ${seleccionados.size} seleccionada${seleccionados.size !== 1 ? 's' : ''}.`}
          </p>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={salirModoFusion} className="text-xs text-gray-500 hover:text-gray-700">Cancelar</button>
            <button
              onClick={abrirConfirmacionFusion}
              disabled={seleccionados.size < 2}
              className="px-3 py-1.5 text-xs font-medium bg-guinda-700 text-white rounded-lg disabled:opacity-40 hover:bg-guinda-600"
            >
              Fusionar seleccionados
            </button>
          </div>
        </div>
      )}

      {modoFusion && (
        <div className="border border-gray-200 rounded-lg px-3 py-2.5 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold text-gray-700">Posibles duplicados sugeridos</p>
            <label className="flex items-center gap-1.5 text-[11px] text-gray-500 flex-shrink-0">
              Sensibilidad
              <select
                value={umbralSugerencias}
                onChange={e => setUmbralSugerencias(parseFloat(e.target.value))}
                className="text-[11px] border border-gray-200 rounded px-1.5 py-0.5 focus:outline-none focus:border-guinda-400"
              >
                <option value={0.3}>Amplia</option>
                <option value={0.5}>Media</option>
                <option value={0.7}>Estricta</option>
              </select>
            </label>
          </div>
          {cargandoSugerencias ? (
            <div className="flex justify-center py-4"><Loader2 size={14} className="animate-spin text-gray-400" /></div>
          ) : sugerencias.length === 0 ? (
            <p className="text-xs text-gray-500 py-1">No se encontraron pares parecidos con esta sensibilidad.</p>
          ) : (
            <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
              {sugerencias.map(par => {
                const yaSeleccionado = seleccionados.has(par.entrada1.id) && seleccionados.has(par.entrada2.id);
                return (
                  <div key={`${par.entrada1.id}-${par.entrada2.id}`}
                    className={`flex items-center justify-between gap-3 px-2.5 py-1.5 rounded-lg text-xs ${yaSeleccionado ? 'bg-guinda-50 border border-guinda-200' : 'bg-gray-50'}`}>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-gray-800">
                        <span className="font-medium">{par.entrada1.nombre}</span>
                        <span className="text-gray-400"> ({par.entrada1.usos})</span>
                      </p>
                      <p className="truncate text-gray-800">
                        <span className="font-medium">{par.entrada2.nombre}</span>
                        <span className="text-gray-400"> ({par.entrada2.usos})</span>
                      </p>
                    </div>
                    <span className="text-[10px] text-gray-400 flex-shrink-0">{Math.round(par.score * 100)}% parecido</span>
                    <button
                      onClick={() => seleccionarSugerencia(par)}
                      disabled={yaSeleccionado}
                      className="text-[11px] font-medium text-guinda-700 hover:text-guinda-800 disabled:text-gray-400 flex-shrink-0"
                    >
                      {yaSeleccionado ? 'Seleccionado' : 'Seleccionar'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, clave, categoría o área..."
            className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg shadow-sm focus:outline-none focus:border-guinda-400 focus:ring-2 focus:ring-guinda-100 transition-shadow"
          />
        </div>
        {esSuperadmin && !modoFusion && (
          <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer flex-shrink-0">
            <input type="checkbox" checked={verRetirados} onChange={e => setVerRetirados(e.target.checked)} className="accent-guinda-600" />
            Ver retirados
          </label>
        )}
      </div>

      <FiltrosCatalogoIndicadores valor={filtros} onCambio={patch => setFiltros(f => ({ ...f, ...patch }))} />

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
              modoFusion={modoFusion}
              seleccionado={seleccionados.has(ind.id)}
              onAlternarSeleccion={() => alternarSeleccion(ind.id)}
              titulosPsedatu={titulosPsedatu}
            />
          ))}
        </div>
      )}

      {/* ─── Fusión: elegir sobreviviente + preview ─── */}
      {confirmandoFusion && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setConfirmandoFusion(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900">Fusionar {itemsSeleccionados.length} entradas</h3>
              <button onClick={() => setConfirmandoFusion(false)} className="p-1 text-gray-400 hover:text-gray-700"><X size={16} /></button>
            </div>
            <div className="px-5 py-4 space-y-3 overflow-y-auto">
              <p className="text-xs text-gray-600">¿Cuál de estas entradas sobrevive? Las demás se retiran y sus proyectos pasan a esta.</p>
              <div className="space-y-1.5">
                {itemsSeleccionados.map(ind => (
                  <label key={ind.id} className={`flex items-center justify-between gap-2 px-3 py-2 border rounded-lg cursor-pointer ${
                    sobrevive === ind.id ? 'border-guinda-400 bg-guinda-50/50' : 'border-gray-200'
                  }`}>
                    <span className="flex items-center gap-2 min-w-0">
                      <input type="radio" name="sobrevive" checked={sobrevive === ind.id} onChange={() => setSobrevive(ind.id)} className="accent-guinda-600" />
                      <span className="text-sm text-gray-800 truncate">{ind.nombre}</span>
                    </span>
                    <span className="text-[10px] text-gray-400 flex-shrink-0">{ind.usos} proyecto{ind.usos !== 1 ? 's' : ''}</span>
                  </label>
                ))}
              </div>
              {sobrevivienteEntrada && (
                <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                  {totalReapuntados > 0
                    ? `${totalReapuntados} indicador(es) de proyecto pasarán de ${perdedoras.map(p => `"${p.nombre}"`).join(', ')} a "${sobrevivienteEntrada.nombre}". `
                    : `Ningún proyecto usa todavía las entradas que se retiran. `}
                  Las demás quedan retiradas. No se puede deshacer.
                </p>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100">
              <button onClick={() => setConfirmandoFusion(false)} className="btn-secondary text-sm">Cancelar</button>
              <button onClick={confirmarFusion} disabled={fusionando || !sobrevive}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-guinda-700 text-white hover:bg-guinda-600 disabled:opacity-40">
                {fusionando ? 'Fusionando...' : 'Fusionar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Una ficha del catálogo. Fuera de modo fusión, la ficha ENTERA es el
// link al detalle (mismo criterio que TarjetaIndicador.jsx: sin lápiz/
// ojo propios, el detalle es donde se edita/retira con más contexto).
// En modo fusión deja de navegar y se vuelve seleccionable.
function FichaCatalogo({ indicador: ind, modoFusion, seleccionado, onAlternarSeleccion, titulosPsedatu }) {
  const contenido = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span className={`text-sm font-semibold line-clamp-2 ${ind.activo ? 'text-gray-800' : 'text-gray-400 line-through'}`}>
            {ind.nombre}
          </span>
        </div>
        {modoFusion && (
          <span className="flex-shrink-0 text-guinda-600 mt-0.5">
            {seleccionado ? <CheckSquare size={16} /> : <Square size={16} className="text-gray-300" />}
          </span>
        )}
      </div>
      {!ind.activo && <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-600 font-medium">retirado</span>}
      {ind.producto && (
        <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-sky-700 bg-sky-50 border border-sky-100 rounded-full px-2 py-0.5 max-w-full" title={ind.producto}>
          <Tag size={10} className="flex-shrink-0 text-sky-400" />
          <span className="truncate">{ind.producto.length > 60 ? `${ind.producto.slice(0, 60)}…` : ind.producto}</span>
        </p>
      )}
      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">
          {TIPOS.find(t => t.valor === ind.tipo)?.etiqueta || ind.tipo}
        </span>
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

  const clases = `block rounded-xl border bg-white p-3.5 transition-all ${
    ind.activo ? 'border-gray-200' : 'border-gray-200 bg-gray-50/70'
  } ${
    modoFusion
      ? seleccionado ? 'border-guinda-300 ring-1 ring-guinda-200 cursor-pointer' : 'hover:border-gray-300 cursor-pointer'
      : 'hover:border-guinda-200 hover:shadow-sm'
  }`;

  if (modoFusion) {
    return <div className={clases} onClick={onAlternarSeleccion}>{contenido}</div>;
  }
  return <Link to={`/indicadores/catalogo/${ind.id}`} className={clases}>{contenido}</Link>;
}
