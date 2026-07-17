/**
 * ARCHIVO: avance-semaforo.js
 * PROPÓSITO: Lógica de cálculo de avance efectivo y semáforo automático.
 */
const pool = require('../db/pool');

/**
 * Calcula el semáforo automático desde estatus + fecha_limite + prioridad.
 */
function calcularSemaforo(estado, fecha_limite, prioridad) {
  // gris → Cancelada O (Pendiente sin fecha_limite)
  if (estado === 'Cancelada') return 'gris';
  if (estado === 'Pendiente' && !fecha_limite) return 'gris';

  const ahora = new Date();
  ahora.setHours(0, 0, 0, 0);
  const limite = fecha_limite ? new Date(fecha_limite) : null;
  if (limite) limite.setHours(0, 0, 0, 0);
  const diasRestantes = limite ? Math.ceil((limite - ahora) / (1000 * 60 * 60 * 24)) : null;

  // verde → Completada siempre
  if (estado === 'Completada') return 'verde';

  // rojo → fecha vencida y no completada, O Bloqueada con <3 días
  if (diasRestantes !== null && diasRestantes < 0) return 'rojo';
  if (estado === 'Bloqueada' && diasRestantes !== null && diasRestantes < 3) return 'rojo';

  // ambar → Bloqueada con margen, O faltan 1-7 días, O (Muy Alta y <14 días)
  if (estado === 'Bloqueada') return 'ambar';
  if (diasRestantes !== null && diasRestantes >= 0 && diasRestantes <= 7) return 'ambar';
  if (prioridad === 'Muy Alta' && diasRestantes !== null && diasRestantes < 14) return 'ambar';

  // verde → resto
  return 'verde';
}

/**
 * Determina si un nodo (acción) es hoja (no tiene hijos).
 */
async function esNodoHoja(id, db) {
  const { rows } = await (db || pool).query(
    `SELECT (SELECT COUNT(*)::int FROM acciones WHERE id_accion_padre = $1) +
            (SELECT COUNT(*)::int FROM tareas WHERE id_accion = $1) AS c`,
    [id]
  );
  return rows[0].c === 0;
}

/**
 * Determina si una etapa es hoja (no tiene acciones).
 */
async function esEtapaHoja(id, db) {
  const { rows } = await (db || pool).query(
    'SELECT COUNT(*)::int AS c FROM acciones WHERE id_etapa = $1', [id]
  );
  return rows[0].c === 0;
}

/**
 * Calcula el avance efectivo de un nodo.
 * - Hoja: avance_actual si no es null, else 100 si Completada, else 0
 * - Contenedor: promedio de hijos activos (excluyendo Cancelada)
 */
async function calcularAvanceEfectivo(tipo, id, db) {
  const conn = db || pool;

  if (tipo === 'etapa') {
    // Una etapa siempre es contenedor: promedio de acciones hijas
    const { rows } = await conn.query(
      `SELECT a.avance_actual, a.estado, a.id, a.id_accion_padre
       FROM acciones a WHERE a.id_etapa = $1 AND a.id_accion_padre IS NULL AND a.estado != 'Cancelada'`,
      [id]
    );
    if (rows.length === 0) return 0;
    let suma = 0;
    for (const r of rows) {
      suma += await calcularAvanceEfectivoAccion(r, conn);
    }
    return Math.round(suma / rows.length);
  }

  // accion
  const { rows } = await conn.query('SELECT * FROM acciones WHERE id = $1', [id]);
  if (!rows[0]) return 0;
  return calcularAvanceEfectivoAccion(rows[0], conn);
}

async function calcularAvanceEfectivoAccion(accion, db) {
  // Verificar sub-acciones
  const { rows: subAcciones } = await db.query(
    `SELECT * FROM acciones WHERE id_accion_padre = $1 AND estado != 'Cancelada'`, [accion.id]
  );
  // Verificar tareas
  const { rows: tareas } = await db.query(
    `SELECT * FROM tareas WHERE id_accion = $1 AND estado != 'Cancelada'`, [accion.id]
  );

  const esHoja = subAcciones.length === 0 && tareas.length === 0;
  if (esHoja) {
    if (accion.avance_actual != null) return accion.avance_actual;
    return accion.estado === 'Completada' ? 100 : 0;
  }

  // Contenedor con sub-acciones: promedio de sub-acciones
  if (subAcciones.length > 0) {
    let suma = 0;
    for (const h of subAcciones) {
      suma += await calcularAvanceEfectivoAccion(h, db);
    }
    return Math.round(suma / subAcciones.length);
  }

  // Contenedor con tareas: promedio de avance de tareas
  let suma = 0;
  for (const t of tareas) {
    suma += parseFloat(t.avance_actual) || (t.estado === 'Completada' ? 100 : 0);
  }
  return Math.round(suma / tareas.length);
}

/**
 * Obtiene el semáforo efectivo de un nodo.
 */
