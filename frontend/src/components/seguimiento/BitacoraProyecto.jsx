/**
 * ARCHIVO: BitacoraProyecto.jsx
 * PROPÓSITO: Pestaña "Bitácora" del proyecto — registro completo del
 *            proyecto entero (comentarios, archivos, riesgos, avance,
 *            miembros, indicadores): gráfico de línea del tiempo +
 *            resumen por mes + lista cronológica, los mismos tres
 *            componentes compartidos que usa la pestaña Actividad de
 *            Detalle (LineaTiempoEventos/ResumenMensual/BitacoraCronologica),
 *            debajo de los filtros que ya existían (Tipo/Usuario/Etapa/
 *            Acción/Tarea/Desde/Hasta/Buscar). A diferencia de Detalle
 *            (alcance: un nodo y sus descendientes, 5 carriles sin
 *            indicador), aquí el alcance es el proyecto completo y se
 *            agrega el carril Indicadores (6 carriles) — un indicador no
 *            tiene un nodo dueño único, así que solo tiene sentido
 *            agregado a este nivel, no repetido en cada pestaña de nodo.
 *
 * Por qué una sola llamada (limite alto) en vez de pedir cada página al
 * servidor: el gráfico/resumen necesitan el historial FILTRADO completo
 * para trazar columnas de mes, no solo los 25 registros de la página
 * visible — así que se pide una vez (tope 1000, mismo criterio que
 * obtenerActividadNodo en Detalle) y la lista de abajo pagina ese mismo
 * arreglo del lado del cliente, en vez de hacer una segunda llamada al
 * servidor por cada página.
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, Loader2, BookText, Filter } from 'lucide-react';
import * as proyectosApi from '../../api/proyectos';
import * as miembrosApi from '../../api/miembros';
import * as etapasApi from '../../api/etapas';
import LineaTiempoEventos from '../common/LineaTiempoEventos';
import ResumenMensual from '../common/ResumenMensual';
import BitacoraCronologica from '../common/BitacoraCronologica';
import { normalizarEventoBitacora } from '../../utils/eventosLineaTiempo';

const CATEGORIAS = [
  { id: '', label: 'Todos los tipos' },
  { id: 'comentario', label: 'Comentarios' },
  { id: 'archivo', label: 'Archivos' },
  { id: 'riesgo', label: 'Riesgos y problemas' },
  { id: 'avance', label: 'Avance y estatus' },
  { id: 'miembro', label: 'Miembros' },
  { id: 'indicador', label: 'Indicadores' },
];

const CARRILES_BITACORA = ['documento', 'indicador', 'riesgo', 'comentario', 'equipo'];

const LIMITE_PAGINA = 25;
// Tope del historial que se pide al servidor para alimentar el gráfico —
// ver nota de archivo arriba. Si un proyecto llegara a superar esto en
// eventos filtrados, la lista/gráfico se quedan con los 1000 más
// recientes (mismo recorte ya aceptado en Detalle).
const LIMITE_TOTAL = 1000;

export default function BitacoraProyecto({ proyectoId }) {
  const navigate = useNavigate();
  const [entradasRaw, setEntradasRaw] = useState([]);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [pagina, setPagina] = useState(1);
  const [miembros, setMiembros] = useState([]);
  // Árbol completo (etapas → acciones → subacciones/tareas) — no el
  // listado plano de etapas que se usaba antes: el filtro de Acción/Tarea
  // en cascada necesita los hijos de la etapa elegida, no solo sus
  // nombres.
  const [arbol, setArbol] = useState([]);

  const [categoria, setCategoria] = useState('');
  const [usuarioId, setUsuarioId] = useState('');
  const [etapaId, setEtapaId] = useState('');
  const [accionId, setAccionId] = useState('');
  const [tareaId, setTareaId] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [busquedaInput, setBusquedaInput] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const debounceRef = useRef(null);

  // Id de evento resaltado, compartido entre el gráfico y la lista
  // (interacción bidireccional: pasar el cursor sobre un marcador resalta
  // su fila y viceversa).
  const [hoveredId, setHoveredId] = useState(null);
  // Cuando un clic (en el gráfico o en la lista) apunta a un evento que
  // vive en otra página de la lista, se cambia de página y se deja aquí
  // su id para hacer scroll hacia él en cuanto esa página termine de
  // renderizarse (ver useEffect de más abajo).
  const [pendienteScroll, setPendienteScroll] = useState(null);

  const filtrosActivos = [categoria, usuarioId, etapaId, accionId, tareaId, desde, hasta, busqueda].filter(Boolean).length;

  // Acción depende de la Etapa elegida (sus acciones de primer nivel +
  // las subacciones de cada una, aplanadas — la bitácora ya las trata
  // igual, ambas llegan como nodo_tipo='accion'); Tarea depende de la
  // Acción elegida. Elegir una etapa/acción nueva limpia lo que colgaba
  // de la anterior, para no dejar un filtro de tarea apuntando a un nodo
  // que ya no es hijo de la acción recién elegida.
  const etapaSeleccionada = arbol.find(e => e.id === etapaId);
  const accionesDisponibles = etapaSeleccionada
    ? (etapaSeleccionada.acciones || []).flatMap(a => [
        { ...a, etiqueta: a.nombre },
        ...(a.subacciones || []).map(sub => ({ ...sub, etiqueta: `${a.nombre} › ${sub.nombre}` })),
      ])
    : [];
  const accionSeleccionada = accionesDisponibles.find(a => a.id === accionId);
  const tareasDisponibles = accionSeleccionada?.tareas || [];

  function cambiarEtapa(valor) {
    setEtapaId(valor);
    setAccionId('');
    setTareaId('');
    setPagina(1);
  }

  function cambiarAccion(valor) {
    setAccionId(valor);
    setTareaId('');
    setPagina(1);
  }

  useEffect(() => {
    if (!proyectoId) return;
    miembrosApi.listarMiembros(proyectoId)
      .then(res => setMiembros((res.datos || []).filter(m => m.estado === 'aceptada')))
      .catch(() => setMiembros([]));
    etapasApi.obtenerArbol(proyectoId)
      .then(res => setArbol(res.datos || res || []))
      .catch(() => setArbol([]));
  }, [proyectoId]);

  const cargar = useCallback(async () => {
    if (!proyectoId) return;
    setCargando(true);
    try {
      const res = await proyectosApi.obtenerBitacoraProyecto(proyectoId, {
        categoria: categoria || undefined,
        usuarioId: usuarioId || undefined,
        etapaId: etapaId || undefined,
        accionId: accionId || undefined,
        tareaId: tareaId || undefined,
        desde: desde || undefined,
        hasta: hasta || undefined,
        busqueda: busqueda || undefined,
        pagina: 1,
        limite: LIMITE_TOTAL,
      });
      setEntradasRaw(res.datos || []);
      setTotal(res.total || 0);
    } catch {
      setEntradasRaw([]);
      setTotal(0);
    } finally {
      setCargando(false);
    }
  }, [proyectoId, categoria, usuarioId, etapaId, accionId, tareaId, desde, hasta, busqueda]);

  useEffect(() => { cargar(); }, [cargar]);

  const eventos = useMemo(() => entradasRaw.map(normalizarEventoBitacora), [entradasRaw]);
  const serieAvance = useMemo(() => eventos.filter(e => e.carril === 'avance'), [eventos]);
  const eventosCarriles = useMemo(() => eventos.filter(e => e.carril !== 'avance'), [eventos]);

  // Rango del gráfico: si Desde/Hasta ya acotan, se usa exactamente eso
  // (igual que pide la sección 6.2 — el gráfico obedece el filtro de
  // fecha activo); si no, el rango real del historial cargado.
  const rango = useMemo(() => {
    if (desde && hasta) {
      return { desde: new Date(desde).getTime(), hasta: new Date(hasta).getTime() + 24 * 60 * 60 * 1000 - 1 };
    }
    if (eventos.length === 0) return null;
    const tiempos = eventos.map(e => new Date(e.createdAt).getTime());
    return { desde: Math.min(...tiempos), hasta: Math.max(...tiempos) };
  }, [desde, hasta, eventos]);

  const totalPaginasLista = Math.max(1, Math.ceil(eventos.length / LIMITE_PAGINA));
  const eventosPagina = useMemo(
    () => eventos.slice((pagina - 1) * LIMITE_PAGINA, pagina * LIMITE_PAGINA),
    [eventos, pagina]
  );

  useEffect(() => {
    if (!pendienteScroll) return;
    const el = document.getElementById(`evento-fila-${pendienteScroll}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setPendienteScroll(null);
    }
  }, [pendienteScroll, eventosPagina]);

  // Clic en un marcador del gráfico o en una fila de la lista: resalta y
  // desplaza hasta esa fila — si vive en otra página de la lista, cambia
  // de página primero (el useEffect de arriba termina el scroll una vez
  // que esa página ya se renderizó).
  function alHacerClicEnEvento(evento) {
    setHoveredId(evento.id);
    const indice = eventos.findIndex(e => e.id === evento.id);
    if (indice === -1) return;
    const paginaDestino = Math.floor(indice / LIMITE_PAGINA) + 1;
    if (paginaDestino !== pagina) {
      setPagina(paginaDestino);
      setPendienteScroll(evento.id);
    } else {
      document.getElementById(`evento-fila-${evento.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  // Búsqueda con debounce — el resto de los filtros (selects, fechas) ya
  // disparan de inmediato al cambiar, sin necesitarlo.
  function cambiarBusquedaInput(valor) {
    setBusquedaInput(valor);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setPagina(1); setBusqueda(valor); }, 400);
  }

  // Un indicador no vive en el árbol de Seguimiento (no es un nodo que
  // navegar ahí) — tiene su propia pantalla de detalle en el módulo de
  // Indicadores, así que un evento de categoría Indicador navega hacia
  // allá en vez de a Seguimiento.
  function irANodo(nodo) {
    if (!nodo?.id) return;
    if (nodo.tipo === 'indicador') { navigate(`/indicadores/${nodo.id}`); return; }
    navigate(`/proyectos/${proyectoId}?tab=seguimiento&nodo=${nodo.id}`);
  }

  function limpiarFiltros() {
    setCategoria('');
    setUsuarioId('');
    setEtapaId('');
    setAccionId('');
    setTareaId('');
    setDesde('');
    setHasta('');
    setBusquedaInput('');
    setBusqueda('');
    setPagina(1);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <BookText size={18} className="text-guinda-600" />
        <h2 className="text-base font-semibold text-gray-800">Bitácora del proyecto</h2>
        <span className="text-xs text-gray-400">Todo lo que ha pasado aquí, en un solo lugar.</span>
      </div>

      {/* Filtros */}
      <div className="bg-white border border-gray-200 rounded-xl p-3.5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[180px]">
            <label className="text-[10px] text-gray-400 font-medium uppercase tracking-wide block mb-0.5">Tipo</label>
            <select
              value={categoria}
              onChange={e => { setCategoria(e.target.value); setPagina(1); }}
              className="w-full text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:border-guinda-300"
            >
              {CATEGORIAS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>

          {miembros.length > 0 && (
            <div className="min-w-[180px]">
              <label className="text-[10px] text-gray-400 font-medium uppercase tracking-wide block mb-0.5">Usuario</label>
              <select
                value={usuarioId}
                onChange={e => { setUsuarioId(e.target.value); setPagina(1); }}
                className="w-full text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:border-guinda-300"
              >
                <option value="">Todos los usuarios</option>
                {miembros.map(m => (
                  <option key={m.id_usuario} value={m.id_usuario}>{m.nombre_completo}</option>
                ))}
              </select>
            </div>
          )}

          {arbol.length > 0 && (
            <div className="min-w-[180px]">
              <label className="text-[10px] text-gray-400 font-medium uppercase tracking-wide block mb-0.5">Etapa</label>
              <select
                value={etapaId}
                onChange={e => cambiarEtapa(e.target.value)}
                className="w-full text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:border-guinda-300"
              >
                <option value="">Todas las etapas</option>
                {arbol.map(e => (
                  <option key={e.id} value={e.id}>{e.nombre}</option>
                ))}
              </select>
            </div>
          )}

          {/* Acción: solo tiene sentido con una Etapa ya elegida (sus
              opciones salen de ahí) — por eso no se muestra suelto. */}
          {etapaId && accionesDisponibles.length > 0 && (
            <div className="min-w-[180px]">
              <label className="text-[10px] text-gray-400 font-medium uppercase tracking-wide block mb-0.5">Acción</label>
              <select
                value={accionId}
                onChange={e => cambiarAccion(e.target.value)}
                className="w-full text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:border-guinda-300"
              >
                <option value="">Todas las acciones</option>
                {accionesDisponibles.map(a => (
                  <option key={a.id} value={a.id}>{a.etiqueta}</option>
                ))}
              </select>
            </div>
          )}

          {/* Tarea: solo con una Acción ya elegida, mismo criterio. */}
          {accionId && tareasDisponibles.length > 0 && (
            <div className="min-w-[180px]">
              <label className="text-[10px] text-gray-400 font-medium uppercase tracking-wide block mb-0.5">Tarea</label>
              <select
                value={tareaId}
                onChange={e => { setTareaId(e.target.value); setPagina(1); }}
                className="w-full text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:border-guinda-300"
              >
                <option value="">Todas las tareas</option>
                {tareasDisponibles.map(t => (
                  <option key={t.id} value={t.id}>{t.nombre}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="text-[10px] text-gray-400 font-medium uppercase tracking-wide block mb-0.5">Desde</label>
            <input
              type="date"
              value={desde}
              onChange={e => { setDesde(e.target.value); setPagina(1); }}
              className="text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:border-guinda-300"
            />
          </div>
          <div>
            <label className="text-[10px] text-gray-400 font-medium uppercase tracking-wide block mb-0.5">Hasta</label>
            <input
              type="date"
              value={hasta}
              onChange={e => { setHasta(e.target.value); setPagina(1); }}
              className="text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:border-guinda-300"
            />
          </div>

          <div className="flex-1 min-w-[200px]">
            <label className="text-[10px] text-gray-400 font-medium uppercase tracking-wide block mb-0.5">Buscar</label>
            <div className="relative">
              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Título, contenido, nodo o autor..."
                value={busquedaInput}
                onChange={e => cambiarBusquedaInput(e.target.value)}
                className="w-full text-xs border border-gray-200 rounded-md pl-6 pr-2 py-1.5 bg-white focus:outline-none focus:border-guinda-300"
              />
            </div>
          </div>

          {filtrosActivos > 0 && (
            <button onClick={limpiarFiltros} className="flex items-center gap-1 text-xs text-guinda-600 hover:text-guinda-700 font-medium pb-1.5">
              <X size={12} /> Limpiar filtros
            </button>
          )}
        </div>
      </div>

      {cargando ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-400">
          <Loader2 size={16} className="animate-spin" /> Cargando bitácora…
        </div>
      ) : eventos.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl text-center py-12 px-4">
          <Filter size={24} className="mx-auto mb-2 text-gray-300" />
          <p className="text-sm text-gray-400">
            {filtrosActivos > 0 ? 'Sin resultados con los filtros aplicados.' : 'Sin actividad registrada todavía.'}
          </p>
          {filtrosActivos > 0 && (
            <button onClick={limpiarFiltros} className="mt-2 text-xs text-guinda-500 hover:text-guinda-700 font-medium">Limpiar filtros</button>
          )}
        </div>
      ) : (
        <>
          {/* Gráfico + resumen por mes — solo con suficientes registros
              para que valga la pena trazar algo. */}
          {rango && eventos.length >= 3 ? (
            <>
              <LineaTiempoEventos
                eventos={eventosCarriles}
                carriles={CARRILES_BITACORA}
                serieAvance={serieAvance}
                rango={rango}
                hoveredId={hoveredId}
                onHoverMarker={setHoveredId}
                onClickMarker={alHacerClicEnEvento}
                nombreAlcance="el proyecto"
              />
              <ResumenMensual eventos={eventosCarriles} serieAvance={serieAvance} rango={rango} />
            </>
          ) : (
            <p className="text-[11px] text-gray-400 italic -mt-1">
              Aún no hay suficientes registros para mostrar la evolución.
            </p>
          )}

          <div className="bg-white border border-gray-200 rounded-xl p-3.5">
            <BitacoraCronologica
              eventos={eventosPagina}
              hoveredId={hoveredId}
              onHoverEvento={setHoveredId}
              onClickEvento={alHacerClicEnEvento}
              onNavegarNodo={irANodo}
              mostrarNodoOrigen
            />
          </div>

          {/* Paginación — sobre el mismo arreglo ya cargado (ver nota de
              archivo arriba), no una llamada nueva al servidor. */}
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>{total} evento{total !== 1 ? 's' : ''} en total</span>
            {totalPaginasLista > 1 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPagina(p => Math.max(1, p - 1))}
                  disabled={pagina <= 1}
                  className="px-3 py-1.5 border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Anterior
                </button>
                <span>Página {pagina} de {totalPaginasLista}</span>
                <button
                  onClick={() => setPagina(p => Math.min(totalPaginasLista, p + 1))}
                  disabled={pagina >= totalPaginasLista}
                  className="px-3 py-1.5 border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Siguiente
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
