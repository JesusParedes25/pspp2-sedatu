/**
 * ARCHIVO: contarNodosVencidos-semaforo-efectivo.test.js
 * PROPÓSITO: Fija que el contador "vencidos" de la Portada
 *            (proyectos.stats.queries.js::contarNodosVencidos) cuenta
 *            exactamente lo mismo que semaforoEfectivo()==='rojo'
 *            (avance-semaforo.js) — la migración 083 nació de que NO
 *            coincidían: con semaforo_override=true y semaforo=NULL (las
 *            4 filas encontradas en producción, todas en `tareas`), el
 *            CASE del contador no entraba en ninguna rama y la fila
 *            quedaba fuera del conteo aunque semaforoEfectivo() sí la
 *            recalculara como vencida por fecha.
 *
 * `vencidoPorSqlDeContarNodosVencidos` es una transcripción literal del
 * CASE que vive en proyectos.stats.queries.js::contarNodosVencidos — no
 * hay infraestructura de pruebas contra una base real en este repo (todo
 * el resto de la suite usa el pool mockeado), así que esta es la forma de
 * fijar la equivalencia sin esa infraestructura. La transcripción se
 * verificó manualmente contra un Postgres 16 real con los mismos 20
 * casos de este archivo antes de escribir la migración — ver el reporte
 * de la decisión 5 para la consulta exacta y su salida.
 * Si alguien cambia el CASE en proyectos.stats.queries.js sin actualizar
 * esta copia (o viceversa), hay que mantenerlas sincronizadas a mano;
 * esta prueba solo detecta cuando una de las dos deja de coincidir con
 * semaforoEfectivo(), que es la fuente de verdad real.
 *
 * Ejecutar: npm test
 */
const { semaforoEfectivo } = require('../utils/avance-semaforo');

function vencidoPorSqlDeContarNodosVencidos(nodo) {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const fechaEfectiva = nodo.fecha_limite || nodo.fecha_fin || null;

  if (nodo.semaforo_override && nodo.semaforo != null) {
    return nodo.semaforo === 'rojo';
  }
  if (nodo.estado === 'Completada' || nodo.estado === 'Cancelada') return false;
  if (!fechaEfectiva) return false;

  const diasRestantes = Math.ceil((fechaEfectiva - hoy) / 86400000);
  if (diasRestantes < 0) return true;
  if (nodo.estado === 'Bloqueada' && diasRestantes < 3) return true;
  return false;
}

function fecha(offsetDias) {
  if (offsetDias === null) return null;
  const d = new Date(); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDias);
  return d;
}

// Mismos 20 casos verificados manualmente contra Postgres real (ver
// reporte de la decisión 5) — cada estado, con/sin fecha, override con y
// sin valor, y los límites exactos de las reglas de calcularSemaforo.
const CASOS = [
  { caso: 'pendiente_sin_fecha', estado: 'Pendiente', fecha_limite: null, fecha_fin: null, prioridad: null, semaforo: null, semaforo_override: false },
  { caso: 'pendiente_futura_lejos', estado: 'Pendiente', fecha_limite: fecha(30), fecha_fin: null, prioridad: null, semaforo: null, semaforo_override: false },
  { caso: 'pendiente_vencida', estado: 'Pendiente', fecha_limite: fecha(-1), fecha_fin: null, prioridad: null, semaforo: null, semaforo_override: false },
  { caso: 'enproceso_vencido_hoy', estado: 'En_proceso', fecha_limite: fecha(0), fecha_fin: null, prioridad: null, semaforo: null, semaforo_override: false },
  { caso: 'enproceso_vencido_ayer', estado: 'En_proceso', fecha_limite: fecha(-1), fecha_fin: null, prioridad: null, semaforo: null, semaforo_override: false },
  { caso: 'enproceso_en7dias', estado: 'En_proceso', fecha_limite: fecha(7), fecha_fin: null, prioridad: null, semaforo: null, semaforo_override: false },
  { caso: 'enproceso_en8dias', estado: 'En_proceso', fecha_limite: fecha(8), fecha_fin: null, prioridad: null, semaforo: null, semaforo_override: false },
  { caso: 'enproceso_muyalta_13dias', estado: 'En_proceso', fecha_limite: fecha(13), fecha_fin: null, prioridad: 'Muy Alta', semaforo: null, semaforo_override: false },
  { caso: 'enproceso_muyalta_14dias', estado: 'En_proceso', fecha_limite: fecha(14), fecha_fin: null, prioridad: 'Muy Alta', semaforo: null, semaforo_override: false },
  { caso: 'bloqueada_vencida', estado: 'Bloqueada', fecha_limite: fecha(-1), fecha_fin: null, prioridad: null, semaforo: null, semaforo_override: false },
  { caso: 'bloqueada_2dias', estado: 'Bloqueada', fecha_limite: fecha(2), fecha_fin: null, prioridad: null, semaforo: null, semaforo_override: false },
  { caso: 'bloqueada_3dias', estado: 'Bloqueada', fecha_limite: fecha(3), fecha_fin: null, prioridad: null, semaforo: null, semaforo_override: false },
  { caso: 'bloqueada_30dias', estado: 'Bloqueada', fecha_limite: fecha(30), fecha_fin: null, prioridad: null, semaforo: null, semaforo_override: false },
  { caso: 'completada_fecha_vieja', estado: 'Completada', fecha_limite: fecha(-30), fecha_fin: null, prioridad: null, semaforo: null, semaforo_override: false },
  { caso: 'cancelada_fecha_vieja', estado: 'Cancelada', fecha_limite: fecha(-30), fecha_fin: null, prioridad: null, semaforo: null, semaforo_override: false },
  { caso: 'usa_fecha_fin_vencida', estado: 'En_proceso', fecha_limite: null, fecha_fin: fecha(-5), prioridad: null, semaforo: null, semaforo_override: false },
  { caso: 'override_rojo_sin_fecha', estado: 'Pendiente', fecha_limite: null, fecha_fin: null, prioridad: null, semaforo: 'rojo', semaforo_override: true },
  { caso: 'override_verde_vencida', estado: 'En_proceso', fecha_limite: fecha(-10), fecha_fin: null, prioridad: null, semaforo: 'verde', semaforo_override: true },
  // Las 4 filas reales encontradas en producción tienen esta forma.
  { caso: 'override_sin_valor_vencida', estado: 'En_proceso', fecha_limite: fecha(-10), fecha_fin: null, prioridad: null, semaforo: null, semaforo_override: true },
  { caso: 'override_sin_valor_sana', estado: 'En_proceso', fecha_limite: fecha(30), fecha_fin: null, prioridad: null, semaforo: null, semaforo_override: true },
];

describe('contarNodosVencidos vs. semaforoEfectivo — misma verdad fila por fila', () => {
  test.each(CASOS)('$caso', (nodo) => {
    const esperado = semaforoEfectivo(nodo) === 'rojo';
    const sql = vencidoPorSqlDeContarNodosVencidos(nodo);
    expect(sql).toBe(esperado);
  });

  test('el conteo total sobre todo el conjunto coincide', () => {
    const totalSemaforoEfectivo = CASOS.filter(n => semaforoEfectivo(n) === 'rojo').length;
    const totalSql = CASOS.filter(vencidoPorSqlDeContarNodosVencidos).length;
    expect(totalSql).toBe(totalSemaforoEfectivo);
  });
});
