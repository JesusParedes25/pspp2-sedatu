/**
 * ARCHIVO: FilaAcciones.jsx
 * PROPÓSITO: Fila de acciones del panel derecho de Detalle (Fase 3 del
 *            rediseño) — "Registrar avance" (primaria), "Agregar acción/
 *            tarea" (secundaria, ausente en Tarea) y un menú "Más
 *            acciones" (Editar ficha/Duplicar/Eliminar). Toda acción abre
 *            un modal — nunca un panel de solo lectura que se queda a
 *            medias en la página — y sin permiso queda deshabilitada con
 *            tooltip, no oculta.
 *
 * Fase 4 del rediseño: Adjuntar documento/Vincular indicador/Vincular
 * territorio/Reportar riesgo/Invitar participante salieron de este menú
 * — cada uno ahora es el botón de alta de su propia subpestaña
 * (PestanasDetalle.jsx, debajo de la ficha), con una tabla de consulta en
 * vez de un modal sin rastro después de cerrarlo. Mismo criterio que ya
 * se aplicó: una sola entrada por acción, no dos caminos al mismo modal.
 *
 * Componente NUEVO, propio de Detalle — no se toca NodoCard.jsx (ver
 * comentario de cabecera de PanelDetalle.jsx).
 */
import { useState } from 'react';
import { TrendingUp, Plus, MoreHorizontal, Pencil, Copy, Trash2, ChevronDown } from 'lucide-react';
import MenuDesplegable from '../../common/MenuDesplegable';
import ConfirmDialog from '../../common/ConfirmDialog';
import ModalDuplicarNodo from '../../nodos/ModalDuplicarNodo';
import ModalNuevaAccion from '../ModalNuevaAccion';
import ModalNuevaTarea from '../ModalNuevaTarea';
import * as etapasApi from '../../../api/etapas';
import * as accionesApi from '../../../api/acciones';
import * as tareasApi from '../../../api/tareas';
import { NIVELES } from '../../../config/niveles';

const TIPO_LABEL_MIN = { etapa: 'etapa', accion: 'acción', tarea: 'tarea' };

// Mismo criterio de conteo de descendientes que NodoCard — la confirmación
// de "Eliminar" tiene que avisar cuántos elementos se van junto con este.
function contarHijos(tipo, nodo) {
  if (tipo === 'accion') return (nodo.tareas || []).length + (nodo.subacciones || []).length;
  if (tipo === 'etapa') {
    return (nodo.acciones || []).reduce((suma, a) => suma + 1 + contarHijos('accion', a), 0);
  }
  return 0;
}

