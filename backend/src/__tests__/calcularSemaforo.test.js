/**
 * ARCHIVO: calcularSemaforo.test.js
 * PROPÓSITO: Tabla de casos de la regla nueva de calcularSemaforo
 *            (avance-semaforo.js) — "Cierre del modelo de urgencia".
 *            No existía antes una prueba directa de esta función (solo
 *            una indirecta vía contarNodosVencidos-semaforo-efectivo
 *            .test.js, que solo cubre la frontera de "rojo"); esta
 *            cubre las cuatro salidas completas.
 *
 * Los tres cambios de comportamiento respecto a la regla anterior, cada
 * uno con su caso explícito:
 *   (a) 'Bloqueada' ya no tiene una rama propia — ver los casos
 *       "bloqueada_*".
 *   (b) sin fecha es gris SIEMPRE, no solo junto con Pendiente — ver
 *       "en_proceso_sin_fecha" (antes caía a verde) y "bloqueada_sin_fecha".
 *   (c) la ventana de aviso escala por prioridad (Crítica 21, Muy Alta
 *       14, resto 7) y la comparación es inclusiva (<=) en los tres
 *       umbrales — ver los casos "critica_*", "muy_alta_*" y los bordes
 *       exactos.
 */
const { calcularSemaforo, VENTANA_POR_VENCER, VENTANA_POR_DEFECTO, ventanaAvisoPorVencer } = require('../utils/avance-semaforo');

function fecha(offsetDias) {
  if (offsetDias === null) return null;
  const d = new Date(); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDias);
  return d;
}

