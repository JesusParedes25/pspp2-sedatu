/**
 * ARCHIVO: marcadoresTiempo.test.js
 * PROPÓSITO: Verifica el cálculo puro compartido por MarcadorEvento.jsx
 *            (geometría de los 5 marcadores con área visual equivalente),
 *            ResumenMensual.jsx (columnas de mes/trimestre) y
 *            BitacoraCronologica.jsx/eventosLineaTiempo.js (claveDia/
 *            claveMes/diasEntre), y que las coordenadas numéricas nunca
 *            se concatenen como strings (la razón original del requisito
 *            de esta prueba, de cuando este módulo también alimentaba el
 *            gráfico de línea del tiempo, ya retirado; ver historial de
 *            git).
 *
 * Ejecutar: npm test
 */
import { describe, test, expect } from 'vitest';
import {
  RADIO_BASE,
  geometriaCirculo,
  geometriaCuadrado,
  geometriaRombo,
  geometriaTriangulo,
  generarColumnas,
  claveDia,
  claveMes,
  diasEntre,
} from '../marcadoresTiempo';

describe('geometriaCirculo', () => {
  test('usa el radio base por omisión y conserva el centro', () => {
    const g = geometriaCirculo(100, 50);
    expect(g).toEqual({ cx: 100, cy: 50, r: RADIO_BASE });
  });

  test('normaliza cx/cy/r a número aunque lleguen como string', () => {
    const g = geometriaCirculo('100', '50', '8');
    expect(g).toEqual({ cx: 100, cy: 50, r: 8 });
  });
});

const areaCirculo = Math.PI * RADIO_BASE * RADIO_BASE;

describe('geometriaCuadrado', () => {
  test('el área del cuadrado iguala la del círculo de referencia', () => {
    const { lado } = geometriaCuadrado(0, 0);
    expect(lado * lado).toBeCloseTo(areaCirculo, 5);
  });

  test('queda centrado en (cx,cy)', () => {
    const g = geometriaCuadrado(100, 50);
    expect(g.x + g.width / 2).toBeCloseTo(100, 5);
    expect(g.y + g.height / 2).toBeCloseTo(50, 5);
  });
});

function areaPorShoelace(puntos) {
  let suma = 0;
  for (let i = 0; i < puntos.length; i++) {
    const a = puntos[i];
    const b = puntos[(i + 1) % puntos.length];
    suma += a.x * b.y - b.x * a.y;
  }
  return Math.abs(suma) / 2;
}

describe('geometriaRombo', () => {
  test('el área del rombo iguala la del círculo de referencia (verificado por shoelace, no por la fórmula interna)', () => {
    const { top, right, bottom, left } = geometriaRombo(0, 0);
    const area = areaPorShoelace([top, right, bottom, left]);
    expect(area).toBeCloseTo(areaCirculo, 4);
  });

  test('el centroide (promedio de los 4 vértices) coincide con (cx,cy)', () => {
    const { top, right, bottom, left } = geometriaRombo(120, 80);
    expect((top.x + right.x + bottom.x + left.x) / 4).toBeCloseTo(120, 5);
    expect((top.y + right.y + bottom.y + left.y) / 4).toBeCloseTo(80, 5);
  });

  test('el path SVG trae solo números, nunca "NaN"', () => {
    const { path } = geometriaRombo('50', '50');
    expect(path).toMatch(/^M [\d.-]+ [\d.-]+ L [\d.-]+ [\d.-]+ L [\d.-]+ [\d.-]+ L [\d.-]+ [\d.-]+ Z$/);
    expect(path).not.toMatch(/NaN/);
  });
});

describe('geometriaTriangulo', () => {
  test('el área del triángulo equilátero iguala la del círculo de referencia', () => {
    const { top, left, right } = geometriaTriangulo(0, 0);
    const area = areaPorShoelace([top, right, left]);
    expect(area).toBeCloseTo(areaCirculo, 4);
  });

  test('el centroide coincide con (cx,cy)', () => {
    const { top, left, right } = geometriaTriangulo(120, 80);
    expect((top.x + left.x + right.x) / 3).toBeCloseTo(120, 5);
    expect((top.y + left.y + right.y) / 3).toBeCloseTo(80, 5);
  });

  test('el path SVG trae solo números, nunca "NaN" ni concatenación', () => {
    const { path } = geometriaTriangulo('50', '50');
    expect(path).toMatch(/^M [\d.-]+ [\d.-]+ L [\d.-]+ [\d.-]+ L [\d.-]+ [\d.-]+ Z$/);
    expect(path).not.toMatch(/NaN/);
  });
});

describe('generarColumnas (modo mes)', () => {
  test('una columna por mes calendario entre fechaMin y fechaMax, anchos iguales', () => {
    const cols = generarColumnas('2026-07-15', '2026-09-03', 0, 300, 'mes');
    expect(cols.map(c => c.label)).toEqual(['JUL', 'AGO', 'SEP']);
    expect(cols[0].x1 - cols[0].x0).toBeCloseTo(100, 5);
    expect(cols[1].x1 - cols[1].x0).toBeCloseTo(100, 5);
    expect(cols[0].x0).toBe(0);
    expect(cols[2].x1).toBe(300);
  });

  test('un solo mes produce una sola columna que ocupa todo el ancho', () => {
    const cols = generarColumnas('2026-08-01', '2026-08-20', 0, 200, 'mes');
    expect(cols).toHaveLength(1);
    expect(cols[0].x0).toBe(0);
    expect(cols[0].x1).toBe(200);
  });

  test('rango que cruza de diciembre a enero avanza de año', () => {
    const cols = generarColumnas('2025-12-10', '2026-01-05', 0, 200, 'mes');
    expect(cols.map(c => c.key)).toEqual(['2025-11', '2026-0']);
  });

  test('fechas inválidas devuelven arreglo vacío en vez de reventar', () => {
    expect(generarColumnas('no-es-fecha', '2026-01-01', 0, 100)).toEqual([]);
  });
});

describe('generarColumnas (modo trimestre)', () => {
  test('agrupa de 3 en 3 meses', () => {
    const cols = generarColumnas('2026-01-10', '2026-08-20', 0, 300, 'trimestre');
    expect(cols.map(c => c.label)).toEqual(['T1 2026', 'T2 2026', 'T3 2026']);
  });
});

describe('claveDia', () => {
  test('dos fechas del mismo día calendario comparten clave', () => {
    const a = claveDia('2026-03-12T08:00:00');
    const b = claveDia('2026-03-12T21:45:00');
    expect(a).toBe(b);
  });

  test('fechas de días distintos tienen claves distintas', () => {
    expect(claveDia('2026-03-12T23:59:00')).not.toBe(claveDia('2026-03-13T00:01:00'));
  });
});

describe('claveMes', () => {
  test('dos fechas del mismo mes comparten clave', () => {
    expect(claveMes('2026-08-01')).toBe(claveMes('2026-08-28'));
  });
  test('meses distintos tienen claves distintas', () => {
    expect(claveMes('2026-08-28')).not.toBe(claveMes('2026-09-01'));
  });
});

describe('diasEntre', () => {
  test('cuenta días completos entre dos fechas, sin importar el orden', () => {
    expect(diasEntre('2026-08-01', '2026-08-19')).toBe(18);
    expect(diasEntre('2026-08-19', '2026-08-01')).toBe(18);
  });
  test('mismo día da 0', () => {
    expect(diasEntre('2026-08-01T08:00:00', '2026-08-01T20:00:00')).toBe(0);
  });
});
