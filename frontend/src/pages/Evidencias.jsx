/**
 * ARCHIVO: Evidencias.jsx
 * PROPÓSITO: Módulo global de evidencias con filtros avanzados para buscar
 *            archivos de cualquier proyecto, programa, categoría, etc.
 *
 * MINI-CLASE: Módulo de consulta transversal
 * ─────────────────────────────────────────────────────────────────
 * A diferencia de la pestaña de evidencias dentro de un proyecto,
 * este módulo muestra TODAS las evidencias del sistema. Los filtros
 * se aplican combinados: proyecto, programa, categoría, DG y
 * responsable. El texto de búsqueda filtra en el cliente sobre los
 * resultados ya traídos del servidor. Esto permite encontrar
 * rápidamente un archivo sin saber a qué proyecto pertenece.
 * ─────────────────────────────────────────────────────────────────
 */
import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  FileText, Search, Filter, X, Download, Map,
  Code, Image, File, FolderKanban
} from 'lucide-react';
import * as evidenciasApi from '../api/evidencias';
import * as catalogosApi from '../api/catalogos';
import * as proyectosApi from '../api/proyectos';
import EmptyState from '../components/common/EmptyState';

const iconosPorCategoria = {
  Geoespacial: Map,
  Scripts: Code,
  Fotografias: Image,
  Estudios: FileText,
  Planos: Map,
  Oficios: FileText,
  Minutas: FileText,
  Contratos: FileText,
  Reportes: FileText,
  Otro: File,
};

const CATEGORIAS = [
  'Geoespacial', 'Scripts', 'Fotografias', 'Estudios',
  'Planos', 'Oficios', 'Minutas', 'Contratos', 'Reportes', 'Otro'
];

