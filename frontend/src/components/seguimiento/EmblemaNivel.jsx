/**
 * ARCHIVO: EmblemaNivel.jsx
 * PROPÓSITO: Emblema de identidad del nodo seleccionado — ícono grande del
 *            nivel en su color, nombre del tipo, badge de estatus, badge
 *            "Calculado" (si tiene hijos) y una frase que explica su rol
 *            en lenguaje llano. Va debajo del lineage/ladder, arriba del
 *            título, tanto en la columna central de Detalle como en el
 *            drawer de Diagrama.
 */
import { Lock } from 'lucide-react';
import { NIVELES, rolTexto } from '../../config/niveles';
import { COLORES_SEMAFORO, CHIP_BG } from '../common/SemaforoDot';

export default function EmblemaNivel({ tipo, esContenedor, estado, sem }) {
  const nivel = NIVELES[tipo];
  const Icono = nivel.icono;

  return (
    <div className="flex items-start gap-2.5">
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: nivel.colorSuave, color: nivel.color }}
        aria-hidden="true"
      >
        <Icono size={18} />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
          <span
            className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider text-white"
            style={{ backgroundColor: nivel.color }}
          >
            {nivel.label}
          </span>
          <span
            className="text-[10px] font-semibold px-2 py-0.5 rounded"
            style={{ backgroundColor: CHIP_BG[sem], color: COLORES_SEMAFORO[sem] }}
          >
            {(estado || 'Pendiente').replace(/_/g, ' ')}
          </span>
          {esContenedor && (
            <span className="flex items-center gap-0.5 text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
              <Lock size={9} /> calculado
            </span>
          )}
        </div>
        <p className="text-[11px] text-gray-500 leading-snug">{rolTexto(tipo, esContenedor)}</p>
      </div>
    </div>
  );
}
