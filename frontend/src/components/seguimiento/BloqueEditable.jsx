/**
 * ARCHIVO: BloqueEditable.jsx
 * PROPÓSITO: Bloque "de origen del avance" para un nodo HOJA (sin hijos) —
 *            control real para capturar el porcentaje, siempre visible
 *            (no detrás de un botón que abre/cierra). Es el único lugar
 *            donde se captura el avance: el botón "Registrar avance" de
 *            las acciones rápidas del mismo rail hace scroll hasta aquí
 *            en vez de abrir su propio control, para no duplicar la
 *            misma captura en dos lugares (ver forwardRef + onRegistrarRef).
 */
import { forwardRef } from 'react';
import { NIVELES } from '../../config/niveles';
import { useAvanceNodo } from '../../hooks/useAvanceNodo';

const ESTADOS_CONGELADOS = { Completada: 'Completada: 100%', Bloqueada: 'Bloqueada: avance congelado', Cancelada: 'Cancelada' };

export default forwardRef(function BloqueEditable({ tipo, nodo, avanceEfectivo, soloLectura, onCambiado }, ref) {
  const nivel = NIVELES[tipo];
  const { avanceTemp, setAvanceTemp, guardando, guardar } = useAvanceNodo(tipo, nodo, onCambiado);
  const estado = nodo.estado || 'Pendiente';
  const congelado = ESTADOS_CONGELADOS[estado];
  const mostrado = Math.round(nodo.avance_actual ?? avanceEfectivo ?? 0);

  return (
    <div ref={ref} tabIndex={-1} className="mb-3 px-3 py-2.5 bg-white border border-gray-200 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-guinda-300">
      <span className="text-[9px] font-semibold text-gray-500 uppercase tracking-wider block mb-0.5">
        Avance de esta {nivel.label.toLowerCase()}
      </span>
      <p className="text-[10px] text-gray-400 mb-2">Trabajo directo — tú registras el avance.</p>

      {soloLectura || congelado ? (
        <>
          <span className="text-lg font-bold tabular-nums text-gray-700">{mostrado}%</span>
          {congelado && <p className="text-[10px] text-gray-400 mt-0.5">{congelado}</p>}
        </>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-1.5">
            <input
              type="range" min={0} max={99} value={avanceTemp}
              onChange={e => setAvanceTemp(Number(e.target.value))}
              className="flex-1 h-1.5 accent-guinda-600"
              aria-label={`Avance de esta ${nivel.label.toLowerCase()}`}
            />
            <span className="text-sm font-bold tabular-nums w-10 text-right">{avanceTemp}%</span>
          </div>
          <button
            onClick={() => guardar(avanceTemp)}
            disabled={guardando || avanceTemp === mostrado}
            className="text-[11px] font-medium bg-guinda-600 text-white px-3 py-1.5 rounded-md hover:bg-guinda-700 disabled:opacity-40 transition-colors"
          >
            {guardando ? 'Guardando…' : 'Guardar avance'}
          </button>
          <p className="text-[9px] text-gray-400 mt-1.5 leading-snug">Captura el avance parcial (0-99). Marca "Concluido" para llegar al 100%.</p>
        </>
      )}
    </div>
  );
});
