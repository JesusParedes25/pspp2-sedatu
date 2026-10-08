/**
 * ARCHIVO: BitacoraCronologica.jsx
 * PROPÓSITO: Lista de eventos como continuación del gráfico
 *            LineaTiempoEventos.jsx — no una lista plana: encabezados de
 *            mes pegajosos, un riel vertical con un punto por evento (la
 *            MISMA forma/color que su marcador en el gráfico, vía
 *            MarcadorEvento compartido), avance al momento de cada
 *            evento, y renglones de "N días sin movimiento" entre huecos
 *            de inactividad. Compartida entre la pestaña Actividad de
 *            Detalle y el módulo Bitácora — recibe eventos ya
 *            normalizados (ver utils/eventosLineaTiempo.js) y no sabe de
 *            dónde vinieron.
 */
import { useMemo } from 'react';
import { ExternalLink } from 'lucide-react';
import { claveMes, formatoFechaCorta } from '../../utils/marcadoresTiempo';
import { conAvanceEnElMomento, detectarHuecos } from '../../utils/eventosLineaTiempo';
import { NOMBRE_CARRIL, FORMA_CARRIL, coloresActivos } from '../../utils/carrilesEventos';
import MarcadorEvento from './MarcadorEvento';

const MESES_LARGOS = [
  'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
  'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE',
];

function etiquetaMes(fecha) {
  const d = new Date(fecha);
  return `${MESES_LARGOS[d.getMonth()]} ${d.getFullYear()}`;
}

function colorBarra(porcentaje) {
  if (porcentaje >= 75) return '#16a34a';
  if (porcentaje >= 50) return '#ca8a04';
  if (porcentaje >= 25) return '#ea580c';
  return '#dc2626';
}

export default function BitacoraCronologica({
  eventos, hoveredId, onHoverEvento, onClickEvento, onNavegarNodo, mostrarNodoOrigen = false,
}) {
  const colores = coloresActivos();

  const conAvance = useMemo(() => conAvanceEnElMomento(eventos), [eventos]);
  const huecos = useMemo(() => detectarHuecos(eventos, 10), [eventos]);
  const huecoTrasId = useMemo(() => {
    const m = new Map();
    huecos.forEach(h => m.set(h.trasId, h));
    return m;
  }, [huecos]);

  const grupos = useMemo(() => {
    const porMes = [];
    let claveActual = null;
    let grupoActual = null;
    for (const ev of conAvance) {
      const clave = claveMes(ev.createdAt);
      if (clave !== claveActual) {
        claveActual = clave;
        grupoActual = { clave, etiqueta: etiquetaMes(ev.createdAt), filas: [] };
        porMes.push(grupoActual);
      }
      grupoActual.filas.push({ tipo: 'evento', evento: ev });
      const hueco = huecoTrasId.get(ev.id);
      if (hueco) grupoActual.filas.push({ tipo: 'hueco', hueco });
    }
    return porMes;
  }, [conAvance, huecoTrasId]);

  if (eventos.length === 0) {
    return <p className="text-xs text-gray-400 italic py-3">Sin actividad registrada.</p>;
  }

  return (
    <div>
      {grupos.map(grupo => (
        <div key={grupo.clave}>
          <div className="sticky top-0 z-[6] bg-white/97 backdrop-blur-sm flex items-center justify-between px-1 py-1.5 border-b border-gray-100">
            <span className="text-[10px] font-bold tracking-wide text-gray-500">{grupo.etiqueta}</span>
            <span className="text-[10px] text-gray-400">
              {grupo.filas.filter(f => f.tipo === 'evento').length} registro{grupo.filas.filter(f => f.tipo === 'evento').length !== 1 ? 's' : ''}
            </span>
          </div>

          <div className="relative ml-2 pl-4 border-l-2 border-gray-100">
            {grupo.filas.map((fila, idx) => {
              if (fila.tipo === 'hueco') {
                return (
                  <div key={`hueco-${idx}`} className="relative -ml-4 pl-4 py-1">
                    <span className="absolute left-[-5px] top-1/2 -translate-y-1/2 w-2 h-2 rounded-full" style={{ backgroundColor: colores.riesgo }} />
                    <p className="text-[10.5px] italic" style={{ color: colores.riesgo }}>
                      {fila.hueco.dias} días sin movimiento
                    </p>
                  </div>
                );
              }

              const ev = fila.evento;
              const resaltado = hoveredId === ev.id;
              const forma = FORMA_CARRIL[ev.carril] || 'circulo';
              const color = colores[ev.carril] || colores.comentario;

              return (
                <div
                  key={ev.id}
                  id={`evento-fila-${ev.id}`}
                  onMouseEnter={() => onHoverEvento?.(ev.id)}
                  onMouseLeave={() => onHoverEvento?.(null)}
                  onClick={() => onClickEvento?.(ev)}
                  className={`relative -ml-4 pl-4 pr-1.5 py-2 flex items-start gap-2.5 rounded-lg cursor-pointer transition-colors ${resaltado ? 'bg-guinda-50' : 'hover:bg-gray-50'}`}
                >
                  <svg width="18" height="18" className="absolute left-[-9px] top-2.5 flex-shrink-0" viewBox="0 0 18 18">
                    <MarcadorEvento forma={forma} cx={9} cy={9} color={color} resaltado={resaltado} escala={0.85} />
                  </svg>

                  <span className="text-[10px] text-gray-400 w-10 flex-shrink-0 pt-0.5">{formatoFechaCorta(ev.createdAt)}</span>

                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-gray-800 truncate">{ev.titulo}</p>
                    {ev.contenido && ev.contenido !== ev.titulo && (
                      <p className="text-[11px] text-gray-500 line-clamp-2 mt-0.5">{ev.contenido}</p>
                    )}
                    <p className="text-[10px] text-gray-400 mt-0.5 flex flex-wrap items-center gap-x-1.5">
                      <span>{NOMBRE_CARRIL[ev.carril] || (ev.carril === 'avance' ? 'Avance' : ev.carril)}</span>
                      {ev.autorNombre && <span>· {ev.autorNombre}</span>}
                      {mostrarNodoOrigen && ev.nodo?.nombre && (
                        <>
                          <span>·</span>
                          <button
                            onClick={e => { e.stopPropagation(); onNavegarNodo?.(ev.nodo); }}
                            className="inline-flex items-center gap-0.5 text-guinda-600 hover:underline font-medium"
                          >
                            {ev.nodo.nombre} <ExternalLink size={9} />
                          </button>
                        </>
                      )}
                    </p>
                  </div>

                  {ev.avanceEnElMomento != null && (
                    <div className="hidden min-[761px]:flex flex-col items-end flex-shrink-0 w-14 pt-0.5">
                      <span className="text-[10px] font-medium text-gray-600">{ev.avanceEnElMomento}%</span>
                      <div className="w-full h-1 bg-gray-100 rounded-full overflow-hidden mt-0.5">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${ev.avanceEnElMomento}%`, backgroundColor: colorBarra(ev.avanceEnElMomento) }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
