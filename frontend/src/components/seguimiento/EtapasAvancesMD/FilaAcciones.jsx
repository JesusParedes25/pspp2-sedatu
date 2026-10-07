/**
 * ARCHIVO: FilaAcciones.jsx
 * PROPÓSITO: Fila de acciones del panel derecho de Detalle (Fase 3 del
 *            rediseño) — "Registrar avance" (primaria), "Agregar acción/
 *            tarea" (secundaria, ausente en Tarea) y un menú "Más
 *            acciones" (Adjuntar documento/Vincular indicador/Vincular
 *            territorio/Reportar riesgo/Invitar participante/Editar
 *            ficha/Duplicar/Eliminar). Toda acción abre un modal — nunca
 *            un panel de solo lectura que se queda a medias en la
 *            página — y sin permiso queda deshabilitada con tooltip, no
 *            oculta.
 *
 * Componente NUEVO, propio de Detalle — no se toca NodoCard.jsx (ver
 * comentario de cabecera de PanelDetalle.jsx): reusa los mismos modales/
 * formularios compartidos que ya usa NodoCard (ModalRiesgo,
 * ModalDuplicarNodo, ModalNuevaAccion/Tarea, SeccionArchivosNodo,
 * TabIndicadores, TerritorioSelector, SeccionMiembrosNodo) sin duplicar
 * su lógica interna — lo único que se reescribe es el layout de botones
 * que los abre.
 */
import { useState } from 'react';
import {
  TrendingUp, Plus, MoreHorizontal, Paperclip, BarChart3, MapPin,
  AlertTriangle, UserPlus, Pencil, Copy, Trash2, ChevronDown,
} from 'lucide-react';
import MenuDesplegable from '../../common/MenuDesplegable';
import ConfirmDialog from '../../common/ConfirmDialog';
import ModalDuplicarNodo from '../../nodos/ModalDuplicarNodo';
import ModalRiesgo from '../../riesgos/ModalRiesgo';
import ModalNuevaAccion from '../ModalNuevaAccion';
import ModalNuevaTarea from '../ModalNuevaTarea';
import SeccionArchivosNodo from '../../nodos/SeccionArchivosNodo';
import TabIndicadores from '../TabIndicadores';
import TerritorioSelector from '../../nodos/TerritorioSelector';
import SeccionMiembrosNodo from '../SeccionMiembrosNodo';
import ModalAccionNodo from './ModalAccionNodo';
import * as etapasApi from '../../../api/etapas';
import * as accionesApi from '../../../api/acciones';
import * as tareasApi from '../../../api/tareas';
import * as evidenciasApi from '../../../api/evidencias';
import * as actividadApi from '../../../api/actividad';
import { crearRiesgo } from '../../../api/riesgos';
import { NIVELES } from '../../../config/niveles';

