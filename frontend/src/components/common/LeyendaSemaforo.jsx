/**
 * ARCHIVO: LeyendaSemaforo.jsx
 * PROPÓSITO: La leyenda de los cuatro casos del semáforo — extraída del
 *            pie del árbol de Detalle (EtapasAvancesMD/index.jsx) para
 *            poder reusarla tal cual en la pantalla de Inicio (bloque
 *            4.3b de "PSPP v2.0 · Pantalla de Inicio"), en vez de
 *            redactar una copia aparte que se pueda desincronizar si
 *            algún día cambian los colores o los nombres. Lee los
 *            mismos COLORES_SEMAFORO/LEYENDA_SEMAFORO que ya usa
 *            SemaforoDot en toda la plataforma.
 */
import { CheckCircle2 } from 'lucide-react';
import { COLORES_SEMAFORO, LEYENDA_SEMAFORO } from './SemaforoDot';

export default function LeyendaSemaforo({ className = '' }) {
  return (
    <div className={`flex items-center flex-wrap gap-x-2.5 gap-y-1 text-[9px] text-gray-500 ${className}`}>
      <span className="font-semibold text-gray-400">Urgencia:</span>
      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: COLORES_SEMAFORO.verde }} />{LEYENDA_SEMAFORO.verde}</span>
      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: COLORES_SEMAFORO.ambar }} />{LEYENDA_SEMAFORO.ambar}</span>
      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: COLORES_SEMAFORO.rojo }} />{LEYENDA_SEMAFORO.rojo}</span>
      <span className="font-semibold text-gray-400 ml-1">Sin urgencia:</span>
      <span className="flex items-center gap-1"><CheckCircle2 size={9} className="text-emerald-600 flex-shrink-0" />Completada</span>
      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full flex-shrink-0 border border-gray-300" style={{ backgroundColor: COLORES_SEMAFORO.gris }} />{LEYENDA_SEMAFORO.gris}</span>
    </div>
  );
}
