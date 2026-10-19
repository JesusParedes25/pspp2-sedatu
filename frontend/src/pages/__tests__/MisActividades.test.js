/**
 * ARCHIVO: MisActividades.test.js
 * PROPÓSITO: Fija el contrato duro de la decisión 3 — los contadores del
 *            grupo "Por estado" son una partición exacta de `estado` y
 *            DEBEN sumar el total, sin excepción. Antes de este cambio los
 *            5 contadores de la pantalla mezclaban dos ejes (estado y
 *            fecha límite) y por eso no sumaban (55+45+32 contra 180
 *            totales, reportado por el usuario) — esta prueba falla si
 *            esa clase de desajuste vuelve a aparecer.
 *
 * Ejecutar: npm test (vitest)
 */
import { describe, test, expect } from 'vitest';
import { agruparPorEstado } from '../MisActividades';

describe('agruparPorEstado — partición exacta de estado', () => {
  test('con los 5 estados presentes, los 5 contadores suman exactamente el total', () => {
    const items = [
      { estado: 'Pendiente' }, { estado: 'Pendiente' },
      { estado: 'En_proceso' },
      { estado: 'Completada' }, { estado: 'Completada' }, { estado: 'Completada' },
      { estado: 'Bloqueada' },
      { estado: 'Cancelada' }, { estado: 'Cancelada' },
    ];

    const conteo = agruparPorEstado(items);
    const suma = conteo.sinIniciar + conteo.enProceso + conteo.completadas
      + conteo.bloqueadas + conteo.canceladas;

    expect(suma).toBe(items.length);
    expect(conteo).toEqual({
      sinIniciar: 2, enProceso: 1, completadas: 3, bloqueadas: 1, canceladas: 2,
    });
  });

  test('lista vacía: los 5 contadores son 0 y la suma es 0', () => {
    const conteo = agruparPorEstado([]);
    expect(conteo).toEqual({
      sinIniciar: 0, enProceso: 0, completadas: 0, bloqueadas: 0, canceladas: 0,
    });
  });

  test('"Sin iniciar" es igualdad exacta contra Pendiente, no "distinto de Completada" — antes un En_proceso también contaba como Pendiente', () => {
    const items = [{ estado: 'Pendiente' }, { estado: 'En_proceso' }, { estado: 'Bloqueada' }];
    const conteo = agruparPorEstado(items);
    expect(conteo.sinIniciar).toBe(1);
  });
});
