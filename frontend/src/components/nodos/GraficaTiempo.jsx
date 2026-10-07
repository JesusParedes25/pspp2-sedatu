/**
 * ARCHIVO: GraficaTiempo.jsx
 * PROPÓSITO: Gráfico de línea del tiempo de "Evolución en el tiempo"
 *            (Fase 5 del rediseño de Detalle) — reemplaza la sparkline de
 *            solo-avance anterior. Eje vertical 0-100 (avance); eje
 *            horizontal tiempo, con ~8 marcas de fecha. La línea de
 *            avance (círculo relleno por registro) vive en el área del
 *            gráfico, sin relleno bajo la curva. Documentos (cuadrado),
 *            riesgos (triángulo) y comentarios (círculo hueco) van en un
 *            carril aparte, abajo, con su propia línea base — no tienen
 *            valor en el eje Y, mezclarlos con la serie de avance no
 *            tendría sentido.
 *
 * Geometría de los marcadores (radio/lado/área) sale de
 * utils/marcadoresTiempo.js, probado aparte (marcadoresTiempo.test.js) —
 * este componente solo coloca esa geometría sobre el lienzo y conecta la
 * interacción (hover/clic) con la bitácora de ActividadStream.jsx.
 */
import { useMemo, useState } from 'react';
import {
  escalaX, escalaY, geometriaCirculo, geometriaCuadrado, geometriaTriangulo,
  construirPathLinea, generarMarcasFecha, formatoFechaCorta, claveDia,
} from '../../utils/marcadoresTiempo';

const VB_W = 680;
const VB_H = 190;
const PAD_IZQ = 28;
const PAD_DER = 14;
const Y_CIEN = 10;   // y del 100% de avance
const Y_CERO = 110;  // y del 0% de avance
const Y_EJE_FECHAS = 128;
const Y_CARRIL = 158; // línea base del carril de eventos no-avance

// Colores validados contra contraste y daltonismo — se usan tal cual, sin
// derivarlos de la paleta genérica de Tailwind. prefers-color-scheme (no
// hay toggle de tema propio en esta app) decide cuál paleta aplica.
const COLORES_CLARO = { avance: '#a32a4d', documento: '#2272a8', riesgo: '#c94a1e', comentario: '#6b7280' };
const COLORES_OSCURO = { avance: '#c4697f', documento: '#2f86bd', riesgo: '#cf7640', comentario: '#9ca3af' };

function usaOscuro() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
}

function puntosAvanceDe(items) {
  const puntos = [];
  for (const item of [...items].reverse()) {
    if (item.tipo_evento === 'cambio_avance' && item.metadata?.avance_actual != null) {
      puntos.push({ item, fecha: item.created_at, avance: Math.round(parseFloat(item.metadata.avance_actual)) });
    } else if (item.tipo_evento === 'cambio_estatus') {
      if (item.metadata?.estado === 'Completada') puntos.push({ item, fecha: item.created_at, avance: 100 });
      else if (item.metadata?.estado === 'Pendiente') puntos.push({ item, fecha: item.created_at, avance: 0 });
    }
  }
  return puntos;
}

const TIPO_CARRIL = { archivo: 'documento', riesgo: 'riesgo', comentario: 'comentario' };

// Agrupa los eventos del carril bajo por día calendario — varios documentos/
// riesgos/comentarios del mismo día comparten un solo marcador con contador.
function agruparPorDia(items) {
  const porClave = new Map();
  for (const item of items) {
    const tipoCarril = TIPO_CARRIL[item.tipo_evento];
    if (!tipoCarril) continue;
    // Un mismo día puede traer tipos distintos (un documento Y un
    // comentario) — se agrupan por día + tipo, no solo por día, para no
    // mezclar formas de marcador bajo un único ícono.
    const clave = `${claveDia(item.created_at)}|${tipoCarril}`;
    if (!porClave.has(clave)) porClave.set(clave, { tipoCarril, eventos: [] });
    porClave.get(clave).eventos.push(item);
  }
  return [...porClave.values()];
}

function MarcadorForma({ tipo, cx, cy, color, resaltado }) {
  const opacidad = resaltado ? 1 : 0.85;
  const anillo = resaltado ? (
    <circle cx={cx} cy={cy} r={8} fill="none" stroke={color} strokeWidth={1.5} opacity={0.35} />
  ) : null;

  if (tipo === 'avance') {
    const g = geometriaCirculo(cx, cy);
    return <g>{anillo}<circle cx={g.cx} cy={g.cy} r={g.r} fill={color} opacity={opacidad} /></g>;
  }
  if (tipo === 'documento') {
    const g = geometriaCuadrado(cx, cy);
    return <g>{anillo}<rect x={g.x} y={g.y} width={g.width} height={g.height} fill={color} opacity={opacidad} /></g>;
  }
  if (tipo === 'riesgo') {
    const g = geometriaTriangulo(cx, cy);
    return <g>{anillo}<path d={g.path} fill={color} opacity={opacidad} /></g>;
  }
  // comentario: círculo hueco — distinguible por forma, no solo por color.
  const g = geometriaCirculo(cx, cy);
  return <g>{anillo}<circle cx={g.cx} cy={g.cy} r={g.r} fill="none" stroke={color} strokeWidth={1.6} opacity={opacidad} /></g>;
}

