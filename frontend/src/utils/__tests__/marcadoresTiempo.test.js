/**
 * ARCHIVO: marcadoresTiempo.test.js
 * PROPÓSITO: Verifica el cálculo de coordenadas del gráfico de línea del
 *            tiempo (Fase 5 del rediseño de Detalle) — escalas X/Y,
 *            geometría de los 4 marcadores con área visual equivalente, y
 *            que las coordenadas numéricas nunca se concatenen como
 *            strings (la razón original del requisito de esta prueba).
 *
 * Ejecutar: npm test
 */
import { describe, test, expect } from 'vitest';
import {
  RADIO_AVANCE,
  geometriaCirculo,
  geometriaCuadrado,
  geometriaTriangulo,
  escalaX,
  escalaY,
  construirPathLinea,
  generarMarcasFecha,
  claveDia,
} from '../marcadoresTiempo';

describe('escalaX', () => {
  test('ubica el punto medio del rango de fechas en el punto medio de x', () => {
    const x = escalaX('2026-01-15', '2026-01-01', '2026-01-31', 0, 300);
    expect(x).toBeCloseTo(140, 1); // 14 días de 30 transcurridos ≈ 46.7% del rango
  });

  test('fecha mínima cae exactamente en x0, fecha máxima en x1', () => {
    expect(escalaX('2026-01-01', '2026-01-01', '2026-01-31', 10, 310)).toBe(10);
    expect(escalaX('2026-01-31', '2026-01-01', '2026-01-31', 10, 310)).toBe(310);
  });

  test('rango de un solo instante centra en vez de dividir entre 0', () => {
    expect(escalaX('2026-01-01', '2026-01-01', '2026-01-01', 0, 300)).toBe(150);
  });

  test('CRÍTICO: coordenadas que llegan como string no se concatenan — se calculan como número', () => {
    // Si escalaX usara `x0 + frac * (x1 - x0)` sin Number(...), pasar
    // x0/x1 como texto (como podría llegar desde props/atributos DOM)
    // produciría algo como "0" + 150 = "0150" en vez de 150.
    const x = escalaX('2026-01-16', '2026-01-01', '2026-01-31', '0', '300');
    expect(typeof x).toBe('number');
    expect(x).toBeCloseTo(150, 0);
  });
});

describe('escalaY', () => {
  test('100% de avance cae en yParaCien, 0% cae en yParaCero', () => {
    expect(escalaY(100, 10, 120)).toBe(10);
    expect(escalaY(0, 10, 120)).toBe(120);
  });

  test('50% cae a medio camino', () => {
    expect(escalaY(50, 10, 120)).toBeCloseTo(65, 5);
  });

  test('topa valores fuera de rango a [0,100]', () => {
    expect(escalaY(142, 10, 120)).toBe(10); // como si fuera 100
    expect(escalaY(-5, 10, 120)).toBe(120); // como si fuera 0
  });

  test('CRÍTICO: avance como string se calcula numéricamente, no se concatena', () => {
    const y = escalaY('75', '10', '120');
    expect(typeof y).toBe('number');
    expect(y).toBeCloseTo(37.5, 5);
  });
});

describe('geometriaCirculo', () => {
  test('usa el radio base por omisión y conserva el centro', () => {
    const g = geometriaCirculo(100, 50);
    expect(g).toEqual({ cx: 100, cy: 50, r: RADIO_AVANCE });
  });

  test('normaliza cx/cy/r a número aunque lleguen como string', () => {
    const g = geometriaCirculo('100', '50', '6');
    expect(g).toEqual({ cx: 100, cy: 50, r: 6 });
  });
});

const areaCirculo = Math.PI * RADIO_AVANCE * RADIO_AVANCE;

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

describe('geometriaTriangulo', () => {
  test('el área del triángulo equilátero iguala la del círculo de referencia', () => {
    const { top, left, right } = geometriaTriangulo(0, 0);
    // Área por la fórmula del determinante (shoelace), a partir de los 3
    // vértices ya calculados — verificación independiente de la fórmula
    // usada dentro de geometriaTriangulo, no una tautología.
    const area = Math.abs(
      (top.x * (left.y - right.y) + left.x * (right.y - top.y) + right.x * (top.y - left.y)) / 2
    );
    expect(area).toBeCloseTo(areaCirculo, 4);
  });

  test('el centroide (promedio de los 3 vértices) coincide con (cx,cy)', () => {
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

describe('construirPathLinea', () => {
  test('arma un path M/L válido a partir de puntos numéricos', () => {
    const path = construirPathLinea([{ x: 0, y: 10 }, { x: 50, y: 20 }, { x: 100, y: 0 }]);
    expect(path).toBe('M 0 10 L 50 20 L 100 0');
  });

  test('arreglo vacío produce string vacío, no un path roto', () => {
    expect(construirPathLinea([])).toBe('');
    expect(construirPathLinea(null)).toBe('');
  });

  test('normaliza puntos con coordenadas en string', () => {
    const path = construirPathLinea([{ x: '0', y: '10' }, { x: '50', y: '20' }]);
    expect(path).toBe('M 0 10 L 50 20');
  });
});

describe('generarMarcasFecha', () => {
  test('genera la cantidad pedida de marcas, incluyendo los extremos', () => {
    const marcas = generarMarcasFecha('2026-01-01', '2026-01-31', 4);
    expect(marcas).toHaveLength(4);
    expect(marcas[0].toISOString().slice(0, 10)).toBe('2026-01-01');
    expect(marcas[3].toISOString().slice(0, 10)).toBe('2026-01-31');
  });

  test('rango de un solo instante devuelve una sola marca', () => {
    const marcas = generarMarcasFecha('2026-01-01', '2026-01-01', 8);
    expect(marcas).toHaveLength(1);
  });

  test('fechas inválidas devuelven arreglo vacío en vez de reventar', () => {
    expect(generarMarcasFecha('no-es-fecha', '2026-01-01', 8)).toEqual([]);
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
