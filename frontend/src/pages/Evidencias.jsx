/**
 * ARCHIVO: Evidencias.jsx
 * PROPÓSITO: Módulo global de evidencias — busca archivos de todos los
 *            proyectos a los que el usuario tiene acceso (el backend ya
 *            filtra por rol: superadmin/ejecutivo ven todo, dirección ve
 *            su DG, el resto solo donde colabora o es responsable).
 *
 * MINI-CLASE: Master-detail en vez de fila-con-todo
 * ─────────────────────────────────────────────────────────────────
 * La versión anterior metía nombre + categoría + autor + proyecto +
 * etapa + DG + fecha + descarga en una sola fila flex — en pantallas
 * angostas eso se desborda. Aquí la lista solo muestra lo esencial
 * (ícono, nombre, categoría, breadcrumb corto) y el detalle completo
 * (notas, quién subió, cuándo, tamaño, vista previa) vive en un panel
 * fijo a la derecha — el mismo patrón que el tab "Archivos" de un nodo.
 * ─────────────────────────────────────────────────────────────────
 */
import { useState, useEffect, useMemo } from 'react';
import { FileText, Search, Filter, X } from 'lucide-react';
import * as evidenciasApi from '../api/evidencias';
import * as catalogosApi from '../api/catalogos';
import * as proyectosApi from '../api/proyectos';
import EmptyState from '../components/common/EmptyState';
import FilePreviewModal from '../components/evidencias/FilePreviewModal';
import EvidenciaListItem from '../components/evidencias/EvidenciaListItem';
import EvidenciaDetallePanel from '../components/evidencias/EvidenciaDetallePanel';
import CATEGORIAS_EVIDENCIA from '../components/seguimiento/categoriasEvidencia';
import EtiquetaFiltroInput from '../components/common/EtiquetaFiltroInput';

// Antes esta lista y sus íconos vivían duplicados aquí (una tercera copia
// además de categoriasEvidencia.js y del CHECK de la BD) — una sola fuente,
// ver categoriasEvidencia.js.
const CATEGORIAS = CATEGORIAS_EVIDENCIA.map(c => c.value);
const ICONO_CATEGORIA = Object.fromEntries(CATEGORIAS_EVIDENCIA.map(c => [c.value, c.icon]));

