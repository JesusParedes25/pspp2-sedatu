/**
 * ARCHIVO: PanelDrawer.jsx
 * PROPÓSITO: Panel lateral (slide-over) que se abre al hacer clic en un
 *            nodo del Diagrama — dos pestañas, "Propiedades" (monta
 *            FichaNodo, el MISMO componente que usa el rail de "Detalle")
 *            y "Actividad" (ActividadStream). Se llama "Propiedades" y no
 *            "Detalle" para no chocar con el nombre de la subpestaña
 *            "Detalle" de al lado.
 *
 * MINI-CLASE: por qué el header aquí es distinto al de Detalle
 * ─────────────────────────────────────────────────────────────────
 * FichaNodo ya trae su propio encabezado (lineage + chips + título) — este
 * drawer solo necesita, arriba de eso, la barra de pestañas Propiedades/
 * Actividad y el botón de cerrar. Cuando la pestaña activa es "Actividad"
 * no se monta FichaNodo (no hace falta su encabezado ahí), así que el
 * feed recibe el nombre del nodo por su propio prop `titulo` en vez de
 * duplicar el lineage completo solo para esa pestaña.
 * ─────────────────────────────────────────────────────────────────
 */
import { useEffect, useState } from 'react';
import { X, ChevronRight } from 'lucide-react';
import ActividadStream from '../../nodos/ActividadStream';
import FichaNodo from '../FichaNodo';
import ResizeHandle from '../../common/ResizeHandle';
import { useAuth } from '../../../context/AuthContext';
import { usePanelWidth, keyAnchoPanelPropiedades } from '../../../hooks/usePanelWidth';
import { resolverRutaConIds } from '../EtapasAvancesMD/utils';
import { COLORES_SEMAFORO } from '../../common/SemaforoDot';
import { NIVELES } from '../../../config/niveles';
import { permisosDeNodo } from '../../../hooks/usePermisos';

const TIPO_HIJO_LABEL = { accion: 'Acción', tarea: 'Tarea' };

export default function PanelDrawer({ nodo, proyectoId, permisos, arbol, onActualizado, mostrarToast, onCerrar, onNavegar }) {
  const { tipo, id, data } = nodo;
  // El permiso puede ser parcial: quien fue invitado a una etapa suelta
  // captura ahí y no en el resto del proyecto.
  const soloLecturaNodo = permisosDeNodo(permisos, tipo, id)?.esSoloLectura ?? true;
  const [tab, setTab] = useState('propiedades');
  const nivel = NIVELES[tipo];
  const { usuario } = useAuth();
  // Misma key que el rail de "Detalle" — homologados: ajustar el ancho
  // aquí también lo cambia allá, y viceversa.
  const [anchoDrawer, ajustarAnchoDrawer] = usePanelWidth(
    keyAnchoPanelPropiedades(usuario), { default: 384, min: 280, max: 720 }
  );

  useEffect(() => {
    function onKeyDown(e) { if (e.key === 'Escape') onCerrar(); }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCerrar]);

  const tipoHijo = nivel.hijoTipo;
  const tipoHijoLabel = TIPO_HIJO_LABEL[tipoHijo] || null;
  const hijos = tipo === 'etapa'
    ? (data.acciones || [])
    : tipo === 'accion'
      ? [...(data.subacciones || []), ...(data.tareas || [])]
      : [];

  const ruta = (arbol && resolverRutaConIds(arbol, id)) || [{ tipo, id, nombre: data.nombre }];
  function navegarPorLineage(_tipoDestino, idDestino) { onNavegar(idDestino); }

  return (
    <aside
      style={{ '--ancho-drawer': `${anchoDrawer}px` }}
      className="fixed right-0 top-0 bottom-0 w-full sm:w-[var(--ancho-drawer)] bg-white z-40 shadow-2xl flex flex-col border-l border-gray-200"
    >
      {/* Handle en el borde izquierdo del drawer — mismo ancho (misma key
          de localStorage) que el rail de Detalle, ver keyAnchoPanelPropiedades. */}
      <div className="absolute left-0 top-0 h-full flex items-stretch -translate-x-1/2 z-10">
        <ResizeHandle lado="izquierdo" label="Redimensionar panel de propiedades" onResize={ajustarAnchoDrawer} />
      </div>
      <div className="relative px-4 pt-3 border-b border-gray-100 flex-shrink-0">
        <button onClick={onCerrar} className="absolute top-2 right-2.5 p-1.5 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100">
          <X size={16} />
        </button>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setTab('propiedades')}
            className={`text-[13px] font-semibold pb-2.5 border-b-2 -mb-px transition-colors ${
              tab === 'propiedades' ? 'text-[#7B1C3E] border-[#7B1C3E]' : 'text-gray-400 border-transparent hover:text-gray-600'
            }`}
          >
            Propiedades
          </button>
          <button
            onClick={() => setTab('actividad')}
            className={`text-[13px] font-semibold pb-2.5 border-b-2 -mb-px transition-colors ${
              tab === 'actividad' ? 'text-[#7B1C3E] border-[#7B1C3E]' : 'text-gray-400 border-transparent hover:text-gray-600'
            }`}
          >
            Actividad
          </button>
        </div>
      </div>

      {tab === 'propiedades' ? (
        <div className="flex-1 min-h-0 flex flex-col">
          <FichaNodo
            nodo={nodo}
            proyectoId={proyectoId}
            permisos={permisos}
            ruta={ruta}
            onNavegarLineage={navegarPorLineage}
            onActualizado={onActualizado}
            // El drawer muestra justo el nodo que se elimina: se cierra y se
            // recarga el lienzo, en vez de quedarse abierto sobre un nodo
            // que ya no existe.
            onEliminado={() => { onCerrar(); onActualizado?.(); }}
            mostrarToast={mostrarToast}
          />

          {/* Lista de hijos — navegación espacial propia de Diagrama, sin
              salir del drawer (crear hijo ya vive dentro de FichaNodo, así
              que aquí solo queda la navegación de los ya existentes). */}
          {tipoHijo && hijos.length > 0 && (
            <div className="flex-shrink-0 px-3 py-3 border-t border-gray-100">
              <span className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">
                Ir a {(tipoHijoLabel || '').toLowerCase()}
              </span>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {hijos.map(h => (
                  <button
                    key={h.id}
                    onClick={() => onNavegar(h.id)}
                    title={h.nombre}
                    className="w-full flex items-center gap-2 px-2.5 py-2 border border-gray-200 rounded-lg hover:border-[#7B1C3E] hover:bg-[#7B1C3E]/5 text-left transition-colors"
                  >
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: COLORES_SEMAFORO[h.semaforo_efectivo || 'gris'] }} />
                    <span className="flex-1 min-w-0 text-xs text-gray-700 truncate">{h.nombre}</span>
                    <span className="text-xs font-medium text-gray-500 flex-shrink-0 tabular-nums">
                      {Math.round(h.avance_efectivo ?? h.porcentaje_avance ?? h.porcentaje_calculado ?? 0)}%
                    </span>
                    <ChevronRight size={12} className="text-gray-300 flex-shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-3 py-3">
          <ActividadStream tipo={tipo} id={id} titulo={data.nombre} soloLectura={soloLecturaNodo} />
        </div>
      )}
    </aside>
  );
}
