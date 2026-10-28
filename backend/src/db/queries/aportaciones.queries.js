/**
 * ARCHIVO: aportaciones.queries.js
 * PROPÓSITO: Consultas SQL para aportaciones de nodos a indicadores.
 *
 * MINI-CLASE: de "recalcular todo" a "procesar lo que cambió"
 * ─────────────────────────────────────────────────────────────────
 * Hasta la migración 084, `recalcularAportacionesProyecto` barría TODO
 * el proyecto cada vez que cualquier nodo cambiaba de estado/avance, y
 * escribía `indicadores.valor_actual` desde cero a partir del estado
 * ACTUAL de cada nodo vinculado (sin memoria de lo que había antes). Esa
 * función (y su hermana `recalcularUnIndicador`) ya NO EXISTEN: con el
 * historial de movimientos (`indicador_movimientos`,
 * indicador-movimientos.queries.js), la única función que escribe
 * `indicadores.valor_actual` en toda la plataforma es
 * `recalcularValorActual` de ESE archivo — aquí nunca se vuelve a tocar
 * esa columna directamente.
 *
 * `procesarCambioNodo` reemplaza a las dos funciones retiradas: en vez
 * de recalcular el proyecto completo, mira SOLO el nodo que acaba de
 * cambiar, calcula a dónde debería llegar su aportación ("objetivo") y
 * compara contra lo que ya se había insertado para ese nodo
 * ("acumulado") — el movimiento que inserta es la diferencia. Esa resta
 * es, a la vez, la cuenta de completar (0→aportación), reabrir
 * (aportación→0, sin borrar lo anterior) y avanzar proporcionalmente
 * (lo que haga falta para que el acumulado alcance aportación×avance%) —
 * un solo cálculo para los tres casos, sin ramas por aparte.
 * ─────────────────────────────────────────────────────────────────
 */
const pool = require('../pool');
const { idsNodoYDescendientes } = require('../../utils/descendientes-nodo');
const movimientosQueries = require('./indicador-movimientos.queries');

// Trae también de qué proyecto es cada nodo: una aportación puede venir
// de un proyecto distinto al dueño del indicador (el módulo permite
// asociar cualquier etapa/acción/tarea, de uno o varios proyectos) — sin
// esto, la pantalla de detalle del indicador no podría distinguir un
// nodo "de este proyecto" de uno ajeno.
async function listarPorIndicador(indicadorId) {
  const res = await pool.query(`
    SELECT ia.*,
      e.nombre AS etapa_nombre,
      a.nombre AS accion_nombre,
      t.nombre AS tarea_nombre,
      COALESCE(pe.id, pa.id, pta.id) AS nodo_proyecto_id,
      COALESCE(pe.nombre, pa.nombre, pta.nombre) AS nodo_proyecto_nombre,
      COALESCE(
        CASE WHEN ia.id_etapa IS NOT NULL THEN COALESCE(e.avance_actual, e.porcentaje_calculado) END,
        CASE WHEN ia.id_accion IS NOT NULL THEN COALESCE(a.avance_actual, a.porcentaje_avance) END,
        CASE WHEN ia.id_tarea IS NOT NULL THEN t.avance_actual END,
        0
      )::numeric AS avance_efectivo,
      COALESCE(e.estado, a.estado, t.estado) AS estado_nodo
    FROM indicador_aportaciones ia
    LEFT JOIN etapas e ON e.id = ia.id_etapa
    LEFT JOIN acciones a ON a.id = ia.id_accion
    LEFT JOIN tareas t ON t.id = ia.id_tarea
    LEFT JOIN acciones ta ON ta.id = t.id_accion
    LEFT JOIN proyectos pe ON pe.id = e.id_proyecto
    LEFT JOIN proyectos pa ON pa.id = a.id_proyecto
    LEFT JOIN proyectos pta ON pta.id = ta.id_proyecto
    WHERE ia.id_indicador = $1
    ORDER BY ia.created_at
  `, [indicadorId]);
  return res.rows;
}

