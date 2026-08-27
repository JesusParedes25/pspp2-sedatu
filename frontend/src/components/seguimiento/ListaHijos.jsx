/**
 * ARCHIVO: ListaHijos.jsx
 * PROPÓSITO: Lista de navegación de los hijos de la rama enfocada, con
 *            encabezado autonombrado según el nivel ("Acciones de esta
 *            etapa") y, junto a él, "+ Agregar {hijo}" — antes era una
 *            acción escondida en el panel derecho ("+ Acción"), ahora
 *            vive junto a la lista que afecta. Cada fila es un
 *            FilaCentro: solo información, cero botones — seleccionar
 *            vive aquí, crear/editar en el panel derecho.
 *
 * Etapa nunca es hoja (siempre agrupa acciones); acción sí puede serlo —
 * "unidad de trabajo" con avance propio, en vez de agrupar tareas. Pero
 * "hoja" no es un estado fijo: es solo "sin hijos todavía". Por eso una
 * acción hoja muestra el aviso de unidad de trabajo Y el botón de agregar
 * — igual que una etapa, que siempre lo muestra — para que capturar la
 * primera tarea sea la forma de decidir que, después de todo, sí conviene
 * descomponerla. Solo tarea (sin hijoTipo: no hay un cuarto nivel) omite
 * el botón por completo.
 */
import FilaCentro from './EtapasAvancesMD/FilaCentro';
import CrearInline from './EtapasAvancesMD/CrearInline';
import { NIVELES } from '../../config/niveles';

export default function ListaHijos({ tipo, esContenedor, hijos, expandidos, onToggle, seleccionId, onSeleccionar, proyectoId, padreId, permisos, onCreado }) {
  const nivel = NIVELES[tipo];
  const Icono = nivel.icono;

  if (!esContenedor) {
    return (
      <div className="space-y-2">
        <div className="flex items-start gap-2.5 px-4 py-3.5 bg-gray-50 border border-gray-200 rounded-lg">
          <Icono size={16} className="flex-shrink-0 mt-0.5" style={{ color: nivel.color }} aria-hidden="true" />
          <p className="text-xs text-gray-500 leading-relaxed">
            Esta {nivel.label.toLowerCase()} es, por ahora, una unidad de trabajo — su avance se registra con el
            botón "Registrar avance" del panel, a la derecha{nivel.hijoTipo ? `, o se puede descomponer en ${(nivel.hijoLabelPlural || 'partes').toLowerCase()}` : ''}.
          </p>
        </div>
        {!permisos?.esSoloLectura && nivel.hijoTipo && (
          <CrearInline
            tipo={nivel.hijoTipo}
            padreId={padreId}
            proyectoId={proyectoId}
            onCreado={onCreado}
            etiqueta={`Agregar ${nivel.hijoLabel.toLowerCase()}`}
          />
        )}
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between mb-1" role="tree" aria-label={`${nivel.hijoLabelPlural} de esta ${nivel.label.toLowerCase()}`}>
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold text-gray-600">
            {nivel.hijoLabelPlural} de esta {nivel.label.toLowerCase()}
          </h3>
          <span className="text-[11px] text-gray-400">{hijos.length}</span>
        </div>
        {!permisos?.esSoloLectura && nivel.hijoTipo && (
          <CrearInline
            tipo={nivel.hijoTipo}
            padreId={padreId}
            proyectoId={proyectoId}
            onCreado={onCreado}
            etiqueta={`Agregar ${nivel.hijoLabel.toLowerCase()}`}
          />
        )}
      </div>
      <div role="tree">
        {hijos.map(h => (
          <FilaCentro
            key={h.nodo.id}
            tipo={h.tipo}
            nodo={h.nodo}
            profundidad={0}
            expandidos={expandidos}
            onToggle={onToggle}
            seleccionId={seleccionId}
            onSeleccionar={onSeleccionar}
          />
        ))}
      </div>
    </>
  );
}