const TIPO_LABEL_MIN = { etapa: 'etapa', accion: 'acción', tarea: 'tarea' };
const ENTIDAD_TIPO_RIESGO = { etapa: 'Etapa', accion: 'Accion', tarea: 'Tarea' };

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
  const puedeInvitar = !!permisos?.puedeInvitar;

  const [mostrarModalRiesgo, setMostrarModalRiesgo] = useState(false);
  const [mostrarModalNuevoHijo, setMostrarModalNuevoHijo] = useState(false);
  const [mostrarDuplicar, setMostrarDuplicar] = useState(false);
  const [confirmDuplicarEtapa, setConfirmDuplicarEtapa] = useState(false);
  const [duplicandoEtapa, setDuplicandoEtapa] = useState(false);
  const [confirmEliminar, setConfirmEliminar] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  // null | 'adjuntar' | 'indicador' | 'territorio' | 'invitar' — las 4
  // acciones de "Más acciones" que abren un panel ya existente, ahora
  // dentro de ModalAccionNodo en vez del reveal inline de antes.
  const [modalAccion, setModalAccion] = useState(null);
  const [evidenciasNodo, setEvidenciasNodo] = useState(null);

  async function cargarEvidenciasNodo() {
    try {
      // Mismo criterio que NodoCard: una tarea no tiene tabla de
      // evidencias propia, sus adjuntos se filtran del stream unificado.
      if (tipo === 'tarea') {
        const res = await actividadApi.obtenerActividadNodo(tipo, id);
        const archivos = (res.datos || [])
          .filter(a => a.tipo_evento === 'archivo')
          .map(a => ({
            id: a.id,
            nombre_original: a.archivo_nombre,
            titulo: a.metadata?.titulo || null,
            categoria: a.metadata?.categoria || 'Otro',
            tipo_medio: a.metadata?.tipo_medio || 'archivo',
            url: a.metadata?.tipo_medio === 'link' ? a.archivo_url : undefined,
            autor_nombre: a.autor_nombre,
            created_at: a.created_at,
            notas: a.metadata?.notas || null,
          }));
        setEvidenciasNodo(archivos);
        return;
      }
      const res = tipo === 'etapa'
        ? await evidenciasApi.obtenerEvidenciasEtapa(id)
        : await evidenciasApi.obtenerEvidenciasAccion(id);
      setEvidenciasNodo(res.datos || []);
    } catch { setEvidenciasNodo([]); }
  }

  function abrirModalAccion(nombre) {
    setModalAccion(nombre);
    if (nombre === 'adjuntar' && evidenciasNodo === null) cargarEvidenciasNodo();
  }

  async function crearRiesgoDesdeMenu(datos) {
    await crearRiesgo(datos);
    setMostrarModalRiesgo(false);
    mostrarToast?.('Riesgo reportado', 'exito');
    onCambiado?.();
  }

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
            <ItemMenu icono={Paperclip} label="Adjuntar documento"
              onClick={() => { abrirModalAccion('adjuntar'); cerrar(); }} />
            <ItemMenu icono={BarChart3} label="Vincular indicador"
              onClick={() => { abrirModalAccion('indicador'); cerrar(); }} />
            <ItemMenu icono={MapPin} label="Vincular territorio"
              onClick={() => { abrirModalAccion('territorio'); cerrar(); }} />
            <ItemMenu icono={AlertTriangle} label="Reportar riesgo"
              disabled={soloLectura} title="Sin permiso para reportar riesgos en este elemento"
              onClick={() => { setMostrarModalRiesgo(true); cerrar(); }} />
            <ItemMenu icono={UserPlus} label="Invitar participante"
              disabled={!puedeInvitar} title="Sin permiso para invitar en este elemento"
              onClick={() => { abrirModalAccion('invitar'); cerrar(); }} />
            <div className="my-1 border-t border-gray-100" />
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

      {mostrarModalRiesgo && (
        <ModalRiesgo
          entidadTipo={ENTIDAD_TIPO_RIESGO[tipo]}
          entidadId={id}
          onGuardar={crearRiesgoDesdeMenu}
          onCerrar={() => setMostrarModalRiesgo(false)}
        />
      )}

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

      {modalAccion === 'adjuntar' && (
        <ModalAccionNodo titulo="Adjuntar documento" onCerrar={() => setModalAccion(null)}>
          <SeccionArchivosNodo
            evidencias={evidenciasNodo || []}
            tipo={tipo}
            id={id}
            permisos={permisosProyecto}
            onRecargar={async () => { await cargarEvidenciasNodo(); onCambiado?.(); }}
            capturaPrimero
          />
        </ModalAccionNodo>
      )}

      {modalAccion === 'indicador' && (
        <ModalAccionNodo titulo="Vincular indicador" onCerrar={() => setModalAccion(null)}>
          <TabIndicadores tipo={tipo} nodoId={id} nodoNombre={nodo.nombre} proyectoId={proyectoId} soloLectura={soloLectura} />
        </ModalAccionNodo>
      )}

      {modalAccion === 'territorio' && (
        <ModalAccionNodo titulo="Vincular territorio" onCerrar={() => setModalAccion(null)}>
          <TerritorioSelector
            data={nodo}
            soloLectura={soloLectura}
            soportarZM={tipo !== 'tarea'}
            onGuardar={async (campo, valor) => {
              if (tipo === 'etapa') await etapasApi.patchEtapa(id, { [campo]: valor });
              else if (tipo === 'accion') await accionesApi.patchAccion(id, { [campo]: valor });
              else await tareasApi.patchTarea(id, { [campo]: valor });
              mostrarToast?.('Actualizado', 'exito');
              onCambiado?.();
            }}
          />
        </ModalAccionNodo>
      )}

      {modalAccion === 'invitar' && (
        <ModalAccionNodo titulo="Invitar participante" onCerrar={() => setModalAccion(null)}>
          <SeccionMiembrosNodo tipo={tipo} idNodo={id} permisos={permisos} idProyecto={proyectoId} nombreNodo={nodo.nombre} />
        </ModalAccionNodo>
      )}
    </div>
  );
}
