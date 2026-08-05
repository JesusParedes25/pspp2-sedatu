/**
 * ARCHIVO: PanelDrawer.jsx
 * PROPÓSITO: Panel lateral (slide-over) que se abre al hacer clic en un
 *            nodo del Diagrama — mismos componentes que ya usa "Detalle"
 *            (PropiedadesElemento para el rail de propiedades, NodoCard
 *            para las acciones rápidas y ActividadStream para el historial),
 *            solo que aquí viven en un drawer flotante en vez de una
 *            columna fija, porque el lienzo no tiene espacio de sobra.
 */
import { useEffect } from 'react';
import { X } from 'lucide-react';
import NodoCard from '../../nodos/NodoCard';
import ActividadStream from '../../nodos/ActividadStream';
import PropiedadesElemento from '../PropiedadesElemento';

const TIPO_LABEL = { etapa: 'ETAPA', accion: 'ACCIÓN', tarea: 'TAREA' };

// Sin backdrop a pantalla completa a propósito: a diferencia del rail móvil
// de "Detalle" (que sí necesita bloquear todo lo de atrás), aquí el lienzo
// debe seguir siendo interactivo con el drawer abierto — clic en otro nodo
// simplemente cambia el contenido del drawer, y clic en el lienzo vacío lo
// cierra (ver onPaneClick en index.jsx). Un backdrop bloqueante tapaba el
// NodeToolbar flotante del nodo seleccionado e interceptaba sus clics.
export default function PanelDrawer({ nodo, proyectoId, permisos, onActualizado, mostrarToast, onCerrar }) {
  const { tipo, id, data } = nodo;

  useEffect(() => {
    function onKeyDown(e) { if (e.key === 'Escape') onCerrar(); }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCerrar]);

  return (
    <>
      <aside className="fixed right-0 top-0 bottom-0 w-full sm:w-[380px] bg-white z-40 shadow-2xl flex flex-col border-l border-gray-200">
        <div className="flex items-start justify-between gap-2 px-4 py-3 border-b border-gray-100 flex-shrink-0">
          <div className="min-w-0">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#7B1C3E] text-white uppercase tracking-wider">
              {TIPO_LABEL[tipo]}
            </span>
            <p className="text-sm font-semibold text-gray-900 mt-1.5 leading-snug" title={data.nombre}>{data.nombre}</p>
          </div>
          <button onClick={onCerrar} className="flex-shrink-0 p-1.5 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <PropiedadesElemento
            nodo={nodo}
            permisos={permisos}
            onActualizado={onActualizado}
            mostrarToast={mostrarToast}
          />
          <div className="px-3 py-3 border-t border-gray-100 space-y-3">
            <NodoCard
              tipo={tipo}
              nodo={data}
              proyectoId={proyectoId}
              permisos={permisos}
              onCambiado={onActualizado}
              ocultarMetadataFooter
              defaultAbierto
            />
            <ActividadStream tipo={tipo} id={id} />
          </div>
        </div>
      </aside>
    </>
  );
}
