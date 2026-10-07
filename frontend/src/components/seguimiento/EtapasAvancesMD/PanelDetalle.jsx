/**
 * ARCHIVO: PanelDetalle.jsx
 * PROPÓSITO: Panel derecho de Detalle — ficha completa del nodo
 *            seleccionado: encabezado propio (Fase 2), tira de datos
 *            (Fase 2), fila de acciones (NodoCard, agrupado) y Actividad
 *            al fondo.
 *
 * Fase 2 del rediseño: el encabezado y la tira de datos son componentes
 * NUEVOS, propios de Detalle (EncabezadoDetalle.jsx, TiraDatos.jsx,
 * ModalEditarFicha.jsx) — no se toca FichaNodo.jsx (compartido con el
 * drawer de Diagrama). Como el encabezado nuevo ya muestra la ruta, el
 * título, los chips y el avance, y la tira nueva ya muestra fechas/
 * responsable/instrumento/escala, montar FichaNodo aquí habría
 * duplicado exactamente esa información una segunda vez (el mismo
 * problema que motivó este rediseño, solo que ahora entre el encabezado
 * nuevo y el viejo). Por eso este panel monta NodoCard directamente
 * (agrupado, sin su propia cabecera ni el pie de metadata que ya cubre
 * la tira) — es el MISMO componente compartido, sin modificarlo, solo
 * compuesto distinto: lo que se duplica entre Detalle y Diagrama es el
 * layout que lo rodea, nunca la captura ni la validación que vive
 * dentro de NodoCard/ModalRegistrarAvance/ModalRiesgo/etc.
 */
import { useState } from 'react';
import ActividadStream from '../../nodos/ActividadStream';
import NodoCard from '../../nodos/NodoCard';
import EncabezadoDetalle from './EncabezadoDetalle';
import TiraDatos from './TiraDatos';
import ModalEditarFicha from './ModalEditarFicha';
import { useJerarquiaProyecto } from '../../../hooks/useJerarquiaProyecto';
import { resolverRutaConIds } from './utils';
import { permisosDeNodo } from '../../../hooks/usePermisos';

export default function PanelDetalle({
  seleccion, proyectoId, permisos: permisosProyecto, onActualizado, mostrarToast, arbol,
  onNavegarNodo, onAbrirArbol,
  riesgoAAbrir, onRiesgoConsumido, avanceAAbrir,
}) {
  const { tipo, id, data } = seleccion;
  const permisos = permisosDeNodo(permisosProyecto, tipo, id);
  const esContenedor = tipo === 'etapa' || data.es_hoja === false;
  const ruta = resolverRutaConIds(arbol, id) || [{ tipo, id, nombre: data.nombre }];
  const { actualizar } = useJerarquiaProyecto(proyectoId);
  const [editandoFicha, setEditandoFicha] = useState(false);

  async function guardarCampo(campo, valor) {
    try {
      await actualizar(tipo, id, campo, valor);
      mostrarToast('Actualizado', 'exito');
      onActualizado?.();
    } catch (err) {
      mostrarToast(err.response?.data?.mensaje || 'Error al actualizar', 'error');
    }
  }

  return (
    <div className="flex flex-col flex-1 min-w-0 overflow-hidden h-full">
      {/* Botón "Ver estructura" en móvil — el árbol es un slide-over ahí */}
      <button
        onClick={onAbrirArbol}
        className="lg:hidden flex-shrink-0 flex items-center gap-1.5 px-4 py-2 text-[11px] text-gray-500 border-b border-gray-100 hover:bg-gray-50 text-left"
      >
        Ver estructura del proyecto
      </button>

      <div className="flex-1 overflow-y-auto px-5 py-4 max-w-2xl">
        <EncabezadoDetalle
          nodo={seleccion}
          ruta={ruta}
          permisos={permisos}
          onNavegarLineage={onNavegarNodo}
          onActualizado={onActualizado}
          mostrarToast={mostrarToast}
          onGuardarCampo={guardarCampo}
        />

        <TiraDatos nodo={seleccion} permisos={permisos} onEditar={() => setEditandoFicha(true)} />

        <NodoCard
          tipo={tipo}
          nodo={data}
          esContenedor={esContenedor}
          proyectoId={proyectoId}
          permisos={permisos}
          onCambiado={onActualizado}
          onEliminado={() => {
            const padre = ruta[ruta.length - 2];
            if (padre) onNavegarNodo(padre.tipo, padre.id);
            onActualizado?.();
          }}
          ocultarMetadataFooter
          ocultarCabecera
          defaultAbierto
          agrupado
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

      {editandoFicha && (
        <ModalEditarFicha
          nodo={seleccion}
          permisos={permisosProyecto}
          onActualizado={onActualizado}
          mostrarToast={mostrarToast}
          onCerrar={() => setEditandoFicha(false)}
        />
      )}
    </div>
  );
}
