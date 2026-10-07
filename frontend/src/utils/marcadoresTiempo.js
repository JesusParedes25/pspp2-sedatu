/**
 * ARCHIVO: marcadoresTiempo.js
 * PROPÓSITO: Cálculo puro (sin React, sin DOM) de las coordenadas del
 *            gráfico de línea del tiempo de "Evolución en el tiempo"
 *            (Fase 5 del rediseño de Detalle) — escalas X/Y y geometría
 *            de los 4 marcadores (círculo relleno = avance, cuadrado =
 *            documento, triángulo = riesgo, círculo hueco = comentario).
 *
 * Todo con números explícitos (Number(...) en cada entrada): si una
 * coordenada llega como string desde quien llama, `x0 + frac * (x1 - x0)`
 * concatenaría en vez de sumar y el marcador saldría deforme/fuera de
 * lugar — de ahí el `Number()` en cada función exportada, no solo
 * confiar en que el caller ya mandó números. Ver
 * marcadoresTiempo.test.js para el caso que esto previene.
 */

// Radio del círculo de referencia (avance) — los demás marcadores se
// dimensionan para que su ÁREA visual sea igual, no su radio: un
// cuadrado/triángulo del mismo "radio nominal" que un círculo se ve
// notablemente más chico a simple vista.
export const RADIO_AVANCE = 4.5;
const AREA_REFERENCIA = Math.PI * RADIO_AVANCE * RADIO_AVANCE;

export function geometriaCirculo(cx, cy, r = RADIO_AVANCE) {
  return { cx: Number(cx), cy: Number(cy), r: Number(r) };
}

// Cuadrado centrado en (cx,cy) con área == AREA_REFERENCIA → lado = sqrt(área).
export function geometriaCuadrado(cx, cy) {
  const x = Number(cx);
  const y = Number(cy);
  const lado = Math.sqrt(AREA_REFERENCIA);
  return { x: x - lado / 2, y: y - lado / 2, width: lado, height: lado, lado };
}

// Triángulo equilátero (apunta hacia arriba) centrado en (cx,cy) con área ==
// AREA_REFERENCIA. Área de un triángulo equilátero de lado L: (√3/4)·L² →
// L = √(4·área/√3). El centroide (promedio de los 3 vértices) se mantiene
// en (cx,cy), igual que el círculo y el cuadrado, para que los 4 tipos de
// marcador queden centrados sobre el mismo punto de dato.
export function geometriaTriangulo(cx, cy) {
  const x = Number(cx);
  const y = Number(cy);
  const lado = Math.sqrt((4 * AREA_REFERENCIA) / Math.sqrt(3));
  const altura = (Math.sqrt(3) / 2) * lado;
  const top = { x, y: y - (2 / 3) * altura };
  const left = { x: x - lado / 2, y: y + (1 / 3) * altura };
  const right = { x: x + lado / 2, y: y + (1 / 3) * altura };
  return {
    top, left, right,
    path: `M ${top.x} ${top.y} L ${right.x} ${right.y} L ${left.x} ${left.y} Z`,
  };
}

// Posición horizontal de una fecha dentro de [x0, x1], proporcional a su
// posición entre [fechaMin, fechaMax]. Si el rango de fechas es un solo
// instante (fechaMin === fechaMax), centra en (x0+x1)/2 en vez de NaN/0.
export function escalaX(fecha, fechaMin, fechaMax, x0, x1) {
  const tMin = new Date(fechaMin).getTime();
  const tMax = new Date(fechaMax).getTime();
  const t = new Date(fecha).getTime();
  const a = Number(x0);
  const b = Number(x1);
  if (tMax === tMin) return (a + b) / 2;
  const frac = (t - tMin) / (tMax - tMin);
  return a + frac * (b - a);
}

// Posición vertical de un avance 0-100 dentro de [yParaCien, yParaCero].
export function escalaY(avance, yParaCien, yParaCero) {
  const v = Math.max(0, Math.min(100, Number(avance)));
  const a = Number(yParaCien);
  const b = Number(yParaCero);
  return a + (1 - v / 100) * (b - a);
}

// Path SVG (atributo `d`) de la línea de avance, a partir de puntos ya
// resueltos a números — construido con un template por punto (no con
// `+=` acumulado) para que un valor no-numérico cause un `NaN` visible
// en el path en vez de una concatenación silenciosa.
export function construirPathLinea(puntos) {
  if (!puntos || puntos.length === 0) return '';
  return puntos.map((p, i) => `${i === 0 ? 'M' : 'L'} ${Number(p.x)} ${Number(p.y)}`).join(' ');
}

// ~`cantidad` marcas de fecha uniformemente repartidas en [fechaMin, fechaMax].
export function generarMarcasFecha(fechaMin, fechaMax, cantidad = 8) {
  const tMin = new Date(fechaMin).getTime();
  const tMax = new Date(fechaMax).getTime();
  if (!Number.isFinite(tMin) || !Number.isFinite(tMax)) return [];
  if (tMax === tMin) return [new Date(tMin)];
  const n = Math.max(2, cantidad);
  const paso = (tMax - tMin) / (n - 1);
  return Array.from({ length: n }, (_, i) => new Date(tMin + paso * i));
}

export function formatoFechaCorta(fecha) {
  return new Date(fecha).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
}

// Clave de agrupación "mismo día calendario" (hora local) — para agrupar
// varios eventos no-avance de la misma fecha en un solo marcador con
// contador.
export function claveDia(fecha) {
  const d = new Date(fecha);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