export default function Evidencias() {
  const [evidencias, setEvidencias] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [seleccionada, setSeleccionada] = useState(null);
  const [preview, setPreview] = useState(null);

  const [filtros, setFiltros] = useState({ proyecto_id: '', categoria: '', programa_id: '', id_dg: '', etiqueta: '' });
  const [mostrarFiltros, setMostrarFiltros] = useState(true);

  const [proyectos, setProyectos] = useState([]);
  const [dgs, setDgs] = useState([]);
  const [programas, setProgramas] = useState([]);

  useEffect(() => {
    async function cargarCatalogos() {
      try {
        const [resProyectos, resDgs, resProgramas] = await Promise.all([
          proyectosApi.listarProyectos(),
          catalogosApi.obtenerDGs(),
          catalogosApi.obtenerProgramas(),
        ]);
        setProyectos(resProyectos.datos?.proyectos || resProyectos.datos || []);
        setDgs(resDgs.datos || []);
        setProgramas(resProgramas.datos || []);
      } catch (err) { console.error('Error cargando catálogos:', err); }
    }
    cargarCatalogos();
  }, []);

  useEffect(() => {
    async function cargar() {
      setCargando(true);
      try {
        const filtrosActivos = {};
        Object.entries(filtros).forEach(([k, v]) => { if (v) filtrosActivos[k] = v; });
        const res = await evidenciasApi.listarEvidencias(filtrosActivos);
        setEvidencias(res.datos || []);
      } catch (err) {
        console.error('Error cargando evidencias:', err);
      } finally {
        setCargando(false);
      }
    }
    cargar();
  }, [filtros]);

  // Si la evidencia seleccionada deja de estar en los resultados (cambiaron
  // los filtros), limpiar la selección para no mostrar un detalle huérfano.
  useEffect(() => {
    if (seleccionada && !evidencias.some(e => e.id === seleccionada.id)) setSeleccionada(null);
  }, [evidencias]); // eslint-disable-line react-hooks/exhaustive-deps

  const evidenciasFiltradas = useMemo(() => {
    if (!busqueda.trim()) return evidencias;
    const q = busqueda.toLowerCase();
    return evidencias.filter(e =>
      e.titulo?.toLowerCase().includes(q) ||
      e.nombre_original?.toLowerCase().includes(q) ||
      e.notas?.toLowerCase().includes(q) ||
      e.autor_nombre?.toLowerCase().includes(q) ||
      e.proyecto_nombre?.toLowerCase().includes(q) ||
      e.etapa_nombre?.toLowerCase().includes(q) ||
      e.accion_nombre?.toLowerCase().includes(q)
    );
  }, [evidencias, busqueda]);

  const hayFiltrosActivos = Object.values(filtros).some(v => v) || busqueda;

  function limpiarFiltros() {
    setFiltros({ proyecto_id: '', categoria: '', programa_id: '', id_dg: '', etiqueta: '' });
    setBusqueda('');
  }

  async function eliminar(ev) {
    if (!confirm(`¿Eliminar "${ev.nombre_original || ev.nombre_archivo}"? Esta acción no se puede deshacer.`)) return;
    try {
      await evidenciasApi.eliminarEvidencia(ev.id);
      setEvidencias(prev => prev.filter(e => e.id !== ev.id));
      if (seleccionada?.id === ev.id) setSeleccionada(null);
    } catch (err) {
      console.error('Error eliminando evidencia:', err);
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] min-w-0">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-1 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Documentos</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Consulta y busca documentos de tus proyectos
          </p>
        </div>
        <button
          onClick={() => setMostrarFiltros(!mostrarFiltros)}
          className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
            mostrarFiltros ? 'bg-guinda-50 text-guinda-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          <Filter size={14} /> Filtros
        </button>
      </div>

      {/* Panel de filtros */}
      {mostrarFiltros && (
        <div className="flex-shrink-0 card p-4 space-y-3 mb-4">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por nombre, notas, autor, proyecto, etapa..."
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              className="input-base pl-9 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {/* min-w-0 es necesario: un <select> sin él usa el ancho de su
                opción más larga como mínimo, y desborda la celda del grid. */}
            <div className="min-w-0">
              <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1 block">Proyecto</label>
              <select value={filtros.proyecto_id} onChange={e => setFiltros(prev => ({ ...prev, proyecto_id: e.target.value }))} className="input-base text-sm truncate">
                <option value="">Todos los proyectos</option>
                {proyectos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>
            <div className="min-w-0">
              <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1 block">Categoría</label>
              <select value={filtros.categoria} onChange={e => setFiltros(prev => ({ ...prev, categoria: e.target.value }))} className="input-base text-sm truncate">
                <option value="">Todas las categorías</option>
                {CATEGORIAS.map(c => <option key={c} value={c}>{ICONO_CATEGORIA[c]} {c}</option>)}
              </select>
            </div>
            <div className="min-w-0">
              <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1 block">Programa</label>
              <select value={filtros.programa_id} onChange={e => setFiltros(prev => ({ ...prev, programa_id: e.target.value }))} className="input-base text-sm truncate">
                <option value="">Todos los programas</option>
                {programas.map(p => <option key={p.id} value={p.id}>{p.clave} — {p.nombre}</option>)}
              </select>
            </div>
            <div className="min-w-0">
              <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1 block">Dirección General</label>
              <select value={filtros.id_dg} onChange={e => setFiltros(prev => ({ ...prev, id_dg: e.target.value }))} className="input-base text-sm truncate">
                <option value="">Todas las DGs</option>
                {dgs.map(d => <option key={d.id} value={d.id}>{d.siglas} — {d.nombre}</option>)}
              </select>
            </div>
            <div className="min-w-0">
              <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1 block">Etiqueta</label>
              <EtiquetaFiltroInput
                valor={filtros.etiqueta}
                onCambio={etiqueta => setFiltros(prev => ({ ...prev, etiqueta: etiqueta || '' }))}
                className="w-full"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            {hayFiltrosActivos && (
              <button onClick={limpiarFiltros} className="text-xs text-guinda-500 hover:text-guinda-700 font-medium flex items-center gap-1">
                <X size={12} /> Limpiar filtros
              </button>
            )}
            <span className="text-xs text-gray-400 ml-auto">
              {evidenciasFiltradas.length} documento{evidenciasFiltradas.length !== 1 ? 's' : ''}
              {evidencias.length !== evidenciasFiltradas.length && ` de ${evidencias.length}`}
            </span>
          </div>
        </div>
      )}

      {/* Body: lista + detalle */}
      <div className="flex-1 min-h-0 flex gap-4 min-w-0">
        {/* Lista */}
        <div className="flex-1 min-w-0 overflow-y-auto pr-1">
          {cargando ? (
            <div className="space-y-2 animate-pulse">
              {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-16 bg-gray-200 rounded-lg" />)}
            </div>
          ) : evidenciasFiltradas.length === 0 ? (
            <EmptyState
              icono={hayFiltrosActivos ? Search : FileText}
              titulo={hayFiltrosActivos ? 'Sin resultados' : 'Sin documentos'}
              subtitulo={hayFiltrosActivos
                ? 'No se encontraron documentos con los filtros aplicados.'
                : 'Aún no se han subido documentos en tus proyectos.'}
            />
          ) : (
            <div className="space-y-1.5">
              {evidenciasFiltradas.map(ev => (
                <EvidenciaListItem key={ev.id} evidencia={ev} activa={seleccionada?.id === ev.id} onClick={() => setSeleccionada(ev)} />
              ))}
            </div>
          )}
        </div>

        {/* Detalle */}
        <div className="hidden lg:block w-96 flex-shrink-0 border-l border-gray-100 pl-4 overflow-y-auto">
          {seleccionada
            ? <EvidenciaDetallePanel evidencia={seleccionada} onPreview={() => setPreview(seleccionada)} onEliminar={() => eliminar(seleccionada)} />
            : (
              <div className="flex flex-col items-center justify-center h-full text-center px-6 text-gray-400">
                <FileText size={32} className="mb-3 text-gray-200" />
                <p className="text-sm font-medium text-gray-600">Selecciona un documento</p>
                <p className="text-xs mt-1">Haz clic en un archivo de la lista para ver su detalle completo.</p>
              </div>
            )}
        </div>
      </div>

      {preview && <FilePreviewModal evidencia={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}
