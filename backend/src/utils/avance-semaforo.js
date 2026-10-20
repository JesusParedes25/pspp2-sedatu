/**
 * ARCHIVO: avance-semaforo.js
 * PROPÓSITO: Lógica de cálculo de avance efectivo y semáforo automático.
 */
const pool = require('../db/pool');

// Ventana de aviso de "Por vencer", por prioridad — escala monótona: más
// prioridad avisa antes o igual, nunca menos (antes solo 'Muy Alta' hacía
// algo y 'Crítica', el nivel más alto del catálogo, no tenía efecto).
// Única fuente de estos números: calcularSemaforo la usa aquí, y el
// frontend la espeja en SemaforoDot.jsx (sin forma de compartir el módulo
// entre procesos) para poder escribir sus propios textos de ayuda sin
// repetir los días a mano.
const VENTANA_POR_VENCER = Object.freeze({
  'Crítica': 21,
  'Muy Alta': 14,
  'Alta': 7,
  'Media': 7,
  'Baja': 7,
});
const VENTANA_POR_DEFECTO = 7; // prioridad sin definir

function ventanaAvisoPorVencer(prioridad) {
  return VENTANA_POR_VENCER[prioridad] ?? VENTANA_POR_DEFECTO;
}

/**
 * Calcula el semáforo automático desde estado + fecha_limite + prioridad.
 * fecha_fin es un fallback cuando fecha_limite está vacía (mismo criterio
 * de "fecha efectiva" que ya usa el resto de la app — fechaFinEfectiva()
 * en el frontend, la lista de "Vencidas" del dashboard, etc.) — sin este
 * fallback, un nodo sin fecha_limite capturada nunca podía caer en rojo/
 * ámbar por atraso aunque su fecha_fin estuviera vencida hace semanas.
 *
 * Orden de evaluación (no es intercambiable):
 *   1. Completada           → verde (SIEMPRE, antes que cualquier otra
 *      cosa — incluida la ausencia de fecha: una Completada sin fecha
 *      sigue en verde, no en gris).
 *   2. Cancelada             → gris.
 *   3. sin fecha efectiva    → gris, para CUALQUIER otro estado (antes
 *      solo aplicaba junto con Pendiente; "sin fecha" es ahora siempre
 *      "falta capturar la fecha", nunca "todo bien" por default — una
 *      actividad En proceso o Bloqueada sin fecha ya no se pinta verde).
 *   4. dias < 0              → rojo (vencida).
 *   5. dias <= ventana(prioridad), INCLUSIVE → ámbar (por vencer). El
 *      caso general y el de alta prioridad usaban bordes distintos
 *      (<=7 y <14): ahora los dos usan <=, así que el día exacto del
 *      borde (p.ej. 14 días con 'Muy Alta') cae en ámbar un día más que
 *      antes.
 *   6. resto                 → verde.
 *
 * 'Bloqueada' YA NO tiene un caso propio: antes mandaba a rojo con <3
 * días de margen y a ámbar en cualquier otro caso (incluso con 60 días
 * de margen) — eso era estado contaminando urgencia; el chip de estado
 * ya dice que está bloqueada. Ahora calcula su color exactamente igual
 * que cualquier otro estado no terminal.
 */
function calcularSemaforo(estado, fecha_limite, prioridad, fecha_fin) {
  if (estado === 'Completada') return 'verde';
  if (estado === 'Cancelada') return 'gris';

  const fechaEfectiva = fecha_limite ?? fecha_fin ?? null;
  if (!fechaEfectiva) return 'gris';

  // Mismo patrón que tiempoDeOrden() en acciones.queries.js (post PR
  // #158): new Date(x) acepta tanto el objeto Date que devuelve `pg`
  // para una columna DATE/TIMESTAMP como una cadena ISO, sin que importe
  // cuál de los dos llegue aquí — no hace falta una comparación nueva.
  const ahora = new Date();
  ahora.setHours(0, 0, 0, 0);
  const limite = new Date(fechaEfectiva);
  limite.setHours(0, 0, 0, 0);
  const dias = Math.ceil((limite - ahora) / (1000 * 60 * 60 * 24));

  if (dias < 0) return 'rojo';
  if (dias <= ventanaAvisoPorVencer(prioridad)) return 'ambar';
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
  return calcularSemaforo(nodo.estado, nodo.fecha_limite, nodo.prioridad, nodo.fecha_fin);
}

/**
 * Deriva el estado de un contenedor a partir de los estados de TODOS sus
 * hijos directos (incluidos los Cancelada — es la única forma de distinguir
 * "sin hijos en absoluto" de "todos los hijos se cancelaron").
 * Reglas:
 *   sin hijos en absoluto     → Pendiente
 *   todos los hijos Cancelada → Cancelada
 *   todos los activos Completada → Completada
 *   algún activo Bloqueada    → Bloqueada
 *   algún activo En_proceso o Completada (mezcla) → En_proceso
 *   resto (todos Pendiente)   → Pendiente
 */
