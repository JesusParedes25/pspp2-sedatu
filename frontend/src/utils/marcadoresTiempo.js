/**
 * ARCHIVO: marcadoresTiempo.js
 * PROPÓSITO: Cálculo puro (sin React, sin DOM) para LineaTiempoEventos.jsx
 *            — el gráfico de línea del tiempo compartido entre la pestaña
 *            Actividad de Detalle y el módulo Bitácora. Cubre: columnas
 *            de mes/trimestre (el eje ya no es continuo), la escala de
 *            avance 0-100, y la geometría de los 6 tipos de marcador
 *            (círculo relleno = avance/comentario, cuadrado = documento,
 *            rombo = indicador, triángulo = riesgo, círculo hueco =
 *            equipo), todos con área visual equivalente.
 *
 * Todo con números explícitos (Number(...) en cada entrada): si una
 * coordenada llega como string desde quien llama, `x0 + frac * (x1 - x0)`
 * concatenaría en vez de sumar y el marcador saldría deforme/fuera de
 * lugar — de ahí el `Number()` en cada función exportada, no solo
 * confiar en que el caller ya mandó números. Ver
 * marcadoresTiempo.test.js para el caso concreto que esto previene.
 */

// Radio del círculo de referencia — los demás marcadores se dimensionan
// para que su ÁREA visual sea igual, no su radio: un cuadrado/triángulo/
// rombo del mismo "radio nominal" que un círculo se ve notablemente más
// chico a simple vista.
export const RADIO_BASE = 6;
const AREA_REFERENCIA = Math.PI * RADIO_BASE * RADIO_BASE;

export function geometriaCirculo(cx, cy, r = RADIO_BASE) {
  return { cx: Number(cx), cy: Number(cy), r: Number(r) };
}

// Cuadrado centrado en (cx,cy) con área == AREA_REFERENCIA → lado = sqrt(área).
export function geometriaCuadrado(cx, cy) {
  const x = Number(cx);
  const y = Number(cy);
  const lado = Math.sqrt(AREA_REFERENCIA);
  return { x: x - lado / 2, y: y - lado / 2, width: lado, height: lado, lado };
}

// Rombo (cuadrado girado 45°) centrado en (cx,cy) con área ==
// AREA_REFERENCIA. Un rombo de diagonales (2d, 2d) tiene área 2d² →
// d = √(área/2). Vértices en los 4 ejes cardinales desde el centro.
export function geometriaRombo(cx, cy) {
  const x = Number(cx);
  const y = Number(cy);
  const d = Math.sqrt(AREA_REFERENCIA / 2);
  const top = { x, y: y - d };
  const right = { x: x + d, y };
  const bottom = { x, y: y + d };
  const left = { x: x - d, y };
  return {
    top, right, bottom, left,
    path: `M ${top.x} ${top.y} L ${right.x} ${right.y} L ${bottom.x} ${bottom.y} L ${left.x} ${left.y} Z`,
  };
}

// Triángulo equilátero (apunta hacia arriba) centrado en (cx,cy) con área ==
// AREA_REFERENCIA. Área de un triángulo equilátero de lado L: (√3/4)·L² →
// L = √(4·área/√3). El centroide (promedio de los 3 vértices) se mantiene
// en (cx,cy), igual que el círculo/cuadrado/rombo, para que los 5 tipos de
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

const MESES_VERSALITAS = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
const MESES_LARGOS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

