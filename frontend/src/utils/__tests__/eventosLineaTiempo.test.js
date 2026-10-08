/**
 * ARCHIVO: eventosLineaTiempo.test.js
 * PROPÓSITO: Pruebas de la capa de datos compartida de LineaTiempoEventos
 *            (resumen por mes en texto, huecos de inactividad, avance al
 *            momento de cada evento) — la "red de seguridad" en texto no
 *            debe omitirse, así que su cálculo se prueba aparte.
 */
import { describe, test, expect } from 'vitest';
import {
  normalizarEventoNodo, normalizarEventoBitacora,
  resumenPorColumna, detectarHuecos, conAvanceEnElMomento,
  agruparPorDiaYCarril, eventosDelMismoDia,
} from '../eventosLineaTiempo';
import { generarColumnas } from '../marcadoresTiempo';

describe('normalizarEventoNodo', () => {
  test('cambio_avance con valor numérico va al carril avance', () => {
    const ev = normalizarEventoNodo({
      id: '1', tipo_evento: 'cambio_avance', contenido: null,
      metadata: { avance_actual: '45.6' }, created_at: '2026-08-01', autor_nombre: 'Ana',
    });
    expect(ev.carril).toBe('avance');
    expect(ev.avance).toBe(46);
  });

  test('archivo va al carril documento con el nombre del archivo como título', () => {
    const ev = normalizarEventoNodo({
      id: '2', tipo_evento: 'archivo', archivo_nombre: 'plano.pdf', metadata: {}, created_at: '2026-08-02',
    });
    expect(ev.carril).toBe('documento');
    expect(ev.titulo).toBe('plano.pdf');
  });

  test('miembro va al carril equipo', () => {
    const ev = normalizarEventoNodo({ id: '3', tipo_evento: 'miembro', contenido: 'X agregado', created_at: '2026-08-03' });
    expect(ev.carril).toBe('equipo');
  });
});

describe('normalizarEventoBitacora', () => {
  test('categoria indicador va al carril indicador y conserva el nodo', () => {
    const ev = normalizarEventoBitacora({
      id: '1', categoria: 'indicador', titulo: 'Aportación editada', contenido: null,
      nodo_tipo: 'accion', nodo_id: 'a1', nodo_nombre: 'Acción X', created_at: '2026-08-01', metadata: {},
    });
    expect(ev.carril).toBe('indicador');
    expect(ev.nodo).toEqual({ tipo: 'accion', id: 'a1', nombre: 'Acción X' });
  });

  test('categoria avance con estado Completada resuelve avance=100', () => {
    const ev = normalizarEventoBitacora({
      id: '2', categoria: 'avance', titulo: 'Estatus actualizado', metadata: { estado: 'Completada' }, created_at: '2026-08-01',
    });
    expect(ev.carril).toBe('avance');
    expect(ev.avance).toBe(100);
  });
});

function ev(id, carril, createdAt, avance = null) {
  return { id, carril, avance, titulo: id, contenido: null, autorNombre: 'T', createdAt, nodo: null, raw: {} };
}

describe('resumenPorColumna', () => {
  test('un mes sin eventos dice "sin movimiento"', () => {
    const columnas = generarColumnas('2026-08-01', '2026-08-31', 0, 100, 'mes');
    const resumen = resumenPorColumna([], columnas);
    expect(resumen[0].texto).toBe('sin movimiento');
  });

  test('arma el texto combinando avance (último valor) y conteos por carril', () => {
    const columnas = generarColumnas('2026-08-01', '2026-08-31', 0, 100, 'mes');
    const eventos = [
      ev('a', 'avance', '2026-08-05', 30),
      ev('b', 'avance', '2026-08-20', 56),
      ev('c', 'documento', '2026-08-10'),
      ev('d', 'riesgo', '2026-08-12'),
      ev('e', 'comentario', '2026-08-15'),
    ];
    const [resumen] = resumenPorColumna(eventos, columnas);
    expect(resumen.texto).toBe('2 de avance, cerró en 56% · 1 documento · 1 riesgo · 1 comentario');
  });

  test('pluraliza correctamente con 2+ del mismo tipo', () => {
    const columnas = generarColumnas('2026-08-01', '2026-08-31', 0, 100, 'mes');
    const eventos = [ev('a', 'documento', '2026-08-01'), ev('b', 'documento', '2026-08-02')];
    const [resumen] = resumenPorColumna(eventos, columnas);
    expect(resumen.texto).toBe('2 documentos');
  });
});

describe('detectarHuecos', () => {
  test('detecta un hueco de 18 días entre dos eventos', () => {
    const eventosDesc = [ev('reciente', 'comentario', '2026-08-19'), ev('viejo', 'comentario', '2026-08-01')];
    const huecos = detectarHuecos(eventosDesc, 10);
    expect(huecos).toEqual([{ trasId: 'reciente', dias: 18, desde: '2026-08-01', hasta: '2026-08-19' }]);
  });

  test('no marca huecos por debajo del umbral', () => {
    const eventosDesc = [ev('a', 'comentario', '2026-08-10'), ev('b', 'comentario', '2026-08-05')];
    expect(detectarHuecos(eventosDesc, 10)).toEqual([]);
  });
});

describe('conAvanceEnElMomento', () => {
  test('cada evento hereda el último avance conocido a esa fecha', () => {
    const eventosDesc = [
      ev('c', 'comentario', '2026-08-20'),
      ev('b', 'avance', '2026-08-10', 70),
      ev('a', 'comentario', '2026-08-05'),
    ];
    const resultado = conAvanceEnElMomento(eventosDesc);
    expect(resultado.find(e => e.id === 'c').avanceEnElMomento).toBe(70);
    expect(resultado.find(e => e.id === 'b').avanceEnElMomento).toBe(70);
    expect(resultado.find(e => e.id === 'a').avanceEnElMomento).toBe(null);
  });
});

describe('agruparPorDiaYCarril', () => {
  test('agrupa dos documentos del mismo día en un solo grupo', () => {
    const eventos = [ev('a', 'documento', '2026-08-10T08:00'), ev('b', 'documento', '2026-08-10T20:00')];
    const grupos = agruparPorDiaYCarril(eventos);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].eventos).toHaveLength(2);
  });

  test('no mezcla carriles distintos del mismo día', () => {
    const eventos = [ev('a', 'documento', '2026-08-10'), ev('b', 'riesgo', '2026-08-10')];
    expect(agruparPorDiaYCarril(eventos)).toHaveLength(2);
  });

  test('excluye eventos de avance (van en la banda, no en un carril)', () => {
    const eventos = [ev('a', 'avance', '2026-08-10', 50)];
    expect(agruparPorDiaYCarril(eventos)).toHaveLength(0);
  });
});

describe('eventosDelMismoDia', () => {
  test('trae todos los eventos del mismo día sin importar el carril', () => {
    const eventos = [
      ev('a', 'documento', '2026-08-10T08:00'),
      ev('b', 'riesgo', '2026-08-10T20:00'),
      ev('c', 'comentario', '2026-08-11T08:00'),
    ];
    expect(eventosDelMismoDia(eventos, '2026-08-10T12:00').map(e => e.id)).toEqual(['a', 'b']);
  });
});
