/**
 * ARCHIVO: MarcadorEvento.jsx
 * PROPÓSITO: Dibuja la forma de un marcador (círculo relleno, cuadrado,
 *            rombo, triángulo, círculo hueco) centrada en (cx,cy) — pieza
 *            compartida entre LineaTiempoEventos.jsx (marcadores del
 *            gráfico, tamaño normal) y BitacoraCronologica.jsx (puntos
 *            chicos del riel de la lista), para que la lista muestre
 *            literalmente la misma forma que el gráfico y no un ícono
 *            parecido hecho aparte.
 *
 * Geometría de cada forma (radio/lado/área) en utils/marcadoresTiempo.js.
 */
import { RADIO_BASE, geometriaCirculo, geometriaCuadrado, geometriaRombo, geometriaTriangulo } from '../../utils/marcadoresTiempo';

export default function MarcadorEvento({ forma, cx, cy, color, resaltado, escala = 1 }) {
  const opacidad = resaltado ? 1 : 0.9;
  const anillo = resaltado ? <circle cx={cx} cy={cy} r={9 * escala} fill="none" stroke={color} strokeWidth={1.5} opacity={0.35} /> : null;

  if (forma === 'cuadrado') {
    const g = geometriaCuadrado(cx, cy);
    const w = g.width * escala;
    const h = g.height * escala;
    return <g>{anillo}<rect x={cx - w / 2} y={cy - h / 2} width={w} height={h} fill={color} opacity={opacidad} /></g>;
  }
  if (forma === 'rombo') {
    const d = geometriaRombo(0, 0).right.x * escala;
    return <g>{anillo}<path d={`M ${cx} ${cy - d} L ${cx + d} ${cy} L ${cx} ${cy + d} L ${cx - d} ${cy} Z`} fill={color} opacity={opacidad} /></g>;
  }
  if (forma === 'triangulo') {
    // geometriaTriangulo ya da coordenadas absolutas respecto a (cx,cy);
    // para escalar (p. ej. el último punto de avance se dibuja más
    // grande) se toma el offset de cada vértice respecto al centro y se
    // multiplica por la escala.
    const g = geometriaTriangulo(cx, cy);
    const offTop = { x: (g.top.x - cx) * escala, y: (g.top.y - cy) * escala };
    const offLeft = { x: (g.left.x - cx) * escala, y: (g.left.y - cy) * escala };
    const offRight = { x: (g.right.x - cx) * escala, y: (g.right.y - cy) * escala };
    const path = `M ${cx + offTop.x} ${cy + offTop.y} L ${cx + offRight.x} ${cy + offRight.y} L ${cx + offLeft.x} ${cy + offLeft.y} Z`;
    return <g>{anillo}<path d={path} fill={color} opacity={opacidad} /></g>;
  }
  if (forma === 'circuloHueco') {
    const g = geometriaCirculo(cx, cy, RADIO_BASE * escala);
    return <g>{anillo}<circle cx={g.cx} cy={g.cy} r={g.r} fill="none" stroke={color} strokeWidth={1.8} opacity={opacidad} /></g>;
  }
  // circulo relleno (avance / comentario)
  const g = geometriaCirculo(cx, cy, RADIO_BASE * escala);
  return <g>{anillo}<circle cx={g.cx} cy={g.cy} r={g.r} fill={color} opacity={opacidad} /></g>;
}