function formatearTamano(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Evidencias() {
  const [evidencias, setEvidencias] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');

  // Filtros que se envían al servidor
  const [filtros, setFiltros] = useState({
    proyecto_id: '',
    categoria: '',
    programa_id: '',
    id_dg: '',
  });
  const [mostrarFiltros, setMostrarFiltros] = useState(true);

  // Catálogos para los dropdowns
  const [proyectos, setProyectos] = useState([]);
  const [dgs, setDgs] = useState([]);
  const [programas, setProgramas] = useState([]);

  // Cargar catálogos al montar
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
      } catch (err) {
        console.error('Error cargando catálogos:', err);
      }
    }
    cargarCatalogos();
  }, []);

  // Cargar evidencias cuando cambian los filtros del servidor
  useEffect(() => {
    async function cargar() {
      setCargando(true);
      try {
        // Solo enviar filtros con valor
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

  // Filtro de texto en el cliente
  const evidenciasFiltradas = useMemo(() => {
    if (!busqueda.trim()) return evidencias;
    const q = busqueda.toLowerCase();
    return evidencias.filter(e =>
      e.nombre_original?.toLowerCase().includes(q) ||
      e.notas?.toLowerCase().includes(q) ||
      e.autor_nombre?.toLowerCase().includes(q) ||
      e.proyecto_nombre?.toLowerCase().includes(q) ||
      e.etapa_nombre?.toLowerCase().includes(q) ||
      e.accion_nombre?.toLowerCase().includes(q)
    );
  }, [evidencias, busqueda]);

  // ¿Hay filtros activos?
  const hayFiltrosActivos = Object.values(filtros).some(v => v) || busqueda;

  function limpiarFiltros() {
    setFiltros({ proyecto_id: '', categoria: '', programa_id: '', id_dg: '' });
    setBusqueda('');
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Evidencias</h1>
          <p className="text-sm text-gray-500 mt-1">
            Consulta y busca evidencias de todos los proyectos
          </p>
        </div>
        <button
          onClick={() => setMostrarFiltros(!mostrarFiltros)}
          className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
            mostrarFiltros ? 'bg-guinda-50 text-guinda-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          <Filter size={14} />
          Filtros
        </button>
      </div>

      {/* Panel de filtros */}
      {mostrarFiltros && (
        <div className="card p-4 space-y-3">
          {/* Barra de búsqueda */}
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

          {/* Filtros en grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {/* Proyecto */}
            <div>
              <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1 block">Proyecto</label>
              <select
                value={filtros.proyecto_id}
                onChange={e => setFiltros(prev => ({ ...prev, proyecto_id: e.target.value }))}
                className="input-base text-sm"
              >
                <option value="">Todos los proyectos</option>
                {proyectos.map(p => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
            </div>

            {/* Categoría */}
            <div>
              <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1 block">Categoría</label>
              <select
                value={filtros.categoria}
                onChange={e => setFiltros(prev => ({ ...prev, categoria: e.target.value }))}
                className="input-base text-sm"
              >
                <option value="">Todas las categorías</option>
                {CATEGORIAS.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* Programa */}
            <div>
              <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1 block">Programa</label>
              <select
                value={filtros.programa_id}
                onChange={e => setFiltros(prev => ({ ...prev, programa_id: e.target.value }))}
                className="input-base text-sm"
              >
                <option value="">Todos los programas</option>
                {programas.map(p => (
                  <option key={p.id} value={p.id}>{p.clave} — {p.nombre}</option>
                ))}
              </select>
            </div>

            {/* DG */}
            <div>
              <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1 block">Dirección General</label>
              <select
                value={filtros.id_dg}
                onChange={e => setFiltros(prev => ({ ...prev, id_dg: e.target.value }))}
                className="input-base text-sm"
              >
                <option value="">Todas las DGs</option>
                {dgs.map(d => (
                  <option key={d.id} value={d.id}>{d.siglas} — {d.nombre}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Limpiar filtros + conteo */}
          <div className="flex items-center justify-between pt-1">
            {hayFiltrosActivos && (
              <button onClick={limpiarFiltros} className="text-xs text-guinda-500 hover:text-guinda-700 font-medium flex items-center gap-1">
                <X size={12} /> Limpiar filtros
              </button>
            )}
            <span className="text-xs text-gray-400 ml-auto">
              {evidenciasFiltradas.length} evidencia{evidenciasFiltradas.length !== 1 ? 's' : ''}
              {evidencias.length !== evidenciasFiltradas.length && ` de ${evidencias.length}`}
            </span>
          </div>
        </div>
      )}

      {/* Resultados */}
      {cargando ? (
        <div className="space-y-2 animate-pulse">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-16 bg-gray-200 rounded-lg" />
          ))}
        </div>
      ) : evidenciasFiltradas.length === 0 ? (
        <EmptyState
          icono={hayFiltrosActivos ? Search : FileText}
          titulo={hayFiltrosActivos ? 'Sin resultados' : 'Sin evidencias'}
          subtitulo={hayFiltrosActivos
            ? 'No se encontraron evidencias con los filtros aplicados.'
            : 'Aún no se han subido evidencias en ningún proyecto.'
          }
        />
      ) : (
        <div className="space-y-2">
          {evidenciasFiltradas.map(ev => (
            <EvidenciaGlobalRow key={ev.id} evidencia={ev} />
          ))}
        </div>
      )}
    </div>
  );
}

// Sub-componente: fila de evidencia con info del proyecto
function EvidenciaGlobalRow({ evidencia }) {
  const Icono = iconosPorCategoria[evidencia.categoria] || File;

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors border border-gray-100">
      {/* Ícono */}
      <div className="w-9 h-9 bg-guinda-50 rounded-lg flex items-center justify-center flex-shrink-0">
        <Icono size={18} className="text-guinda-500" />
      </div>

      {/* Info del archivo */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{evidencia.nombre_original}</p>
        <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
          <span className="px-1.5 py-0.5 bg-gray-100 rounded text-xs">{evidencia.categoria}</span>
          {evidencia.autor_nombre && <span>{evidencia.autor_nombre}</span>}
          {evidencia.tamano_bytes && <span>{formatearTamano(evidencia.tamano_bytes)}</span>}
        </div>
        {evidencia.notas && (
          <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{evidencia.notas}</p>
        )}
      </div>

      {/* Proyecto */}
      {evidencia.proyecto_nombre && (
        <Link
          to={`/proyectos/${evidencia.proyecto_id}`}
          className="flex items-center gap-1 text-xs text-guinda-500 hover:text-guinda-700 hover:underline flex-shrink-0 max-w-40 truncate"
        >
          <FolderKanban size={12} />
          {evidencia.proyecto_nombre}
        </Link>
      )}

      {/* Etapa */}
      {evidencia.etapa_nombre && (
        <span className="text-xs text-gray-400 flex-shrink-0 hidden lg:block max-w-28 truncate">
          {evidencia.etapa_nombre}
        </span>
      )}

      {/* DG */}
      {evidencia.dg_siglas && (
        <span className="text-[10px] font-medium text-guinda-600 bg-guinda-50 px-1.5 py-0.5 rounded flex-shrink-0 hidden md:block">
          {evidencia.dg_siglas}
        </span>
      )}

      {/* Fecha */}
      <span className="text-xs text-gray-400 flex-shrink-0">
        {new Date(evidencia.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
      </span>

      {/* Descarga */}
      <button className="p-2 text-gray-400 hover:text-guinda-500 rounded-lg hover:bg-guinda-50 transition-colors flex-shrink-0" title="Descargar">
        <Download size={16} />
      </button>
    </div>
  );
}