function semaforoEfectivo(nodo) {
  if (nodo.semaforo_override && nodo.semaforo) return nodo.semaforo;
  return calcularSemaforo(nodo.estado, nodo.fecha_limite, nodo.prioridad);
}

/**
 * Deriva el estado de un contenedor a partir de los estados de sus hijos activos.
 * Reglas:
 *   todos Completada → Completada
 *   algún Bloqueada  → Bloqueada
 *   algún En_proceso o mezcla → En_proceso
 *   sin hijos activos o todos Pendiente → Pendiente
 */
function derivarEstadoContenedor(hijosEstados) {
  // hijosEstados: array de strings (estado de cada hijo NO cancelado)
  const activos = hijosEstados.filter(e => e !== 'Cancelada');
  if (activos.length === 0) return 'Pendiente';
  if (activos.every(e => e === 'Completada')) return 'Completada';
  if (activos.some(e => e === 'Bloqueada')) return 'Bloqueada';
  if (activos.some(e => e === 'En_proceso') || activos.some(e => e === 'Completada')) return 'En_proceso';
  return 'Pendiente';
}

/**
 * Recalcula en cascada desde el nodo dado hasta la raíz.
 * 1. Recalcula el propio nodo como contenedor (avance+estado+semaforo desde hijos).
 * 2. Si tiene acción padre, recursa hacia arriba.
 * 3. Cuando llega a la acción directa de una etapa, recalcula la etapa.
 */
async function recalcularPadres(tipo, id, db) {
  const conn = db || pool;

  if (tipo === 'accion') {
    // Paso 1: recalcular ESTE nodo desde sus hijos (actualiza porcentaje_avance + estado + semaforo)
    await recalcularAccionContenedor(id, conn);

    const { rows } = await conn.query(
      'SELECT id_accion_padre, id_etapa, id_proyecto FROM acciones WHERE id = $1', [id]
    );
    const r = rows[0];
    if (!r) return;

    if (r.id_accion_padre) {
      // Recursión: el padre absorberá el estado recién escrito en DB
      await recalcularPadres('accion', r.id_accion_padre, conn);
      return; // la recursión se encarga de la etapa
    }

    // Nodo raíz de la acción: recalcular su etapa padre
    if (r.id_etapa) {
      // Leer datos frescos de hijos (ya actualizados arriba)
      const avance = await calcularAvanceEfectivo('etapa', r.id_etapa, conn);
      const { rows: hijosEtapa } = await conn.query(
        "SELECT estado FROM acciones WHERE id_etapa = $1 AND id_accion_padre IS NULL AND estado != 'Cancelada'",
        [r.id_etapa]
      );
      const estadoEtapa = derivarEstadoContenedor(hijosEtapa.map(h => h.estado));
      const { rows: [etapaNodo] } = await conn.query(
        'SELECT fecha_limite, prioridad, semaforo_override FROM etapas WHERE id = $1', [r.id_etapa]
      );
      if (!etapaNodo) return;
      if (!etapaNodo.semaforo_override) {
        const sem = calcularSemaforo(estadoEtapa, etapaNodo.fecha_limite, etapaNodo.prioridad);
        await conn.query(
          'UPDATE etapas SET porcentaje_calculado = $1, estado = $2, semaforo = $3, updated_at = NOW() WHERE id = $4',
          [avance, estadoEtapa, sem, r.id_etapa]
        );
      } else {
        await conn.query(
          'UPDATE etapas SET porcentaje_calculado = $1, estado = $2, updated_at = NOW() WHERE id = $3',
          [avance, estadoEtapa, r.id_etapa]
        );
      }
    }
  }
}

/**
 * Recalcula avance, estado y semáforo de una acción (sea hoja o contenedor).
 * - Hoja (sin hijos): solo actualiza porcentaje_avance desde avance_actual; estado/semaforo intactos.
 * - Contenedor: deriva estado de hijos, actualiza porcentaje_avance + estado + semaforo.
 */
