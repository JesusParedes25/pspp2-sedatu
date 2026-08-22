/**
 * ARCHIVO: BloqueEditable.jsx
 * PROPÓSITO: Bloque "de origen del avance" para un nodo HOJA (sin hijos) —
 *            muestra el % actual, siempre visible (no detrás de un botón
 *            que abre/cierra), y abre el modal unificado "Registrar
 *            avance" (mismo componente que usan NodoCard y Mis
 *            actividades) para capturarlo — así no hay dos controles de
 *            avance distintos para el mismo nodo en el mismo rail.
 */
import { useState } from 'react';
import { NIVELES } from '../../config/niveles';
import ModalRegistrarAvance from '../nodos/ModalRegistrarAvance';

const ESTADOS_CONGELADOS = { Completada: 'Completada: 100%', Bloqueada: 'Bloqueada: avance congelado', Cancelada: 'Cancelada' };

export default function BloqueEditable({ tipo, nodo, avanceEfectivo, soloLectura, onCambiado }) {
  const nivel = NIVELES[tipo];
  const [mostrarModal, setMostrarModal] = useState(false);
  const estado = nodo.estado || 'Pendiente';
  const congelado = ESTADOS_CONGELADOS[estado];
  const mostrado = Math.round(nodo.avance_actual ?? avanceEfectivo ?? 0);

  return (
    <div className="mb-3 px-3 py-2.5 bg-white border border-gray-200 rounded-lg">
      <span className="text-[9px] font-semibold text-gray-500 uppercase tracking-wider block mb-0.5">
        Avance de esta {nivel.label.toLowerCase()}
      </span>
      <p className="text-[10px] text-gray-400 mb-2">Trabajo directo — tú registras el avance.</p>

      <span className="text-lg font-bold tabular-nums text-gray-700">{mostrado}%</span>
      {congelado && <p className="text-[10px] text-gray-400 mt-0.5">{congelado}</p>}

      {!soloLectura && !congelado && (
        <div className="mt-1.5">
          <button
            onClick={() => setMostrarModal(true)}
            className="text-[11px] font-medium bg-guinda-600 text-white px-3 py-1.5 rounded-md hover:bg-guinda-700 transition-colors"
          >
            Registrar avance
          </button>
        </div>
      )}

      {mostrarModal && (
        <ModalRegistrarAvance
          tipo={tipo}
          nodo={nodo}
          esContenedor={false}
          onGuardado={onCambiado}
          onCerrar={() => setMostrarModal(false)}
        />
      )}
    </div>
  );
}
