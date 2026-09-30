/**
 * ARCHIVO: BitacoraProyecto.jsx
 * PROPÓSITO: Pestaña "Bitácora" del proyecto — registro completo,
 *            paginado y filtrable de TODO lo que hacen los usuarios ahí
 *            (comentarios, archivos, riesgos, avance/estatus, miembros,
 *            indicadores). A diferencia de ActividadReciente.jsx (un
 *            widget chico de 50 filas en Panorama), esta es la vista
 *            completa: filtros por tipo/usuario/fecha/texto y
 *            navegación al nodo exacto de cada evento.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp, FileText, AlertTriangle, MessageSquare, Shield, BarChart3,
  Search, X, Loader2, BookText, ExternalLink, Filter,
} from 'lucide-react';
import * as proyectosApi from '../../api/proyectos';
import * as miembrosApi from '../../api/miembros';

const CATEGORIAS = [
  { id: '', label: 'Todos los tipos' },
  { id: 'comentario', label: 'Comentarios' },
  { id: 'archivo', label: 'Archivos' },
  { id: 'riesgo', label: 'Riesgos y problemas' },
  { id: 'avance', label: 'Avance y estatus' },
  { id: 'miembro', label: 'Miembros' },
  { id: 'indicador', label: 'Indicadores' },
];

const ICONO_POR_CATEGORIA = {
  comentario: { Icono: MessageSquare, cls: 'bg-purple-100 text-purple-500' },
  archivo: { Icono: FileText, cls: 'bg-green-100 text-green-500' },
  riesgo: { Icono: AlertTriangle, cls: 'bg-orange-100 text-orange-500' },
  avance: { Icono: TrendingUp, cls: 'bg-blue-100 text-blue-500' },
  miembro: { Icono: Shield, cls: 'bg-teal-100 text-teal-600' },
  indicador: { Icono: BarChart3, cls: 'bg-indigo-100 text-indigo-500' },
};

const ETIQUETA_NODO = { etapa: 'Componente', accion: 'Acción', tarea: 'Tarea', proyecto: 'Proyecto', indicador: 'Indicador' };

function formatoFecha(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const LIMITE = 25;

export default function BitacoraProyecto({ proyectoId }) {
  const navigate = useNavigate();
  const [entradas, setEntradas] = useState([]);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [pagina, setPagina] = useState(1);
  const [miembros, setMiembros] = useState([]);

  const [categoria, setCategoria] = useState('');
  const [usuarioId, setUsuarioId] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [busquedaInput, setBusquedaInput] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const debounceRef = useRef(null);

  const filtrosActivos = [categoria, usuarioId, desde, hasta, busqueda].filter(Boolean).length;

  useEffect(() => {
    if (!proyectoId) return;
    miembrosApi.listarMiembros(proyectoId)
      .then(res => setMiembros((res.datos || []).filter(m => m.estado === 'aceptada')))
      .catch(() => setMiembros([]));
  }, [proyectoId]);

  const cargar = useCallback(async () => {
    if (!proyectoId) return;
    setCargando(true);
    try {
      const res = await proyectosApi.obtenerBitacoraProyecto(proyectoId, {
        categoria: categoria || undefined,
        usuarioId: usuarioId || undefined,
        desde: desde || undefined,
        hasta: hasta || undefined,
        busqueda: busqueda || undefined,
        pagina,
        limite: LIMITE,
      });
      setEntradas(res.datos || []);
      setTotal(res.total || 0);
    } catch {
      setEntradas([]);
      setTotal(0);
    } finally {
      setCargando(false);
    }
  }, [proyectoId, categoria, usuarioId, desde, hasta, busqueda, pagina]);

  useEffect(() => { cargar(); }, [cargar]);

  // Búsqueda con debounce — el resto de los filtros (selects, fechas) ya
  // disparan de inmediato al cambiar, sin necesitarlo.
  function cambiarBusquedaInput(valor) {
    setBusquedaInput(valor);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setPagina(1); setBusqueda(valor); }, 400);
  }

  function irANodo(entrada) {
    if (!entrada.nodo_id || entrada.nodo_tipo === 'indicador') return;
    navigate(`/proyectos/${proyectoId}?tab=seguimiento&nodo=${entrada.nodo_id}`);
  }

  function limpiarFiltros() {
    setCategoria('');
    setUsuarioId('');
    setDesde('');
    setHasta('');
    setBusquedaInput('');
    setBusqueda('');
    setPagina(1);
  }

  const totalPaginas = Math.max(1, Math.ceil(total / LIMITE));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <BookText size={18} className="text-guinda-600" />
        <h2 className="text-base font-semibold text-gray-800">Bitácora del proyecto</h2>
        <span className="text-xs text-gray-400">— todo lo que ha pasado aquí, en un solo lugar</span>
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

      {/* Lista */}
      <div className="bg-white border border-gray-200 rounded-xl">
        {cargando ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-400">
            <Loader2 size={16} className="animate-spin" /> Cargando bitácora…
          </div>
        ) : entradas.length === 0 ? (
          <div className="text-center py-12 px-4">
            <Filter size={24} className="mx-auto mb-2 text-gray-300" />
            <p className="text-sm text-gray-400">
              {filtrosActivos > 0 ? 'Sin resultados con los filtros aplicados.' : 'Sin actividad registrada todavía.'}
            </p>
            {filtrosActivos > 0 && (
              <button onClick={limpiarFiltros} className="mt-2 text-xs text-guinda-500 hover:text-guinda-700 font-medium">Limpiar filtros</button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {entradas.map(entrada => {
              const { Icono, cls } = ICONO_POR_CATEGORIA[entrada.categoria] || { Icono: MessageSquare, cls: 'bg-gray-100 text-gray-500' };
              const esClicable = !!entrada.nodo_id && entrada.nodo_tipo !== 'indicador';
              return (
                <div key={entrada.id} className="flex items-start gap-3 px-4 py-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${cls}`}>
                    <Icono size={14} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-800">{entrada.titulo}</p>
                    {entrada.contenido && (
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{entrada.contenido}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
                      {entrada.nodo_nombre && (
                        esClicable ? (
                          <button
                            onClick={() => irANodo(entrada)}
                            className="flex items-center gap-1 text-xs text-guinda-600 hover:underline font-medium"
                          >
                            {ETIQUETA_NODO[entrada.nodo_tipo] || entrada.nodo_tipo} · {entrada.nodo_nombre}
                            <ExternalLink size={10} />
                          </button>
                        ) : (
                          <span className="text-xs text-gray-400">
                            {ETIQUETA_NODO[entrada.nodo_tipo] || entrada.nodo_tipo} · {entrada.nodo_nombre}
                          </span>
                        )
                      )}
                      {entrada.autor_nombre && (
                        <span className="text-xs text-gray-400">· {entrada.autor_nombre}</span>
                      )}
                      <span className="text-xs text-gray-300">· {formatoFecha(entrada.created_at)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Paginación */}
      {total > 0 && (
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>{total} evento{total !== 1 ? 's' : ''} en total</span>
          {totalPaginas > 1 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPagina(p => Math.max(1, p - 1))}
                disabled={pagina <= 1}
                className="px-3 py-1.5 border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Anterior
              </button>
              <span>Página {pagina} de {totalPaginas}</span>
              <button
                onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}
                disabled={pagina >= totalPaginas}
                className="px-3 py-1.5 border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Siguiente
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