// incluirHijos=false (default, comportamiento histórico): solo las
// aportaciones del nodo exacto — usado por TabIndicadores (modal "Vincular
// indicador") donde la pregunta es "a qué aporta ESTE nodo", no su subárbol.
// incluirHijos=true: agrega también las de sus descendientes, con "origen"
// (de qué nodo viene cada una) — pestaña "Indicadores" de Detalle (Fase 4).
async function listarPorNodo(tipo, nodoId, incluirHijos = false) {
  const { etapaIds, accionIds, tareaIds } = await idsNodoYDescendientes(tipo, nodoId, incluirHijos);

  const condiciones = [];
  const params = [];
  let idx = 1;
  if (etapaIds.length) { condiciones.push(`ia.id_etapa = ANY($${idx++})`); params.push(etapaIds); }
  if (accionIds.length) { condiciones.push(`ia.id_accion = ANY($${idx++})`); params.push(accionIds); }
  if (tareaIds.length) { condiciones.push(`ia.id_tarea = ANY($${idx++})`); params.push(tareaIds); }
  if (!condiciones.length) return [];

  const res = await pool.query(`
    SELECT ia.*, i.nombre AS indicador_nombre, i.unidad, i.unidad_personalizada, i.etiqueta_unidad, i.tipo AS indicador_tipo,
      CASE WHEN ia.id_etapa IS NOT NULL THEN 'etapa' WHEN ia.id_tarea IS NOT NULL THEN 'tarea' ELSE 'accion' END AS origen_tipo,
      COALESCE(ia.id_etapa, ia.id_accion, ia.id_tarea) AS origen_id,
      COALESCE(e.nombre, a.nombre, t.nombre) AS origen_nombre
    FROM indicador_aportaciones ia
    JOIN indicadores i ON i.id = ia.id_indicador
    LEFT JOIN etapas e ON e.id = ia.id_etapa
    LEFT JOIN acciones a ON a.id = ia.id_accion
    LEFT JOIN tareas t ON t.id = ia.id_tarea
    WHERE (${condiciones.join(' OR ')}) AND i.activo = true
    ORDER BY i.nombre
  `, params);

  for (const row of res.rows) {
    row.origen = (row.origen_tipo === tipo && row.origen_id === nodoId)
      ? null
      : { tipo: row.origen_tipo, id: row.origen_id, nombre: row.origen_nombre };
  }

  return res.rows;
}

