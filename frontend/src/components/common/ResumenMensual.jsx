/**
 * ARCHIVO: ResumenMensual.jsx
 * PROPÓSITO: Franja de texto, una columna por mes/trimestre visible,
 *            justo debajo de LineaTiempoEventos — la "red de seguridad"
 *            del gráfico: aunque alguien no sepa leer un gráfico, aquí
 *            está la respuesta escrita en español ("2 de avance, cerró
 *            en 56% · 1 documento · 1 riesgo · 1 comentario"), o "sin
 *            movimiento" si el periodo no tuvo nada. No se omite nunca.
 */
import { useMemo } from 'react';
import { generarColumnas, mesesEntre } from '../../utils/marcadoresTiempo';
import { resumenPorColumna } from '../../utils/eventosLineaTiempo';

export default function ResumenMensual({ eventos, serieAvance, rango }) {
  const desde = rango?.desde;
  const hasta = rango?.hasta;
  const modo = desde && hasta && mesesEntre(desde, hasta) > 6 ? 'trimestre' : 'mes';

  const columnas = useMemo(
    () => (desde && hasta ? generarColumnas(desde, hasta, 0, 1, modo) : []),
    [desde, hasta, modo]
  );

  const todosLosEventos = useMemo(() => [...eventos, ...serieAvance], [eventos, serieAvance]);
  const resumen = useMemo(() => resumenPorColumna(todosLosEventos, columnas), [todosLosEventos, columnas]);

  if (resumen.length === 0) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 mb-4">
      {resumen.map(mes => (
        <div key={mes.key} className={`rounded-lg border px-2.5 py-2 ${mes.total > 0 ? 'border-gray-200 bg-gray-50' : 'border-gray-100 bg-white'}`}>
          <p className="text-[9.5px] font-bold tracking-wide text-gray-500 mb-0.5">{mes.label}</p>
          <p className={`text-[11px] leading-snug ${mes.total > 0 ? 'text-gray-700' : 'text-gray-400 italic'}`}>
            {mes.texto}
          </p>
        </div>
      ))}
    </div>
  );
}
