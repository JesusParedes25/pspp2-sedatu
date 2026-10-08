/**
 * ARCHIVO: PestanaTerritorio.jsx
 * PROPÓSITO: Pestaña "Territorio" del panel de Detalle (Fase 4) — a
 *            diferencia de Documentos/Indicadores/Riesgos, territorio es
 *            un valor único por nodo, no una lista: se muestra en lectura
 *            (o "Sin territorio asignado") con un botón "Editar
 *            territorio" que abre el selector completo en modal. Sin
 *            tabla ni contador de pestaña.
 */
import { useState, useEffect } from 'react';
import { Pencil, MapPin } from 'lucide-react';
import ModalAccionNodo from './ModalAccionNodo';
import TerritorioSelector from '../../nodos/TerritorioSelector';
import * as etapasApi from '../../../api/etapas';
import * as accionesApi from '../../../api/acciones';
import * as tareasApi from '../../../api/tareas';

function tieneTerritorio(nodo) {
  return !!nodo?.cve_ent || (nodo?.municipios || []).length > 0 || !!nodo?.id_zm;
}

export default function PestanaTerritorio({ tipo, id, nodo, permisos, onCambiado, mostrarToast, altaSolicitada, onAltaConsumida }) {
  const [editando, setEditando] = useState(false);
  const soloLectura = permisos?.esSoloLectura ?? true;
  const asignado = tieneTerritorio(nodo);

  // Atajo "Vincular territorio" de "Más acciones" (FilaAcciones.jsx vía
  // PestanasDetalle.jsx) — mismo modal que el botón de aquí abajo.
  useEffect(() => {
    if (altaSolicitada) { setEditando(true); onAltaConsumida?.(); }
  }, [altaSolicitada, onAltaConsumida]);

  async function guardar(campo, valor) {
    if (tipo === 'etapa') await etapasApi.patchEtapa(id, { [campo]: valor });
    else if (tipo === 'accion') await accionesApi.patchAccion(id, { [campo]: valor });
    else await tareasApi.patchTarea(id, { [campo]: valor });
    mostrarToast?.('Actualizado', 'exito');
    onCambiado?.();
  }

  return (
    <div>
      {!asignado ? (
        <div className="flex items-center justify-between py-3">
          <p className="text-xs text-gray-400 flex items-center gap-1.5"><MapPin size={13} /> Sin territorio asignado</p>
          {!soloLectura && (
            <button onClick={() => setEditando(true)} className="flex items-center gap-1 text-[12px] font-medium text-guinda-700 hover:text-guinda-800">
              <Pencil size={12} /> Vincular territorio
            </button>
          )}
        </div>
      ) : (
        <div>
          <div className="flex items-center justify-end mb-2">
            {!soloLectura && (
              <button onClick={() => setEditando(true)} className="flex items-center gap-1 text-[12px] font-medium text-guinda-700 hover:text-guinda-800">
                <Pencil size={12} /> Editar territorio
              </button>
            )}
          </div>
          <TerritorioSelector data={nodo} soloLectura soportarZM={tipo !== 'tarea'} onGuardar={() => {}} />
        </div>
      )}

      {editando && (
        <ModalAccionNodo titulo="Vincular territorio" onCerrar={() => setEditando(false)}>
          <TerritorioSelector
            data={nodo}
            soloLectura={soloLectura}
            soportarZM={tipo !== 'tarea'}
            onGuardar={guardar}
          />
        </ModalAccionNodo>
      )}
    </div>
  );
}