describe('calcularSemaforo — regla nueva ("Cierre del modelo de urgencia")', () => {
  // ── Los tres casos observados en producción (Bloque 1 del reporte) ──
  test('Pendiente con fecha límite pasada -> rojo', () => {
    expect(calcularSemaforo('Pendiente', fecha(-3), null, null)).toBe('rojo');
  });
  test('Pendiente sin fecha -> gris', () => {
    expect(calcularSemaforo('Pendiente', null, null, null)).toBe('gris');
  });
  test('En proceso sin fecha -> gris (ANTES de este cambio era verde)', () => {
    expect(calcularSemaforo('En_proceso', null, null, null)).toBe('gris');
  });

  // ── Cambio (a): Bloqueada ya no tiene rama propia ──
  test('Bloqueada con 60 días de margen -> verde (antes: ámbar siempre, sin importar el margen)', () => {
    expect(calcularSemaforo('Bloqueada', fecha(60), null, null)).toBe('verde');
  });
  test('Bloqueada con 1 día de margen -> ámbar', () => {
    expect(calcularSemaforo('Bloqueada', fecha(1), null, null)).toBe('ambar');
  });
  test('Bloqueada vencida -> rojo', () => {
    expect(calcularSemaforo('Bloqueada', fecha(-1), null, null)).toBe('rojo');
  });
  test('Bloqueada con 2 días de margen -> ámbar (antes: rojo, por la regla "<3 días")', () => {
    expect(calcularSemaforo('Bloqueada', fecha(2), null, null)).toBe('ambar');
  });
  test('Bloqueada sin fecha -> gris (consecuencia del cambio (b): ya no es un caso aparte)', () => {
    expect(calcularSemaforo('Bloqueada', null, null, null)).toBe('gris');
  });

  // ── Cambio (c): escala de ventana por prioridad, con <= inclusivo ──
  test('Crítica a 20 días -> ámbar', () => {
    expect(calcularSemaforo('En_proceso', fecha(20), 'Crítica', null)).toBe('ambar');
  });
  test('Crítica a 21 días (borde exacto de su ventana) -> ámbar', () => {
    expect(calcularSemaforo('En_proceso', fecha(21), 'Crítica', null)).toBe('ambar');
  });
  test('Crítica a 22 días -> verde', () => {
    expect(calcularSemaforo('En_proceso', fecha(22), 'Crítica', null)).toBe('verde');
  });
  test('Muy Alta a 14 días (borde exacto) -> ámbar (antes: verde, por la regla "<14" estricta)', () => {
    expect(calcularSemaforo('En_proceso', fecha(14), 'Muy Alta', null)).toBe('ambar');
  });
  test('Muy Alta a 15 días -> verde', () => {
    expect(calcularSemaforo('En_proceso', fecha(15), 'Muy Alta', null)).toBe('verde');
  });
  test('Media a 7 días (borde exacto, ventana por defecto) -> ámbar', () => {
    expect(calcularSemaforo('En_proceso', fecha(7), 'Media', null)).toBe('ambar');
  });
  test('Media a 8 días -> verde', () => {
    expect(calcularSemaforo('En_proceso', fecha(8), 'Media', null)).toBe('verde');
  });
  test('Alta a 7 días (misma ventana que Media/Baja) -> ámbar', () => {
    expect(calcularSemaforo('En_proceso', fecha(7), 'Alta', null)).toBe('ambar');
  });
  test('Baja a 7 días -> ámbar; Baja a 8 días -> verde', () => {
    expect(calcularSemaforo('En_proceso', fecha(7), 'Baja', null)).toBe('ambar');
    expect(calcularSemaforo('En_proceso', fecha(8), 'Baja', null)).toBe('verde');
  });
  test('sin prioridad definida -> ventana por defecto (7), igual que Alta/Media/Baja', () => {
    expect(calcularSemaforo('En_proceso', fecha(7), null, null)).toBe('ambar');
    expect(calcularSemaforo('En_proceso', fecha(8), null, null)).toBe('verde');
  });
  test('prioridad no es una de las cinco conocidas -> ventana por defecto (7)', () => {
    expect(calcularSemaforo('En_proceso', fecha(7), 'no-existe', null)).toBe('ambar');
  });
  test('día 0 (vence hoy) -> ámbar, nunca rojo', () => {
    expect(calcularSemaforo('En_proceso', fecha(0), null, null)).toBe('ambar');
  });
  test('ventanaAvisoPorVencer expone la escala completa, monótona por prioridad', () => {
    expect(ventanaAvisoPorVencer('Crítica')).toBe(21);
    expect(ventanaAvisoPorVencer('Muy Alta')).toBe(14);
    expect(ventanaAvisoPorVencer('Alta')).toBe(7);
    expect(ventanaAvisoPorVencer('Media')).toBe(7);
    expect(ventanaAvisoPorVencer('Baja')).toBe(7);
    expect(ventanaAvisoPorVencer(undefined)).toBe(VENTANA_POR_DEFECTO);
    expect(VENTANA_POR_DEFECTO).toBe(7);
    // Monótona: a más prioridad, ventana igual o mayor.
    const orden = ['Baja', 'Media', 'Alta', 'Muy Alta', 'Crítica'];
    for (let i = 1; i < orden.length; i++) {
      expect(ventanaAvisoPorVencer(orden[i])).toBeGreaterThanOrEqual(ventanaAvisoPorVencer(orden[i - 1]));
    }
    expect(VENTANA_POR_VENCER['Crítica']).toBe(21);
  });

  // ── Resto de casos pedidos explícitamente ──
  test('Completada sin fecha -> verde (Completada manda ANTES de mirar la fecha)', () => {
    expect(calcularSemaforo('Completada', null, null, null)).toBe('verde');
  });
  test('Completada con fecha muy vencida -> sigue verde (el contrato no cambia)', () => {
    expect(calcularSemaforo('Completada', fecha(-400), 'Crítica', null)).toBe('verde');
  });
  test('Cancelada con fecha límite pasada -> gris (Cancelada manda antes de mirar la fecha)', () => {
    expect(calcularSemaforo('Cancelada', fecha(-10), null, null)).toBe('gris');
  });

  // ── fecha_fin como respaldo de fecha_limite (sin tocar, se conserva) ──
  test('usa fecha_fin cuando no hay fecha_limite', () => {
    expect(calcularSemaforo('En_proceso', null, null, fecha(-2))).toBe('rojo');
    expect(calcularSemaforo('En_proceso', null, null, null)).toBe('gris');
  });
  test('fecha_limite manda sobre fecha_fin cuando ambas existen', () => {
    expect(calcularSemaforo('En_proceso', fecha(30), null, fecha(-30))).toBe('verde');
  });

  // ── Solo cuatro valores posibles de salida, nunca un quinto ──
  test('el resultado siempre es uno de verde/ambar/rojo/gris', () => {
    const combinaciones = [
      ['Pendiente', null, null, null], ['Pendiente', fecha(-1), null, null],
      ['En_proceso', fecha(5), 'Crítica', null], ['Bloqueada', fecha(100), null, null],
      ['Completada', null, null, null], ['Cancelada', fecha(1), null, null],
    ];
    for (const args of combinaciones) {
      expect(['verde', 'ambar', 'rojo', 'gris']).toContain(calcularSemaforo(...args));
    }
  });
});
