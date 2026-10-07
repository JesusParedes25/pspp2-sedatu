/**
 * ARCHIVO: PanelDetalle.jsx
 * PROPÓSITO: Panel derecho de Detalle — ficha completa del nodo
 *            seleccionado (FichaNodo, el mismo componente compartido con
 *            el drawer de Diagrama — no se toca en este rediseño, ver
 *            nota de la Fase 1 abajo) + Actividad al fondo.
 *
 * Fase 1 del rediseño: antes este archivo componía una columna central
 * (encabezado de la rama enfocada + lista de hijos navegable) y un rail
 * aparte con la ficha de la selección, que podía ser un nodo distinto al
 * de la columna central. Con "foco" y "selección" fusionados en un único
 * concepto (ver EtapasAvancesMD/index.jsx) y la lista de hijos retirada
 * (no ofrecía ninguna acción que el árbol no tuviera ya), este panel se
 * reduce a lo que de verdad es nuevo aquí: mostrar completa la ficha de
 * UN nodo. Las fases siguientes de este rediseño reemplazan el contenido
 * (encabezado propio, fila de acciones, subpestañas) por componentes
 * nuevos construidos para Detalle — pero deliberadamente NO se toca
 * FichaNodo/NodoCard en esta fase: son compartidos con el drawer de
 * Diagrama, Agenda y Mis actividades, y una regresión ahí no estaba
 * pedida. Mientras tanto, se sigue usando tal cual.
 */
import ActividadStream from '../../nodos/ActividadStream';
import FichaNodo from '../FichaNodo';
import { resolverRutaConIds } from './utils';
import { permisosDeNodo } from '../../../hooks/usePermisos';

export default function PanelDetalle({
  seleccion, proyectoId, permisos: permisosProyecto, onActualizado, mostrarToast, arbol,
  onNavegarNodo, onAbrirArbol,
  riesgoAAbrir, onRiesgoConsumido, avanceAAbrir,
}) {
  const { tipo, id, data } = seleccion;
  const permisos = permisosDeNodo(permisosProyecto, tipo, id);
  const ruta = resolverRutaConIds(arbol, id) || [{ tipo, id, nombre: data.nombre }];

  return (
    <div className="flex flex-col flex-1 min-w-0 overflow-hidden h-full">
      {/* Botón "Ver estructura" en móvil — el árbol es un slide-over ahí */}
      <button
        onClick={onAbrirArbol}
        className="lg:hidden flex-shrink-0 flex items-center gap-1.5 px-4 py-2 text-[11px] text-gray-500 border-b border-gray-100 hover:bg-gray-50 text-left"
      >
        Ver estructura del proyecto
      </button>

      <div className="flex-1 overflow-y-auto px-4 py-3 max-w-2xl">
        <FichaNodo
          nodo={seleccion}
          proyectoId={proyectoId}
          permisos={permisos}
          ruta={ruta}
          onNavegarLineage={onNavegarNodo}
          onActualizado={onActualizado}
          // Al eliminar el nodo seleccionado, subir a su padre antes de
          // recargar — si se queda en el id borrado, el panel busca un
          // nodo que ya no está en el árbol.
          onEliminado={() => {
            const padre = ruta[ruta.length - 2];
            if (padre) onNavegarNodo(padre.tipo, padre.id);
            onActualizado?.();
          }}
          mostrarToast={mostrarToast}
          abrirAvanceAlMontar={avanceAAbrir}
        />

        <ActividadStream
          tipo={tipo}
          id={id}
          soloLectura={permisos.esSoloLectura}
          onCambiado={onActualizado}
          riesgoIdInicial={riesgoAAbrir}
          onRiesgoConsumido={onRiesgoConsumido}
        />
      </div>
    </div>
  );
}