export default function GraficaTiempo({ items, hoveredId, onHoverMarker, onClickMarker }) {
  const [tooltip, setTooltip] = useState(null); // { x, y, fecha, avance } | null
  const colores = usaOscuro() ? COLORES_OSCURO : COLORES_CLARO;

  const fechas = items.map(i => new Date(i.created_at).getTime()).filter(Number.isFinite);
  const fechaMin = fechas.length ? new Date(Math.min(...fechas)) : new Date();
  const fechaMax = fechas.length ? new Date(Math.max(...fechas)) : new Date();
  const x0 = PAD_IZQ;
  const x1 = VB_W - PAD_DER;

  const puntosAvance = useMemo(() => puntosAvanceDe(items), [items]);
  const puntosXY = useMemo(() => puntosAvance.map(p => ({
    ...p,
    x: escalaX(p.fecha, fechaMin, fechaMax, x0, x1),
    y: escalaY(p.avance, Y_CIEN, Y_CERO),
  })), [puntosAvance, fechaMin, fechaMax]);

  const pathLinea = useMemo(() => construirPathLinea(puntosXY), [puntosXY]);

  const gruposCarril = useMemo(() => agruparPorDia(items).map(g => {
    const principal = g.eventos[0];
    return {
      ...g,
      principal,
      x: escalaX(principal.created_at, fechaMin, fechaMax, x0, x1),
    };
  }), [items, fechaMin, fechaMax]);

  const marcasFecha = useMemo(() => generarMarcasFecha(fechaMin, fechaMax, 8), [fechaMin, fechaMax]);

  if (items.length === 0) return null;

  return (
    <div className="relative mb-1" data-chart="evolucion-tiempo">
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} width="100%" height={180} preserveAspectRatio="none">
        {/* Eje Y: 0/50/100 como referencia discreta, sin rejilla pesada */}
        {[0, 50, 100].map(v => (
          <text key={v} x={x0 - 6} y={escalaY(v, Y_CIEN, Y_CERO) + 3} textAnchor="end" fontSize="8" fill="#9ca3af">{v}</text>
        ))}

        {/* Línea de avance — sin relleno bajo la curva */}
        {pathLinea && <path d={pathLinea} fill="none" stroke={colores.avance} strokeWidth={1.5} />}
        {puntosXY.map(p => (
          <g
            key={p.item.id}
            onMouseEnter={() => { onHoverMarker?.(p.item.id); setTooltip({ x: p.x, y: p.y, fecha: p.fecha, avance: p.avance }); }}
            onMouseLeave={() => { onHoverMarker?.(null); setTooltip(null); }}
            onClick={() => onClickMarker?.(p.item)}
            style={{ cursor: 'pointer' }}
          >
            <MarcadorForma tipo="avance" cx={p.x} cy={p.y} color={colores.avance} resaltado={hoveredId === p.item.id} />
          </g>
        ))}

        {/* Guía punteada hacia el eje cuando se resalta un punto de avance */}
        {tooltip && (
          <>
            <line x1={tooltip.x} y1={tooltip.y} x2={tooltip.x} y2={Y_CERO} stroke={colores.avance} strokeWidth={1} strokeDasharray="2,2" opacity={0.5} />
            <text x={tooltip.x} y={tooltip.y - 10} textAnchor="middle" fontSize="9" fontWeight="600" fill={colores.avance}>
              {formatoFechaCorta(tooltip.fecha)} · {tooltip.avance}%
            </text>
          </>
        )}

        {/* Eje de fechas */}
        <line x1={x0} y1={Y_EJE_FECHAS} x2={x1} y2={Y_EJE_FECHAS} stroke="#e5e7eb" strokeWidth={1} />
        {marcasFecha.map((f, i) => (
          <text key={i} x={escalaX(f, fechaMin, fechaMax, x0, x1)} y={Y_EJE_FECHAS + 12} textAnchor="middle" fontSize="8" fill="#9ca3af">
            {formatoFechaCorta(f)}
          </text>
        ))}

        {/* Carril de eventos no-avance, con su propia línea base */}
        <line x1={x0} y1={Y_CARRIL} x2={x1} y2={Y_CARRIL} stroke="#f3f4f6" strokeWidth={1} />
        {gruposCarril.map(g => {
          const activo = g.eventos.some(e => e.id === hoveredId);
          return (
            <g
              key={`${g.tipoCarril}-${g.principal.id}`}
              onMouseEnter={() => onHoverMarker?.(g.principal.id)}
              onMouseLeave={() => onHoverMarker?.(null)}
              onClick={() => onClickMarker?.(g.principal)}
              style={{ cursor: 'pointer' }}
            >
              <MarcadorForma tipo={g.tipoCarril} cx={g.x} cy={Y_CARRIL} color={colores[g.tipoCarril]} resaltado={activo} />
              {g.eventos.length > 1 && (
                <text x={g.x + 7} y={Y_CARRIL - 5} fontSize="8" fontWeight="700" fill={colores[g.tipoCarril]}>
                  {g.eventos.length}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