// Vincular el mismo nodo dos veces al mismo indicador ya no sobrescribe
// en silencio — antes caía en un ON CONFLICT DO UPDATE sin que nadie
// se enterara de que el monto/modo de la primera vinculación se había
// perdido. Ahora un INSERT simple, y la violación de unicidad
// (Postgres 23505, disparada por los índices únicos parciales de
// id_etapa/id_accion/id_tarea) se relanza como un error 409 tipado
// con la fila existente adjunta — el controller decide si mostrarla
// para pedir confirmación explícita antes de sobreescribir.
//
// id_categoria ya no se acepta aquí: las categorías de indicador se
// retiraron del flujo vivo (ver migración 084) — una aportación nueva
// siempre es contra el indicador completo.
async function crear(datos, client = null) {
  const db = client || pool;
  const { id_indicador, id_etapa, id_accion, id_tarea, aportacion, modo } = datos;
  try {
    const res = await db.query(`
      INSERT INTO indicador_aportaciones (id_indicador, id_etapa, id_accion, id_tarea, aportacion, modo)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [id_indicador, id_etapa || null, id_accion || null, id_tarea || null, aportacion || 0, modo || 'al_concluir']);
    return res.rows[0];
  } catch (pgErr) {
    if (pgErr.code === '23505') {
      const col = id_etapa ? 'id_etapa' : id_accion ? 'id_accion' : 'id_tarea';
      const valorCol = id_etapa || id_accion || id_tarea;
      const { rows: [existente] } = await db.query(
        `SELECT * FROM indicador_aportaciones WHERE id_indicador = $1 AND ${col} = $2`,
        [id_indicador, valorCol]
      );
      const err = new Error('Este nodo ya está vinculado a este indicador');
      err.statusCode = 409;
      err.codigo = 'YA_VINCULADO';
      err.aportacionExistente = existente;
      throw err;
    }
    throw pgErr;
  }
}

async function actualizar(id, datos) {
  const campos = [];
  const vals = [];
  let idx = 1;
  if (datos.aportacion !== undefined) { campos.push(`aportacion = $${idx++}`); vals.push(datos.aportacion); }
  if (datos.modo !== undefined) { campos.push(`modo = $${idx++}`); vals.push(datos.modo); }
  if (campos.length === 0) return null;
  vals.push(id);
  const res = await pool.query(
    `UPDATE indicador_aportaciones SET ${campos.join(', ')} WHERE id = $${idx} RETURNING *`,
    vals
  );
  return res.rows[0];
}

async function obtenerIndicadorDeAportacion(id) {
  const { rows: [row] } = await pool.query(
    'SELECT id_indicador FROM indicador_aportaciones WHERE id = $1', [id]
  );
  return row?.id_indicador || null;
}

// Resuelve tipo/id/nombre del nodo que aporta, para la bitácora — hay que
// llamarla ANTES de eliminar() en el flujo de "desvincular", porque una vez
// borrada la fila ya no hay forma de saber de qué nodo venía (esa era la
// causa de las entradas de bitácora sin nodo que ya existen en producción).
async function obtenerConNodo(id) {
  const { rows: [row] } = await pool.query(`
    SELECT ia.id, ia.id_indicador, ia.id_etapa, ia.id_accion, ia.id_tarea,
      COALESCE(e.nombre, a.nombre, t.nombre) AS nodo_nombre
    FROM indicador_aportaciones ia
    LEFT JOIN etapas e ON e.id = ia.id_etapa
    LEFT JOIN acciones a ON a.id = ia.id_accion
    LEFT JOIN tareas t ON t.id = ia.id_tarea
    WHERE ia.id = $1
  `, [id]);
  return row || null;
}

// Desvincular un nodo de un indicador NO deshace los movimientos que ya
// generó mientras estuvo vinculado — son historia capturada (misma
// regla que ya rige todo el módulo: nada desaparece). Solo deja de
// generar movimientos nuevos a partir de ahora.
async function eliminar(id) {
  const res = await pool.query('DELETE FROM indicador_aportaciones WHERE id = $1 RETURNING id, id_indicador', [id]);
  return res.rows[0];
}

async function eliminarPorNodo(tipo, nodoId) {
  const col = tipo === 'etapa' ? 'id_etapa' : tipo === 'tarea' ? 'id_tarea' : 'id_accion';
  await pool.query(`DELETE FROM indicador_aportaciones WHERE ${col} = $1`, [nodoId]);
}

// Objetivo al que debería llegar la aportación de UN nodo, según su modo
// y el estado/avance ACTUAL de ese nodo (ya debe reflejar el cambio que
// se acaba de guardar — se llama después del UPDATE, nunca antes):
//   al_concluir:   aportación completa si Completada, 0 si no.
//   proporcional:  aportación × (avance/100).
// El mismo cálculo cubre completar (0→aportación), reabrir (aportación→0)
// y avanzar/retroceder proporcionalmente — el movimiento que se inserta
// es siempre "objetivo menos lo que ya había acumulado este nodo".
function calcularObjetivo(aportacion, modo, estadoNodo, avanceNodo) {
  if (modo === 'proporcional') {
    return aportacion * (parseFloat(avanceNodo) || 0) / 100;
  }
  return estadoNodo === 'Completada' ? aportacion : 0;
}

const TABLA_POR_TIPO = { etapa: 'etapas', accion: 'acciones', tarea: 'tareas' };
const COLUMNA_APORTACION_POR_TIPO = { etapa: 'id_etapa', accion: 'id_accion', tarea: 'id_tarea' };
const COLUMNA_AVANCE_POR_TIPO = {
  etapa: 'COALESCE(avance_actual, porcentaje_calculado)',
  accion: 'COALESCE(avance_actual, porcentaje_avance)',
  tarea: 'avance_actual',
};

/**
 * Procesa las aportaciones de UN nodo tras un cambio de estado o de
 * avance — llamada por los dos caminos que mutan un nodo (cambiarEstado
 * en validaciones-estado.js, y el PATCH directo de
 * etapas/acciones/tareas.controller.js que acompaña "Registrar avance").
 * Se llama DESPUÉS de guardar el cambio en la tabla del nodo, nunca antes
 * — lee su estado/avance ya actualizado.
 *
 * `sumarAportaciones=false` (la casilla desmarcada al completar) corta
 * aquí mismo, sin tocar nada — la actividad ya se guardó igual, por
 * fuera de esta función.
 *
 * Devuelve los movimientos insertados/ajustados (para pruebas y para
 * que el controller pueda avisar al frontend cuántos indicadores se
 * tocaron).
 */
async function procesarCambioNodo(tipoNodo, nodoId, { sumarAportaciones = true, idUsuario } = {}, client = null) {
  const db = client || pool;
  if (!sumarAportaciones) return [];

  const columna = COLUMNA_APORTACION_POR_TIPO[tipoNodo];
  const tabla = TABLA_POR_TIPO[tipoNodo];
  if (!columna || !tabla) return [];

  const { rows: aportaciones } = await db.query(
    `SELECT * FROM indicador_aportaciones WHERE ${columna} = $1`, [nodoId]
  );
  if (aportaciones.length === 0) return [];

  const { rows: [nodo] } = await db.query(
    `SELECT estado, ${COLUMNA_AVANCE_POR_TIPO[tipoNodo]} AS avance FROM ${tabla} WHERE id = $1`,
    [nodoId]
  );
  if (!nodo) return [];

  const hoy = new Date().toISOString().slice(0, 10);
  const movimientos = [];

  for (const ap of aportaciones) {
    const aportacion = parseFloat(ap.aportacion) || 0;
    const objetivo = calcularObjetivo(aportacion, ap.modo, nodo.estado, nodo.avance);
    const acumulado = await movimientosQueries.sumaAcumuladaDeNodo(ap.id_indicador, nodoId, db);
    const diff = objetivo - acumulado;
    if (Math.abs(diff) < 0.0001) continue;

    const esProporcional = ap.modo === 'proporcional';
    const nota = esProporcional
      ? `Avance de la actividad vinculada: ${Math.round(parseFloat(nodo.avance) || 0)}%`
      : (nodo.estado === 'Completada' ? 'Actividad completada' : 'Actividad reabierta');

    // Solo 'proporcional' colapsa varios ajustes del mismo día en una
    // sola fila — completar/reabrir siempre son su propio renglón (ver
    // el comentario de indicador-movimientos.queries.js::crear).
    const mov = await movimientosQueries.crear({
      idIndicador: ap.id_indicador,
      cantidad: diff,
      fecha: hoy,
      origen: 'actividad',
      idNodoOrigen: nodoId,
      nota,
      creadoPor: idUsuario,
      colapsarMismoDia: esProporcional,
    }, db);
    if (mov) movimientos.push(mov);
  }

  return movimientos;
}

module.exports = {
  listarPorIndicador,
  listarPorNodo,
  crear,
  actualizar,
  eliminar,
  obtenerConNodo,
  eliminarPorNodo,
  obtenerIndicadorDeAportacion,
  procesarCambioNodo,
};