async function recalcularAccionContenedor(accionId, db) {
  const conn = db || pool;

  // Recoger hijos activos
  const { rows: subAcc } = await conn.query(
    "SELECT estado FROM acciones WHERE id_accion_padre = $1 AND estado != 'Cancelada'",
    [accionId]
  );
  const { rows: tareasHijas } = await conn.query(
    "SELECT estado FROM tareas WHERE id_accion = $1 AND estado != 'Cancelada'",
    [accionId]
  );
  const todosEstados = [...subAcc.map(h => h.estado), ...tareasHijas.map(h => h.estado)];

  const avance = await calcularAvanceEfectivo('accion', accionId, conn);

  if (todosEstados.length === 0) {
    // Nodo hoja: solo sincroniza porcentaje_avance con avance_actual; deja estado/semaforo al usuario
    await conn.query(
      'UPDATE acciones SET porcentaje_avance = $1, updated_at = NOW() WHERE id = $2',
      [avance, accionId]
    );
    return;
  }

  // Nodo contenedor: deriva estado y recalcula semáforo
  const estadoDerivado = derivarEstadoContenedor(todosEstados);
  const { rows: [nodo] } = await conn.query(
    'SELECT fecha_limite, prioridad, semaforo_override FROM acciones WHERE id = $1', [accionId]
  );
  if (!nodo) return;

  if (!nodo.semaforo_override) {
    const sem = calcularSemaforo(estadoDerivado, nodo.fecha_limite, nodo.prioridad);
    await conn.query(
      'UPDATE acciones SET porcentaje_avance = $1, estado = $2, semaforo = $3, updated_at = NOW() WHERE id = $4',
      [avance, estadoDerivado, sem, accionId]
    );
  } else {
    await conn.query(
      'UPDATE acciones SET porcentaje_avance = $1, estado = $2, updated_at = NOW() WHERE id = $3',
      [avance, estadoDerivado, accionId]
    );
  }
}

/**
 * Obtiene el id_proyecto de cualquier nodo (accion o etapa).
 */
async function obtenerProyectoId(tipo, id, db) {
  const conn = db || pool;
  if (tipo === 'etapa') {
    const { rows } = await conn.query('SELECT id_proyecto FROM etapas WHERE id = $1', [id]);
    return rows[0]?.id_proyecto || null;
  }
  // accion / tarea
  const { rows } = await conn.query('SELECT id_proyecto, id_etapa FROM acciones WHERE id = $1', [id]);
  if (rows[0]?.id_proyecto) return rows[0].id_proyecto;
  if (rows[0]?.id_etapa) {
    const { rows: e } = await conn.query('SELECT id_proyecto FROM etapas WHERE id = $1', [rows[0].id_etapa]);
    return e[0]?.id_proyecto || null;
  }
  return null;
}

/**
 * Obtiene el sub-árbol completo de una etapa con avances y semáforos calculados.
 */
async function obtenerSubarbol(etapaId, db) {
  const conn = db || pool;
  const { rows: [etapa] } = await conn.query(`
    SELECT e.*, u.nombre_completo AS responsable_nombre,
           dg.id AS responsable_dg_id, dg.siglas AS responsable_dg_siglas
    FROM etapas e
    LEFT JOIN usuarios u ON u.id = e.id_responsable
    LEFT JOIN direcciones_generales dg ON dg.id = u.id_dg
    WHERE e.id = $1
  `, [etapaId]);
  if (!etapa) return null;

  etapa.avance_efectivo = await calcularAvanceEfectivo('etapa', etapaId, conn);
  etapa.semaforo_efectivo = semaforoEfectivo(etapa);

  // Acciones directas (sin padre)
  const { rows: acciones } = await conn.query(`
    SELECT a.*, u.nombre_completo AS responsable_nombre,
           dg.id AS responsable_dg_id, dg.siglas AS responsable_dg_siglas
    FROM acciones a
    LEFT JOIN usuarios u ON u.id = a.id_responsable
    LEFT JOIN direcciones_generales dg ON dg.id = u.id_dg
    WHERE a.id_etapa = $1 AND a.id_accion_padre IS NULL
    ORDER BY a.created_at
  `, [etapaId]);

  etapa.acciones = [];
  for (const acc of acciones) {
    acc.avance_efectivo = await calcularAvanceEfectivoAccion(acc, conn);
    acc.semaforo_efectivo = semaforoEfectivo(acc);
    acc.es_hoja = await esNodoHoja(acc.id, conn);
    // Sub-acciones (tareas)
    const { rows: subs } = await conn.query(`
      SELECT s.*, u.nombre_completo AS responsable_nombre,
             dg.id AS responsable_dg_id, dg.siglas AS responsable_dg_siglas
      FROM acciones s
      LEFT JOIN usuarios u ON u.id = s.id_responsable
      LEFT JOIN direcciones_generales dg ON dg.id = u.id_dg
      WHERE s.id_accion_padre = $1
      ORDER BY s.created_at
    `, [acc.id]);
    acc.tareas = [];
    for (const sub of subs) {
      sub.avance_efectivo = await calcularAvanceEfectivoAccion(sub, conn);
      sub.semaforo_efectivo = semaforoEfectivo(sub);
      sub.es_hoja = await esNodoHoja(sub.id, conn);
      acc.tareas.push(sub);
    }
    etapa.acciones.push(acc);
  }

  return etapa;
}

module.exports = {
  calcularSemaforo,
  esNodoHoja,
  esEtapaHoja,
  calcularAvanceEfectivo,
  calcularAvanceEfectivoAccion,
  semaforoEfectivo,
  derivarEstadoContenedor,
  recalcularPadres,
  recalcularAccionContenedor,
  obtenerSubarbol,
  obtenerProyectoId,
};
