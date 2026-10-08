/**
 * ARCHIVO: LineaTiempoEventos.jsx
 * PROPÓSITO: Gráfico de línea del tiempo compartido entre la pestaña
 *            Actividad de Detalle y el módulo Bitácora del proyecto —
 *            UN SOLO componente montado en los dos lugares, no dos
 *            implementaciones parecidas. Pensado para entenderse sin
 *            pasar el cursor por ningún marcador:
 *              - Columnas de mes (o trimestre si el rango es largo), con
 *                el nombre del mes en versalitas y una línea vertical
 *                tenue entre columnas que cruza todo el alto.
 *              - Banda de avance (0-100) arriba, línea sin relleno con un
 *                punto por registro; el último, más grande y con su
 *                porcentaje escrito al lado.
 *              - Un carril por tipo de evento debajo, CADA UNO CON SU
 *                NOMBRE escrito a la izquierda — así no hace falta
 *                leyenda ni recordar qué significa cada forma.
 *              - Los riesgos llevan su título corto escrito directo sobre
 *                el marcador, con una línea delgada — son pocos y son lo
 *                que más importa, nunca deberían depender de hover.
 *
 * Geometría de los marcadores (radio/lado/área) en utils/marcadoresTiempo.js,
 * probada aparte. Este componente solo coloca esa geometría sobre el
 * lienzo y conecta la interacción con quien lo monta (ActividadStream.jsx
 * o BitacoraProyecto.jsx), que decide qué pasa al hacer clic.
 */
import { useMemo, useState } from 'react';
import {
  escalaY, construirPathLinea, generarColumnas, escalaXColumnas, formatoFechaLarga, mesesEntre,
} from '../../utils/marcadoresTiempo';
import { agruparPorDiaYCarril, eventosDelMismoDia } from '../../utils/eventosLineaTiempo';
import { NOMBRE_CARRIL, FORMA_CARRIL, coloresActivos } from '../../utils/carrilesEventos';
import MarcadorEvento from './MarcadorEvento';

const LABEL_W = 92;
const COL_W = 90;
const Y_MES_LABEL = 10;
const Y_DIVIDER_TOP = 18;
const Y_AVANCE_LABEL = 26;
const Y_CIEN = 34;
const Y_CERO = 104;
const Y_SEPARADOR = 116;
const Y_CARRILES_TOP = 148;
const LANE_H = 34;
const PAD_INFERIOR = 14;

function truncar(texto, n = 18) {
  if (!texto) return '';
  return texto.length > n ? `${texto.slice(0, n - 1)}…` : texto;
}