// Columnas de mes (o trimestre) entre fechaMin y fechaMax, de ancho igual
// entre sí — a diferencia de un eje de tiempo continuo, un mes de 28 días
// y uno de 31 ocupan el mismo espacio: lo que importa es que el ojo ubique
// "esto fue en agosto", no la proporción exacta de días transcurridos.
// modo='trimestre' agrupa de 3 en 3 meses (para rangos filtrados largos,
// donde columnas por mes se amontonarían).
export function generarColumnas(fechaMin, fechaMax, x0, x1, modo = 'mes') {
  const a = Number(x0);
  const b = Number(x1);
  const min = new Date(fechaMin);
  const max = new Date(fechaMax);
  if (!Number.isFinite(min.getTime()) || !Number.isFinite(max.getTime())) return [];

  const periodos = [];
  if (modo === 'trimestre') {
    let anio = min.getFullYear();
    let trim = Math.floor(min.getMonth() / 3);
    const anioFin = max.getFullYear();
    const trimFin = Math.floor(max.getMonth() / 3);
    while (anio < anioFin || (anio === anioFin && trim <= trimFin)) {
      const mesInicio = trim * 3;
      periodos.push({
        key: `${anio}-T${trim + 1}`,
        inicio: new Date(anio, mesInicio, 1),
        fin: new Date(anio, mesInicio + 3, 1),
        label: `T${trim + 1} ${anio}`,
      });
      trim++;
      if (trim > 3) { trim = 0; anio++; }
    }
  } else {
    let anio = min.getFullYear();
    let mes = min.getMonth();
    const anioFin = max.getFullYear();
    const mesFin = max.getMonth();
    while (anio < anioFin || (anio === anioFin && mes <= mesFin)) {
      periodos.push({
        key: `${anio}-${mes}`,
        inicio: new Date(anio, mes, 1),
        fin: new Date(anio, mes + 1, 1),
        label: MESES_VERSALITAS[mes],
        labelLargo: `${MESES_LARGOS[mes]} de ${anio}`,
        anio,
        mes,
      });
      mes++;
      if (mes > 11) { mes = 0; anio++; }
    }
  }

  const n = periodos.length || 1;
  const ancho = (b - a) / n;
  return periodos.map((p, i) => ({ ...p, x0: a + i * ancho, x1: a + (i + 1) * ancho }));
}

// Posición X de una fecha dentro de sus columnas de mes/trimestre: ubica
// la columna que la contiene y, dentro de ella, el punto proporcional al
// tiempo transcurrido del periodo (día 1 cerca del borde izquierdo, el
// último día cerca del derecho) — nunca fuera de los límites de su
// columna. Si la fecha cae fuera del rango de columnas (borde), se topa
// a la primera/última en vez de proyectar fuera del lienzo.
export function escalaXColumnas(fecha, columnas) {
  if (!columnas || columnas.length === 0) return 0;
  const t = new Date(fecha).getTime();
  const col = columnas.find(c => t >= c.inicio.getTime() && t < c.fin.getTime())
    || (t < columnas[0].inicio.getTime() ? columnas[0] : columnas[columnas.length - 1]);
  const duracion = col.fin.getTime() - col.inicio.getTime();
  const frac = duracion > 0 ? (t - col.inicio.getTime()) / duracion : 0.5;
  const x0 = Number(col.x0);
  const x1 = Number(col.x1);
  return x0 + Math.min(Math.max(frac, 0), 1) * (x1 - x0);
}

export function formatoFechaLarga(fecha) {
  const d = new Date(fecha);
  return `${d.getDate()} de ${MESES_LARGOS[d.getMonth()]} de ${d.getFullYear()}`;
}

export function formatoFechaCorta(fecha) {
  return new Date(fecha).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
}

// Clave de agrupación "mismo día calendario" (hora local) — para agrupar
// varios eventos del mismo tipo en la misma fecha en un solo marcador
// con contador, y para detectar huecos de inactividad en la bitácora.
export function claveDia(fecha) {
  const d = new Date(fecha);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// Clave de agrupación "mismo mes calendario" — para el resumen por mes y
// para las columnas del gráfico.
export function claveMes(fecha) {
  const d = new Date(fecha);
  return `${d.getFullYear()}-${d.getMonth()}`;
}

// Días completos entre dos fechas (redondeado hacia abajo) — para los
// renglones de "N días sin movimiento" de la bitácora cronológica.
export function diasEntre(fechaA, fechaB) {
  const ms = Math.abs(new Date(fechaB).getTime() - new Date(fechaA).getTime());
  return Math.floor(ms / 86400000);
}

// Meses calendario de diferencia entre dos fechas — decide si
// LineaTiempoEventos agrupa sus columnas por mes o por trimestre (más de
// 6 meses de rango agrupa por trimestre, para que las columnas no se
// amontonen cuando la Bitácora filtra un rango largo).
export function mesesEntre(fechaA, fechaB) {
  const a = new Date(fechaA);
  const b = new Date(fechaB);
  return Math.abs((b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()));
}