function ItemMenu({ icono: Icono, label, onClick, disabled, title, destructivo }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={disabled ? title : undefined}
      className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        destructivo ? 'text-red-600 hover:bg-red-50' : 'text-gray-700 hover:bg-gray-50'
      }`}
    >
      <Icono size={14} className="flex-shrink-0" /> {label}
    </button>
  );
}

export default function FilaAcciones({
  tipo, nodo, id, proyectoId, permisos, permisosProyecto, esContenedor,
  onCambiado, mostrarToast, onEditarFicha, onEliminado, onAbrirAvance,
}) {
  const soloLectura = permisos?.esSoloLectura ?? true;
  const puedeDuplicar = tipo === 'etapa' ? !!permisos?.puedeCrearEtapa : !!permisos?.puedeCrearAccion;
  const puedeEliminar = !!permisos?.puedeEliminar;

  const [mostrarModalNuevoHijo, setMostrarModalNuevoHijo] = useState(false);
  const [mostrarDuplicar, setMostrarDuplicar] = useState(false);
  const [confirmDuplicarEtapa, setConfirmDuplicarEtapa] = useState(false);
  const [duplicandoEtapa, setDuplicandoEtapa] = useState(false);
  const [confirmEliminar, setConfirmEliminar] = useState(false);
  const [eliminando, setEliminando] = useState(false);

  async function confirmarDuplicarEtapa() {
    setDuplicandoEtapa(true);
    try {
      await etapasApi.duplicarEtapa(id);
      setConfirmDuplicarEtapa(false);
      mostrarToast?.('Etapa duplicada', 'exito');
      onCambiado?.();
    } catch (err) {
      mostrarToast?.(err.response?.data?.mensaje || 'Error al duplicar', 'error');
      setConfirmDuplicarEtapa(false);
    } finally {
      setDuplicandoEtapa(false);
    }
  }

  async function confirmarEliminar() {
    setEliminando(true);
    try {
      if (tipo === 'etapa') await etapasApi.eliminarEtapa(id);
      else if (tipo === 'accion') await accionesApi.eliminarAccion(id);
      else await tareasApi.eliminarTarea(id);
      setConfirmEliminar(false);
      mostrarToast?.(`${TIPO_LABEL_MIN[tipo].charAt(0).toUpperCase() + TIPO_LABEL_MIN[tipo].slice(1)} eliminada`, 'exito');
      onEliminado ? onEliminado() : onCambiado?.();
    } catch (err) {
      mostrarToast?.(err.response?.data?.mensaje || 'Error al eliminar', 'error');
      setConfirmEliminar(false);
    } finally {
      setEliminando(false);
    }
  }

  const numHijosAEliminar = contarHijos(tipo, nodo);

  return (
    <div className="flex items-center gap-2 mb-4">
      <button
        disabled={soloLectura}
        onClick={onAbrirAvance}
        className="flex items-center justify-center gap-1.5 text-[12px] font-semibold px-4 py-2 rounded-lg disabled:opacity-40 transition-colors bg-guinda-600 text-white hover:bg-guinda-700"
      >
        <TrendingUp size={14} /> Registrar avance
      </button>

      {!soloLectura && NIVELES[tipo]?.hijoTipo && (
        <button
          onClick={() => setMostrarModalNuevoHijo(true)}
          className="flex items-center justify-center gap-1.5 text-[12px] font-medium px-3.5 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <Plus size={14} /> Agregar {NIVELES[tipo].hijoLabel.toLowerCase()}
        </button>
      )}

      <MenuDesplegable
        align="left"
        ancho="w-56"
        trigger={({ toggle, abierto }) => (
          <button
            onClick={toggle}
            className={`flex items-center justify-center gap-1 text-[12px] font-medium px-3 py-2 rounded-lg border transition-colors ${
              abierto ? 'border-gray-300 bg-gray-50 text-gray-800' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <MoreHorizontal size={14} /> Más acciones <ChevronDown size={12} />
          </button>
        )}
      >
        {({ cerrar }) => (
          <div className="py-1">
            <ItemMenu icono={Pencil} label="Editar ficha"
              disabled={soloLectura} title="Sin permiso para editar este elemento"
              onClick={() => { onEditarFicha?.(); cerrar(); }} />
            <ItemMenu icono={Copy} label="Duplicar"
              disabled={!puedeDuplicar} title="Sin permiso para duplicar este elemento"
              onClick={() => {
                cerrar();
                if (tipo === 'etapa') setConfirmDuplicarEtapa(true);
                else setMostrarDuplicar(true);
              }} />
            <ItemMenu icono={Trash2} label={`Eliminar ${TIPO_LABEL_MIN[tipo]}`} destructivo
              disabled={!puedeEliminar} title="Sin permiso para eliminar este elemento"
              onClick={() => { setConfirmEliminar(true); cerrar(); }} />
          </div>
        )}
      </MenuDesplegable>

      {mostrarModalNuevoHijo && NIVELES[tipo]?.hijoTipo === 'accion' && (
        <ModalNuevaAccion
          etapaId={id}
          onCreado={() => { onCambiado?.(); mostrarToast?.('Acción creada', 'exito'); }}
          onCreadoParcial={() => onCambiado?.()}
          onCerrar={() => setMostrarModalNuevoHijo(false)}
        />
      )}

      {mostrarModalNuevoHijo && NIVELES[tipo]?.hijoTipo === 'tarea' && (
        <ModalNuevaTarea
          accionId={id}
          onCreado={() => { onCambiado?.(); mostrarToast?.('Tarea creada', 'exito'); }}
          onCreadoParcial={() => onCambiado?.()}
          onCerrar={() => setMostrarModalNuevoHijo(false)}
        />
      )}

      {mostrarDuplicar && (
        <ModalDuplicarNodo
          tipo={tipo}
          nodo={nodo}
          proyectoId={proyectoId}
          mostrarToast={mostrarToast}
          onCerrar={() => setMostrarDuplicar(false)}
          onCompletado={onCambiado}
        />
      )}

      <ConfirmDialog
        abierto={confirmDuplicarEtapa}
        titulo="Duplicar etapa"
        mensaje={`Se creará una copia independiente de "${nodo.nombre}"${
          numHijosAEliminar > 0 ? ` con sus ${numHijosAEliminar} elemento${numHijosAEliminar > 1 ? 's' : ''} (acciones y tareas)` : ''
        } al final de este proyecto. La copia empieza en Pendiente, 0%, sin fechas ni territorio propios.`}
        textoConfirmar={duplicandoEtapa ? 'Duplicando...' : 'Duplicar'}
        variante="normal"
        onConfirmar={confirmarDuplicarEtapa}
        onCancelar={() => setConfirmDuplicarEtapa(false)}
      />

      <ConfirmDialog
        abierto={confirmEliminar}
        titulo={`Eliminar ${TIPO_LABEL_MIN[tipo]}`}
        mensaje={
          numHijosAEliminar > 0
            ? `"${nodo.nombre}" y sus ${numHijosAEliminar} elemento${numHijosAEliminar > 1 ? 's' : ''} relacionados se eliminarán permanentemente. Esta acción no se puede deshacer.`
            : `"${nodo.nombre}" se eliminará permanentemente. Esta acción no se puede deshacer.`
        }
        textoConfirmar={eliminando ? 'Eliminando...' : 'Eliminar'}
        onConfirmar={confirmarEliminar}
        onCancelar={() => setConfirmEliminar(false)}
      />
    </div>
  );
}