function derivarEstadoContenedor(hijosEstados) {
  if (hijosEstados.length === 0) return 'Pendiente';
  const activos = hijosEstados.filter(e => e !== 'Cancelada');
  if (activos.length === 0) return 'Cancelada';
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
        "SELECT estado FROM acciones WHERE id_etapa = $1 AND id_accion_padre IS NULL",
        [r.id_etapa]
      );
      const estadoDerivado = derivarEstadoContenedor(hijosEtapa.map(h => h.estado));
      const { rows: [etapaNodo] } = await conn.query(
        'SELECT fecha_limite, fecha_fin, prioridad, semaforo_override, estado, estado_override FROM etapas WHERE id = $1', [r.id_etapa]
      );
      if (!etapaNodo) return;
      const estadoEtapa = etapaNodo.estado_override ? etapaNodo.estado : estadoDerivado;
      if (!etapaNodo.semaforo_override) {
        const sem = calcularSemaforo(estadoEtapa, etapaNodo.fecha_limite, etapaNodo.prioridad, etapaNodo.fecha_fin);
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

  // Recoger TODOS los hijos, incluidos los Cancelada — necesario para
  // distinguir "sin hijos" (hoja real) de "todos los hijos se cancelaron"
  // (contenedor vacío por cancelación, que debe leerse como Cancelada).
  const { rows: subAcc } = await conn.query(
    "SELECT estado FROM acciones WHERE id_accion_padre = $1",
    [accionId]
  );
  const { rows: tareasHijas } = await conn.query(
    "SELECT estado FROM tareas WHERE id_accion = $1",
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
    'SELECT fecha_limite, fecha_fin, prioridad, semaforo_override, estado, estado_override FROM acciones WHERE id = $1', [accionId]
  );
  if (!nodo) return;
  const estadoFinal = nodo.estado_override ? nodo.estado : estadoDerivado;

  if (!nodo.semaforo_override) {
    const sem = calcularSemaforo(estadoFinal, nodo.fecha_limite, nodo.prioridad, nodo.fecha_fin);
    await conn.query(
      'UPDATE acciones SET porcentaje_avance = $1, estado = $2, semaforo = $3, updated_at = NOW() WHERE id = $4',
      [avance, estadoFinal, sem, accionId]
    );
  } else {
    await conn.query(
      'UPDATE acciones SET porcentaje_avance = $1, estado = $2, updated_at = NOW() WHERE id = $3',
      [avance, estadoFinal, accionId]
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
           dg.id AS responsable_dg_id, dg.siglas AS responsable_dg_siglas,
           (SELECT COALESCE(json_agg(json_build_object('cve_mun', em.cve_mun, 'nombre', gm.nombre) ORDER BY gm.nombre), '[]'::json)
              FROM etapa_municipios em JOIN geo_municipios gm ON gm.cvegeo = em.cve_mun
              WHERE em.etapa_id = e.id) AS municipios,
           -- 'captura' (antes 'colaborador', migración 079 del modelo de
           -- permisos) — comparar contra el nombre viejo aquí dejaría esta
           -- lista siempre vacía sin que ningún error lo delatara.
           (SELECT COALESCE(json_agg(json_build_object('id', nm.id_usuario, 'nombre', u2.nombre_completo)), '[]'::json)
              FROM nodo_miembros nm JOIN usuarios u2 ON u2.id = nm.id_usuario
              WHERE nm.tipo_nodo = 'etapa' AND nm.id_nodo = e.id
                AND nm.rol = 'captura' AND nm.estado = 'aceptada') AS colaboradores,
           (SELECT COUNT(*)::int FROM riesgos r WHERE r.entidad_tipo = 'Etapa' AND r.entidad_id = e.id
              AND r.estado IN ('Abierto','En_mitigacion')) AS riesgos_abiertos
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
           dg.id AS responsable_dg_id, dg.siglas AS responsable_dg_siglas,
           (SELECT COALESCE(json_agg(json_build_object('cve_mun', am.cve_mun, 'nombre', gm.nombre) ORDER BY gm.nombre), '[]'::json)
              FROM accion_municipios am JOIN geo_municipios gm ON gm.cvegeo = am.cve_mun
              WHERE am.accion_id = a.id) AS municipios,
           (SELECT COALESCE(json_agg(json_build_object('id', nm.id_usuario, 'nombre', u2.nombre_completo)), '[]'::json)
              FROM nodo_miembros nm JOIN usuarios u2 ON u2.id = nm.id_usuario
              WHERE nm.tipo_nodo = 'accion' AND nm.id_nodo = a.id
                AND nm.rol = 'captura' AND nm.estado = 'aceptada') AS colaboradores,
           (SELECT COUNT(*)::int FROM riesgos r WHERE r.entidad_tipo = 'Accion' AND r.entidad_id = a.id
              AND r.estado IN ('Abierto','En_mitigacion')) AS riesgos_abiertos
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

    // Sub-acciones: acciones colgadas de esta acción.
    //
    // Iban en `acc.tareas`, y ahí se perdían por partida doble: el frontend
    // lee `acc.subacciones` y `acc.tareas` por separado (hijosDe en
    // EtapasAvancesMD/utils.js), y el endpoint del árbol reemplazaba
    // `acc.tareas` con las tareas de la tabla `tareas` justo después de
    // llamar aquí. Resultado: las subacciones existían en la base y no
    // aparecían en ningún lado del árbol.
    const { rows: subs } = await conn.query(`
      SELECT s.*, u.nombre_completo AS responsable_nombre,
             dg.id AS responsable_dg_id, dg.siglas AS responsable_dg_siglas,
             (SELECT COALESCE(json_agg(json_build_object('cve_mun', am.cve_mun, 'nombre', gm.nombre) ORDER BY gm.nombre), '[]'::json)
                FROM accion_municipios am JOIN geo_municipios gm ON gm.cvegeo = am.cve_mun
                WHERE am.accion_id = s.id) AS municipios,
             (SELECT COALESCE(json_agg(json_build_object('id', nm.id_usuario, 'nombre', u2.nombre_completo)), '[]'::json)
                FROM nodo_miembros nm JOIN usuarios u2 ON u2.id = nm.id_usuario
                WHERE nm.tipo_nodo = 'accion' AND nm.id_nodo = s.id
                  AND nm.rol = 'captura' AND nm.estado = 'aceptada') AS colaboradores,
             (SELECT COUNT(*)::int FROM riesgos r WHERE r.entidad_tipo = 'Subaccion' AND r.entidad_id = s.id
                AND r.estado IN ('Abierto','En_mitigacion')) AS riesgos_abiertos
      FROM acciones s
      LEFT JOIN usuarios u ON u.id = s.id_responsable
      LEFT JOIN direcciones_generales dg ON dg.id = u.id_dg
      WHERE s.id_accion_padre = $1
      ORDER BY s.created_at
    `, [acc.id]);
    acc.subacciones = [];
    for (const sub of subs) {
      sub.avance_efectivo = await calcularAvanceEfectivoAccion(sub, conn);
      sub.semaforo_efectivo = semaforoEfectivo(sub);
      sub.es_hoja = await esNodoHoja(sub.id, conn);
      sub.tareas = await tareasDe(sub.id, conn);
      acc.subacciones.push(sub);
    }

    // Tareas: el tercer nivel de la jerarquía, en su propia tabla.
    acc.tareas = await tareasDe(acc.id, conn);

    etapa.acciones.push(acc);
  }

  return etapa;
}

// Tareas de una acción, con su avance y semáforo efectivos ya calculados.
//
// Una tarea es siempre nodo hoja, así que su avance efectivo no necesita
// consultar hijos: es su propio avance, o 100 si está completada.
async function tareasDe(idAccion, conn) {
  const { rows } = await conn.query(`
    SELECT t.*, u.nombre_completo AS responsable_nombre,
           (SELECT COALESCE(json_agg(json_build_object('cve_mun', tm.cve_mun, 'nombre', gm.nombre) ORDER BY gm.nombre), '[]'::json)
              FROM tarea_municipios tm JOIN geo_municipios gm ON gm.cvegeo = tm.cve_mun
              WHERE tm.tarea_id = t.id) AS municipios,
           (SELECT COALESCE(json_agg(json_build_object('id', nm.id_usuario, 'nombre', u2.nombre_completo)), '[]'::json)
              FROM nodo_miembros nm JOIN usuarios u2 ON u2.id = nm.id_usuario
              WHERE nm.tipo_nodo = 'tarea' AND nm.id_nodo = t.id
                AND nm.rol = 'captura' AND nm.estado = 'aceptada') AS colaboradores,
           (SELECT COUNT(*)::int FROM riesgos r WHERE r.entidad_tipo = 'Tarea' AND r.entidad_id = t.id
              AND r.estado IN ('Abierto','En_mitigacion')) AS riesgos_abiertos
    FROM tareas t
    LEFT JOIN usuarios u ON u.id = t.id_responsable
    WHERE t.id_accion = $1
    ORDER BY t.orden, t.created_at
  `, [idAccion]);

  for (const t of rows) {
    t.avance_efectivo = t.avance_actual != null ? t.avance_actual : (t.estado === 'Completada' ? 100 : 0);
    t.semaforo_efectivo = semaforoEfectivo(t);
  }
  return rows;
}

module.exports = {
  calcularSemaforo,
  VENTANA_POR_VENCER,
  VENTANA_POR_DEFECTO,
  ventanaAvisoPorVencer,
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
