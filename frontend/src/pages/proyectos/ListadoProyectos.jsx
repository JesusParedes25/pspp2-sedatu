/**
 * ARCHIVO: ListadoProyectos.jsx
 * PROPÓSITO: Página con grid de proyectos, filtros y paginación.
 *
 * MINI-CLASE: Paginación del lado del servidor
 * ─────────────────────────────────────────────────────────────────
 * La paginación se hace en el servidor (LIMIT/OFFSET en SQL) para
 * no cargar todos los proyectos a la vez. El frontend envía los
 * parámetros pagina y limite, y el backend devuelve los proyectos
 * de esa página + el total para calcular cuántas páginas hay.
 * Los filtros (estado, tipo, DG, búsqueda) se combinan con la
 * paginación para consultas eficientes.
 * ─────────────────────────────────────────────────────────────────
 */
import { Link } from 'react-router-dom';
import { Plus, FolderKanban } from 'lucide-react';
import { useProyectos } from '../../hooks/useProyectos';
import { usePermisosGlobales } from '../../hooks/usePermisos';
import { useAuth } from '../../context/AuthContext';
import TarjetaProyecto from '../../components/proyectos/TarjetaProyecto';
import FiltrosProyectos from '../../components/proyectos/FiltrosProyectos';
import EmptyState from '../../components/common/EmptyState';

export default function ListadoProyectos() {
  const { usuario } = useAuth();
  const { puedeCrearProyecto } = usePermisosGlobales();
  const { proyectos, total, cargando, filtros, actualizarFiltros } = useProyectos();

  const totalPaginas = Math.ceil(total / (filtros.limite || 12));
  const paginaActual = filtros.pagina || 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Proyectos</h1>
          <p className="text-sm text-gray-500 mt-1">{total} proyecto(s) encontrado(s)</p>
        </div>
        <div className="flex items-center gap-3">
          {usuario && (
            <span className="text-xs px-2 py-1 rounded-full bg-guinda-50 text-guinda-600 font-medium">
              {usuario.rol} — {usuario.dg_siglas}
            </span>
          )}
          {puedeCrearProyecto && (
            <Link to="/proyectos/nuevo" className="btn-primary flex items-center gap-2">
              <Plus size={16} />
              Nuevo proyecto
            </Link>
          )}
        </div>
      </div>

      {/* Filtros */}
      <div className="card p-4">
        <FiltrosProyectos filtros={filtros} onCambio={actualizarFiltros} />
      </div>

      {/* Grid de proyectos */}
      {cargando ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="card p-5 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-3" />
              <div className="h-3 bg-gray-200 rounded w-1/2 mb-3" />
              <div className="h-2 bg-gray-200 rounded w-full mb-3" />
              <div className="h-3 bg-gray-200 rounded w-1/3" />
            </div>
          ))}
        </div>
      ) : proyectos.length === 0 ? (
        <EmptyState
          icono={FolderKanban}
          titulo="Sin proyectos"
          subtitulo="No se encontraron proyectos con los filtros seleccionados. Crea tu primer proyecto o ajusta los filtros."
          accion="Crear proyecto"
          onAccion={() => window.location.href = '/proyectos/nuevo'}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {proyectos.map(proyecto => (
            <TarjetaProyecto key={proyecto.id} proyecto={proyecto} />
          ))}
        </div>
      )}

      {/* Paginación */}
      {totalPaginas > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <button
            onClick={() => actualizarFiltros({ pagina: paginaActual - 1 })}
            disabled={paginaActual <= 1}
            className="btn-secondary text-xs disabled:opacity-50"
          >
            Anterior
          </button>
          <span className="text-sm text-gray-600">
            Página {paginaActual} de {totalPaginas}
          </span>
          <button
            onClick={() => actualizarFiltros({ pagina: paginaActual + 1 })}
            disabled={paginaActual >= totalPaginas}
            className="btn-secondary text-xs disabled:opacity-50"
          >
            Siguiente
          </button>
        </div>
      )}
    </div>
  );
}
