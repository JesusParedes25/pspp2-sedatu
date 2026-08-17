/**
 * ARCHIVO: ListadoProyectos.jsx
 * PROPÓSITO: Página con grid de proyectos, filtros y paginación. Tiene dos
 *            vistas intercambiables: "Agrupado" (carteras + proyectos sin
 *            cartera) y "Todos los proyectos" (grid plano, como antes).
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
 *
 * MINI-CLASE: Vista recordada en localStorage + URL
 * ─────────────────────────────────────────────────────────────────
 * El modo de vista (Agrupado / Todos los proyectos) se guarda en
 * localStorage para que la próxima visita abra en el mismo modo, y
 * también en el query param ?vista= para que un link directo a
 * "Todos los proyectos" funcione sin depender de localStorage.
 * ─────────────────────────────────────────────────────────────────
 */
import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, FolderKanban, Briefcase, Search, List } from 'lucide-react';
import { useProyectos } from '../../hooks/useProyectos';
import { useCarteras } from '../../hooks/useCarteras';
import { usePermisosGlobales } from '../../hooks/usePermisos';
import { useAuth } from '../../context/AuthContext';
import TarjetaProyecto from '../../components/proyectos/TarjetaProyecto';
import TarjetaCartera from '../../components/carteras/TarjetaCartera';
import ModalCartera from '../../components/carteras/ModalCartera';
import FiltrosProyectos from '../../components/proyectos/FiltrosProyectos';
import EmptyState from '../../components/common/EmptyState';
import { etiquetaRol } from '../../utils/roles';

const CLAVE_LOCALSTORAGE = 'pspp_vista_proyectos';

export default function ListadoProyectos() {
  const { usuario } = useAuth();
  const { puedeCrearProyecto } = usePermisosGlobales();
  const [searchParams, setSearchParams] = useSearchParams();
  const [mostrarNuevaCartera, setMostrarNuevaCartera] = useState(false);
  // Fuerza el remount (y por lo tanto la recarga) de VistaAgrupada cuando
  // se crea una cartera desde el botón del encabezado — VistaAgrupada
  // tiene su propia instancia de useCarteras() y no se entera sola.
  const [claveRecargaAgrupada, setClaveRecargaAgrupada] = useState(0);

  const vista = searchParams.get('vista') || localStorage.getItem(CLAVE_LOCALSTORAGE) || 'agrupado';

  useEffect(() => {
    localStorage.setItem(CLAVE_LOCALSTORAGE, vista);
  }, [vista]);

  function cambiarVista(nuevaVista) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('vista', nuevaVista);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Proyectos</h1>
        </div>
        <div className="flex items-center gap-3">
          {usuario && (
            <span className="text-xs px-2 py-1 rounded-full bg-guinda-50 text-guinda-600 font-medium">
              {etiquetaRol(usuario.rol)}{usuario.dg_siglas ? ` — ${usuario.dg_siglas}` : ''}
            </span>
          )}
          {puedeCrearProyecto && (
            <>
              <button onClick={() => setMostrarNuevaCartera(true)} className="btn-secondary flex items-center gap-2">
                <Briefcase size={16} />
                Nueva cartera
              </button>
              <Link to="/proyectos/nuevo" className="btn-primary flex items-center gap-2">
                <Plus size={16} />
                Nuevo proyecto
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Switcher de vista */}
      <div role="group" aria-label="Modo de vista" className="inline-flex bg-gray-100 rounded-lg p-1">
        <button
          onClick={() => cambiarVista('agrupado')}
          aria-pressed={vista === 'agrupado'}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            vista === 'agrupado' ? 'bg-white text-guinda-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Briefcase size={13} /> Agrupado
        </button>
        <button
          onClick={() => cambiarVista('todos')}
          aria-pressed={vista === 'todos'}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            vista === 'todos' ? 'bg-white text-guinda-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <List size={13} /> Todos los proyectos
        </button>
      </div>

      {vista === 'agrupado' ? <VistaAgrupada key={claveRecargaAgrupada} /> : <VistaTodos />}

      {mostrarNuevaCartera && (
        <ModalCartera
          onCerrar={() => setMostrarNuevaCartera(false)}
          onGuardada={() => { setMostrarNuevaCartera(false); setClaveRecargaAgrupada(k => k + 1); }}
        />
      )}
    </div>
  );
}