export default function LineaTiempoEventos({
  eventos, carriles, serieAvance, rango, hoveredId, onHoverMarker, onClickMarker, nombreAlcance,
}) {
  const [tooltip, setTooltip] = useState(null); // { x, fecha } | null
  const colores = coloresActivos();

  const desde = rango?.desde || (eventos.length || serieAvance.length
    ? Math.min(...[...eventos, ...serieAvance].map(e => new Date(e.createdAt).getTime()))
    : Date.now());
  const hasta = rango?.hasta || (eventos.length || serieAvance.length
    ? Math.max(...[...eventos, ...serieAvance].map(e => new Date(e.createdAt).getTime()))
    : Date.now());

  const modo = mesesEntre(desde, hasta) > 6 ? 'trimestre' : 'mes';
  const x0 = LABEL_W;
  const x1col = useMemo(() => Math.max(1, generarColumnas(desde, hasta, 0, 1, modo).length), [desde, hasta, modo]);
  const x1 = LABEL_W + x1col * COL_W;
  const columnas = useMemo(() => generarColumnas(desde, hasta, x0, x1, modo), [desde, hasta, modo, x1]);

  const yCarril = useMemo(() => {
    const m = {};
    carriles.forEach((c, i) => { m[c] = Y_CARRILES_TOP + i * LANE_H; });
    return m;
  }, [carriles]);

  const vbW = x1 + 16;
  const vbH = Y_CARRILES_TOP + carriles.length * LANE_H + PAD_INFERIOR;

  const puntosAvance = useMemo(() => {
    const ordenados = [...serieAvance]
      .filter(e => e.avance != null)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    return ordenados.map((e, i) => ({
      evento: e,
      x: escalaXColumnas(e.createdAt, columnas),
      y: escalaY(e.avance, Y_CIEN, Y_CERO),
      esUltimo: i === ordenados.length - 1,
    }));
  }, [serieAvance, columnas]);

  const pathAvance = useMemo(() => construirPathLinea(puntosAvance.map(p => ({ x: p.x, y: p.y }))), [puntosAvance]);

  const gruposCarril = useMemo(() => agruparPorDiaYCarril(eventos)
    .filter(g => carriles.includes(g.carril))
    .map(g => ({
      ...g,
      x: escalaXColumnas(g.eventos[0].createdAt, columnas),
      y: yCarril[g.carril],
    })), [eventos, carriles, columnas, yCarril]);

  const todosLosEventos = useMemo(() => [...eventos, ...serieAvance], [eventos, serieAvance]);

  function alEntrarMarcador(x, fecha, idEvento) {
    onHoverMarker?.(idEvento);
    setTooltip({ x, fecha });
  }
  function alSalirMarcador() {
    onHoverMarker?.(null);
    setTooltip(null);
  }

  const eventosDelDiaTooltip = tooltip ? eventosDelMismoDia(todosLosEventos, tooltip.fecha) : [];

  const ariaLabel = `Línea del tiempo de actividad${nombreAlcance ? ` de ${nombreAlcance}` : ''}: `
    + `avance y ${carriles.map(c => (NOMBRE_CARRIL[c] || c).toLowerCase()).join(', ')}, `
    + `de ${formatoFechaLarga(desde)} a ${formatoFechaLarga(hasta)}.`;

  if (todosLosEventos.length < 3) return null;

  return (
    <div className="relative mb-1">
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${vbW} ${vbH}`}
          style={{ minWidth: Math.max(480, vbW * 0.75), width: '100%' }}
          height={vbH * 1.35}
          role="img"
          aria-label={ariaLabel}
        >
          {/* Columnas de mes/trimestre: línea divisoria + nombre arriba */}
          {columnas.map(c => (
            <g key={c.key}>
              <text x={(c.x0 + c.x1) / 2} y={Y_MES_LABEL} textAnchor="middle" fontSize="8.5" fontWeight="700"
                letterSpacing="0.5" fill="#9ca3af">
                {c.label}
              </text>
              <line x1={c.x0} y1={Y_DIVIDER_TOP} x2={c.x0} y2={vbH - PAD_INFERIOR} stroke="#eef0f3" strokeWidth={1} />
            </g>
          ))}
          <line x1={x1} y1={Y_DIVIDER_TOP} x2={x1} y2={vbH - PAD_INFERIOR} stroke="#eef0f3" strokeWidth={1} />

          {/* Banda de avance */}
          <text x={x0 - 6} y={Y_AVANCE_LABEL} textAnchor="end" fontSize="7.5" fontWeight="700" letterSpacing="0.4" fill="#9ca3af">
            AVANCE %
          </text>
          {[0, 50, 100].map(v => (
            <g key={v}>
              <line x1={x0} y1={escalaY(v, Y_CIEN, Y_CERO)} x2={x1} y2={escalaY(v, Y_CIEN, Y_CERO)} stroke="#f1f2f4" strokeWidth={1} />
              <text x={x0 - 6} y={escalaY(v, Y_CIEN, Y_CERO) + 3} textAnchor="end" fontSize="8" fill="#9ca3af">{v}</text>
            </g>
          ))}
          {pathAvance && <path d={pathAvance} fill="none" stroke={colores.avance} strokeWidth={1.6} />}
          {puntosAvance.map(p => (
            <g
              key={p.evento.id}
              onMouseEnter={() => alEntrarMarcador(p.x, p.evento.createdAt, p.evento.id)}
              onMouseLeave={alSalirMarcador}
              onClick={() => onClickMarker?.(p.evento)}
              style={{ cursor: 'pointer' }}
            >
              <MarcadorEvento forma="circulo" cx={p.x} cy={p.y} color={colores.avance}
                resaltado={hoveredId === p.evento.id} escala={p.esUltimo ? 1.5 : 1} />
              {p.esUltimo && (
                <text x={p.x + 10} y={p.y + 3} fontSize="9.5" fontWeight="700" fill={colores.avance}>
                  {p.evento.avance}%
                </text>
              )}
            </g>
          ))}

          <line x1={x0} y1={Y_SEPARADOR} x2={x1} y2={Y_SEPARADOR} stroke="#e5e7eb" strokeWidth={1} />

          {/* Carriles */}
          {carriles.map(carril => {
            const y = yCarril[carril];
            return (
              <g key={carril}>
                <text x={x0 - 6} y={y + 3} textAnchor="end" fontSize="8.5" fontWeight="600" fill="#6b7280">
                  {NOMBRE_CARRIL[carril] || carril}
                </text>
                <line x1={x0} y1={y} x2={x1} y2={y} stroke="#f3f4f6" strokeWidth={1} />
              </g>
            );
          })}

          {gruposCarril.map(g => {
            const activo = g.eventos.some(e => e.id === hoveredId);
            const color = colores[g.carril];
            const principal = g.eventos[0];
            const esRiesgo = g.carril === 'riesgo';
            const etiqueta = esRiesgo
              ? (g.eventos.length > 1 ? `${g.eventos.length} riesgos` : truncar(principal.titulo))
              : null;
            return (
              <g
                key={`${g.carril}-${g.dia}-${principal.id}`}
                onMouseEnter={() => alEntrarMarcador(g.x, principal.createdAt, principal.id)}
                onMouseLeave={alSalirMarcador}
                onClick={() => onClickMarker?.(principal)}
                style={{ cursor: 'pointer' }}
              >
                {esRiesgo && etiqueta && (
                  <>
                    <line x1={g.x} y1={g.y - 7} x2={g.x} y2={g.y - 16} stroke={color} strokeWidth={1} opacity={0.6} />
                    <text x={g.x} y={g.y - 19} textAnchor="middle" fontSize="8" fontWeight="600" fill={color}>
                      {etiqueta}
                    </text>
                  </>
                )}
                <MarcadorEvento forma={FORMA_CARRIL[g.carril]} cx={g.x} cy={g.y} color={color} resaltado={activo} />
                {g.eventos.length > 1 && !esRiesgo && (
                  <text x={g.x + 9} y={g.y + 3} fontSize="8" fontWeight="700" fontFamily="monospace" fill={color}>
                    {g.eventos.length}
                  </text>
                )}
              </g>
            );
          })}

          {/* Guía de hover + recuadro con todo lo que pasó ese día */}
          {tooltip && (
            <line x1={tooltip.x} y1={Y_DIVIDER_TOP} x2={tooltip.x} y2={vbH - PAD_INFERIOR} stroke="#9ca3af" strokeWidth={1} strokeDasharray="2,2" opacity={0.6} />
          )}
        </svg>
      </div>

      {tooltip && eventosDelDiaTooltip.length > 0 && (
        <div className="absolute z-10 top-1 left-1 max-w-xs bg-white border border-gray-200 shadow-lg rounded-lg px-3 py-2 pointer-events-none">
          <p className="text-[11px] font-semibold text-gray-800 mb-1">{formatoFechaLarga(tooltip.fecha)}</p>
          <ul className="space-y-0.5">
            {eventosDelDiaTooltip.slice(0, 6).map(e => (
              <li key={e.id} className="text-[10.5px] text-gray-600 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: colores[e.carril] }} />
                {e.titulo}
                {e.avance != null && <span className="font-medium">· {e.avance}%</span>}
              </li>
            ))}
            {eventosDelDiaTooltip.length > 6 && (
              <li className="text-[10.5px] text-gray-400">y {eventosDelDiaTooltip.length - 6} más</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
