/**
 * ARCHIVO: PanelDetalle.jsx
 * PROPÓSITO: Panel derecho de Detalle — ficha completa del nodo
 *            seleccionado: encabezado propio (Fase 2), tira de datos
 *            (Fase 2), fila de acciones (Fase 3) y subpestañas al fondo
 *            (Fase 4: Actividad/Documentos/Indicadores/Territorio/
 *            Riesgos/Equipo y permisos, ver PestanasDetalle.jsx).
 *
 * Fase 2 del rediseño: el encabezado y la tira de datos son componentes
 * NUEVOS, propios de Detalle (EncabezadoDetalle.jsx, TiraDatos.jsx,
 * ModalEditarFicha.jsx) — no se toca FichaNodo.jsx (compartido con el
 * drawer de Diagrama).
 *
 * Fase 3 del rediseño: la fila de acciones deja de ser NodoCard completa
 * (agrupado) y pasa a FilaAcciones.jsx, un componente NUEVO propio de
 * Detalle (primaria + secundaria + menú "Más acciones" reducido a Editar
 * ficha/Duplicar/Eliminar desde la Fase 4 — las demás acciones ya tienen
 * su propia subpestaña) — sigue sin tocarse NodoCard.jsx.
 *
 * Fase 4 del rediseño: el stream de Actividad que vivía siempre visible
 * al fondo pasa a ser una pestaña más (PestanasDetalle.jsx), junto con
 * las tablas nuevas de Documentos/Indicadores/Riesgos (con agregación de
 * descendientes) y Territorio/Equipo y permisos. ModalRegistrarAvance se
 * levanta aquí (antes vivía dentro de NodoCard) porque dos disparadores
 * distintos lo abren: el botón "Registrar avance" de FilaAcciones y el
 * atajo "Marcar como completada" del encabezado — un solo modal montado
 * una vez, no dos copias con estado separado.
 */
import { useState, useCallback } from 'react';
import PestanasDetalle from './PestanasDetalle';
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
  // Atajos de "Más acciones" (Adjuntar documento/Vincular indicador/
  // Vincular territorio/Reportar riesgo/Invitar participante) — viven de
  // nuevo en el menú (a pedido del usuario, además de sus propias
  // subpestañas, no en su lugar) pero el modal de cada una sigue siendo
  // el mismo que ya abre su subpestaña: FilaAcciones solo pide la alta
  // por clave ('documentos'|'indicadores'|'territorio'|'riesgos'|
  // 'equipo'), PestanasDetalle cambia a esa pestaña y le pasa el pedido
  // a la pestaña correspondiente, que lo consume abriendo su propio
  // modal — una sola implementación del modal, dos puntos de entrada.
  const [accionRapida, setAccionRapida] = useState(null);
  // Referencia estable — las pestañas la traen en las dependencias de su
  // propio efecto de "consumir el pedido"; una función inline nueva en
  // cada render volvería a dispararlo. Mismo motivo exacto que ya costó
  // la vibración de scroll que se arregló en PestanasDetalle.jsx.
  const consumirAccionRapida = useCallback(() => setAccionRapida(null), []);
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
          onAccionRapida={setAccionRapida}
          onEliminado={() => {
            const padre = ruta[ruta.length - 2];
            if (padre) onNavegarNodo(padre.tipo, padre.id);
            onActualizado?.();
          }}
        />

        <PestanasDetalle
          tipo={tipo}
          id={id}
          nodo={data}
          proyectoId={proyectoId}
          permisos={permisos}
          permisosProyecto={permisosProyecto}
          onCambiado={onActualizado}
          mostrarToast={mostrarToast}
          riesgoAAbrir={riesgoAAbrir}
          onRiesgoConsumido={onRiesgoConsumido}
          onNavegarNodo={onNavegarNodo}
          accionRapida={accionRapida}
          onAccionRapidaConsumida={consumirAccionRapida}
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
