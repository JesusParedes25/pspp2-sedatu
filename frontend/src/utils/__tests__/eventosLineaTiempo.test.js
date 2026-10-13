/**
 * ARCHIVO: eventosLineaTiempo.test.js
 * PROPÓSITO: Pruebas de la capa de datos compartida de ResumenMensual.jsx
 *            y BitacoraCronologica.jsx (resumen por mes en texto, huecos
 *            de inactividad, avance al momento de cada evento) — la "red
 *            de seguridad" en texto no debe omitirse, así que su cálculo
 *            se prueba aparte.
 */
import { describe, test, expect } from 'vitest';
import {
  normalizarEventoNodo, normalizarEventoBitacora,
  resumenPorColumna, detectarHuecos, conAvanceEnElMomento,
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

  // Antes del retiro del gráfico, ResumenMensual compartía compuerta
  // (eventos.length >= 3) con LineaTiempoEventos: este camino con 1-2
  // eventos nunca se había ejercitado con datos reales. Casos añadidos al
  // quitar esa compuerta (ver BitacoraProyecto.jsx).
  test('un solo evento genera una sola columna, sin dividir entre cero ni romper con un rango de un día', () => {
    const t = new Date('2026-08-15T10:00:00').getTime();
    const columnas = generarColumnas(t, t, 0, 1, 'mes');
    expect(columnas).toHaveLength(1);
    expect(columnas[0].label).toBe('AGO');
    const resumen = resumenPorColumna([ev('a', 'comentario', '2026-08-15')], columnas);
    expect(resumen).toHaveLength(1);
    expect(resumen[0].total).toBe(1);
    expect(resumen[0].texto).toBe('1 comentario');
  });

  test('dos eventos en meses distintos generan una columna por cada mes del rango, cada una con su propia etiqueta', () => {
    const columnas = generarColumnas('2026-08-05', '2026-10-20', 0, 3, 'mes');
    expect(columnas.map(c => c.label)).toEqual(['AGO', 'SEP', 'OCT']);
    const eventos = [ev('a', 'documento', '2026-08-05'), ev('b', 'comentario', '2026-10-20')];
    const resumen = resumenPorColumna(eventos, columnas);
    expect(resumen[0].texto).toBe('1 documento');
    expect(resumen[1].texto).toBe('sin movimiento');
    expect(resumen[2].texto).toBe('1 comentario');
  });

  test('sin ningún evento de avance, omite la frase "de avance" en vez de imprimir un cero inventado', () => {
    const columnas = generarColumnas('2026-08-01', '2026-08-31', 0, 1, 'mes');
    const eventos = [ev('a', 'documento', '2026-08-05'), ev('b', 'comentario', '2026-08-10')];
    const [resumen] = resumenPorColumna(eventos, columnas);
    expect(resumen.texto).not.toMatch(/avance/);
    expect(resumen.texto).toBe('1 documento · 1 comentario');
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

