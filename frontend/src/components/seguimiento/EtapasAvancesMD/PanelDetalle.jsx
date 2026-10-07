/**
 * ARCHIVO: PanelDetalle.jsx
 * PROPÓSITO: Panel derecho de Detalle — ficha completa del nodo
 *            seleccionado: encabezado propio (Fase 2), tira de datos
 *            (Fase 2), fila de acciones (Fase 3) y Actividad al fondo.
 *
 * Fase 2 del rediseño: el encabezado y la tira de datos son componentes
 * NUEVOS, propios de Detalle (EncabezadoDetalle.jsx, TiraDatos.jsx,
 * ModalEditarFicha.jsx) — no se toca FichaNodo.jsx (compartido con el
 * drawer de Diagrama).
 *
 * Fase 3 del rediseño: la fila de acciones deja de ser NodoCard completa
 * (agrupado) y pasa a FilaAcciones.jsx, un componente NUEVO propio de
 * Detalle con el layout que pide el punto 4.2 del rediseño (primaria +
 * secundaria + menú "Más acciones", todo abre modal) — sigue sin tocarse
 * NodoCard.jsx; FilaAcciones reusa los mismos modales/formularios
 * compartidos (ModalRiesgo, ModalDuplicarNodo, ModalNuevaAccion/Tarea,
 * SeccionArchivosNodo, TabIndicadores, TerritorioSelector,
 * SeccionMiembrosNodo) sin duplicar su lógica interna. ModalRegistrarAvance
 * se levanta aquí (antes vivía dentro de NodoCard) porque dos disparadores
 * distintos lo abren: el botón "Registrar avance" de FilaAcciones y el
 * atajo "Marcar como completada" del encabezado — un solo modal montado
 * una vez, no dos copias con estado separado.
 */
import { useState } from 'react';
import ActividadStream from '../../nodos/ActividadStream';
import ModalRegistrarAvance from '../../nodos/ModalRegistrarAvance';
import FilaAcciones from './FilaAcciones';
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
  // avanceAAbrir llega desde fuera (atajo "Registrar avance" de la
  // Portada, con un nodo recién elegido) — PanelDetalle remonta por
  // `key={seleccion.id}` en index.jsx cada vez que cambia la selección,
  // así que evaluarlo solo al montar (igual que antes hacía NodoCard con
  // abrirAvanceAlMontar) ya cubre un nodo nuevo sin necesitar un efecto.
  const [mostrarModalAvance, setMostrarModalAvance] = useState(() => !!avanceAAbrir);
  const [completarAlAbrir, setCompletarAlAbrir] = useState(false);

  function abrirAvance({ completar = false } = {}) {
    setCompletarAlAbrir(completar);
    setMostrarModalAvance(true);
  }

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
          onMarcarCompletada={!esContenedor ? () => abrirAvance({ completar: true }) : undefined}
        />

        <TiraDatos nodo={seleccion} permisos={permisos} onEditar={() => setEditandoFicha(true)} />

        <FilaAcciones
          tipo={tipo}
          nodo={data}
          id={id}
          proyectoId={proyectoId}
          permisos={permisos}
          permisosProyecto={permisosProyecto}
          esContenedor={esContenedor}
          onCambiado={onActualizado}
          mostrarToast={mostrarToast}
          onEditarFicha={() => setEditandoFicha(true)}
          onAbrirAvance={() => abrirAvance()}
          onEliminado={() => {
            const padre = ruta[ruta.length - 2];
            if (padre) onNavegarNodo(padre.tipo, padre.id);
            onActualizado?.();
          }}
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

      {mostrarModalAvance && (
        <ModalRegistrarAvance
          tipo={tipo}
          nodo={data}
          esContenedor={esContenedor}
          completarAlAbrir={completarAlAbrir}
          onGuardado={async () => { onActualizado?.(); }}
          onCerrar={() => { setMostrarModalAvance(false); setCompletarAlAbrir(false); }}
        />
      )}

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