// ─── Vista "Agrupado": carteras + proyectos sin cartera ───────────
function VistaAgrupada() {
  const [busqueda, setBusqueda] = useState('');
  const { carteras, cargando: cargandoCarteras, setFiltros: setFiltrosCarteras } = useCarteras();
  const { proyectos: sinCartera, cargando: cargandoSinCartera, actualizarFiltros: actualizarFiltrosSinCartera } = useProyectos({ sin_cartera: true, limite: 24 });

  // Debounce: esperar a que el usuario deje de escribir antes de recargar
  // carteras y proyectos sin cartera con el nuevo término de búsqueda.
  useEffect(() => {
    const t = setTimeout(() => {
      setFiltrosCarteras({ busqueda: busqueda || undefined });
      actualizarFiltrosSinCartera({ busqueda: busqueda || undefined, pagina: 1 });
    }, 300);
    return () => clearTimeout(t);
  }, [busqueda, setFiltrosCarteras, actualizarFiltrosSinCartera]);

  return (
    <div className="space-y-6">
      <div className="relative max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Buscar cartera o proyecto..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          className="input-base pl-9"
        />
      </div>

      {/* Carteras */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Carteras de Proyectos {!cargandoCarteras && `(${carteras.length})`}</h2>
        {cargandoCarteras ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => <div key={i} className="card p-5 animate-pulse h-32" />)}
          </div>
        ) : carteras.length === 0 ? (
          <p className="text-sm text-gray-400 italic px-1">
            {busqueda ? 'Sin carteras que coincidan con la búsqueda.' : 'Aún no hay carteras. Crea una para agrupar proyectos relacionados.'}
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {carteras.map(cartera => <TarjetaCartera key={cartera.id} cartera={cartera} />)}
          </div>
        )}
      </div>

      {/* Proyectos sin cartera */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Proyectos {!cargandoSinCartera && `(${sinCartera.length})`}</h2>
        {cargandoSinCartera ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => <div key={i} className="card p-5 animate-pulse h-40" />)}
          </div>
        ) : sinCartera.length === 0 ? (
          <p className="text-sm text-gray-400 italic px-1">
            {busqueda ? 'Sin proyectos sueltos que coincidan con la búsqueda.' : 'Todos los proyectos pertenecen a alguna cartera.'}
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sinCartera.map(proyecto => <TarjetaProyecto key={proyecto.id} proyecto={proyecto} />)}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Vista "Todos los proyectos": grid plano con filtros y paginación ─
function VistaTodos() {
  const { proyectos, total, cargando, filtros, actualizarFiltros } = useProyectos();
  const { carteras } = useCarteras();

  const totalPaginas = Math.ceil(total / (filtros.limite || 12));
  const paginaActual = filtros.pagina || 1;

  return (
    <div className="space-y-6">
      {/* Alcance: todos / donde participo. La visibilidad sigue siendo
          total —cualquiera puede consultar cualquier proyecto— esto solo
          acota el listado, que con decenas de proyectos es lo que hace
          falta para encontrar lo propio. */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
          {[
            { valor: undefined, etiqueta: 'Todos' },
            { valor: 'participo', etiqueta: 'Donde participo' },
            { valor: 'responsable', etiqueta: 'Donde soy responsable' },
          ].map(op => {
            const activo = (filtros.participacion || undefined) === op.valor;
            return (
              <button
                key={op.etiqueta}
                onClick={() => actualizarFiltros({ participacion: op.valor, pagina: 1 })}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  activo ? 'bg-guinda-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {op.etiqueta}
              </button>
            );
          })}
        </div>
        <p className="text-sm text-gray-500">{total} proyecto(s) encontrado(s)</p>
      </div>

      {/* Filtros */}
      <div className="card p-4">
        <FiltrosProyectos filtros={filtros} onCambio={actualizarFiltros} carteras={carteras} />
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
