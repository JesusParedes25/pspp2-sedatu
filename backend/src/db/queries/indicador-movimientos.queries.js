/**
 * ARCHIVO: indicador-movimientos.queries.js
 * PROPÓSITO: Historial de movimientos de un indicador (migración 084) —
 *            de solo inserción. `indicadores.valor_actual` es, a partir
 *            de esta versión, SIEMPRE la suma de los movimientos no
 *            anulados de ese indicador — este archivo es el ÚNICO lugar
 *            que escribe esa columna (ver `recalcularValorActual`).
 *            `aportaciones.queries.js::procesarCambioNodo` es quien
 *            decide CUÁNDO insertar un movimiento de origen 'actividad';
 *            este archivo solo sabe insertar/anular/listar/recalcular.
 */
const pool = require('../pool');

// Única función que escribe `indicadores.valor_actual` en toda la
// plataforma (ver reporte del PR, punto 1.3) — recalcula desde los
// movimientos no anulados, nunca desde otra fuente.
async function recalcularValorActual(indicadorId, client = null) {
  const db = client || pool;
  const { rows: [{ total }] } = await db.query(
    `SELECT COALESCE(SUM(cantidad), 0)::numeric AS total
       FROM indicador_movimientos
      WHERE id_indicador = $1 AND anulado_en IS NULL`,
    [indicadorId]
  );
  await db.query(
    'UPDATE indicadores SET valor_actual = $1, updated_at = NOW() WHERE id = $2',
    [total, indicadorId]
  );
  return parseFloat(total);
}

// Suma acumulada de un NODO hacia un indicador — el algoritmo de
// aportaciones proporcionales (aportaciones.queries.js) la usa para saber
// "cuánto llevo ya metido por este nodo" antes de insertar la diferencia.
async function sumaAcumuladaDeNodo(indicadorId, nodoId, client = null) {
  const db = client || pool;
  const { rows: [{ total }] } = await db.query(
    `SELECT COALESCE(SUM(cantidad), 0)::numeric AS total
       FROM indicador_movimientos
      WHERE id_indicador = $1 AND id_nodo_origen = $2 AND anulado_en IS NULL`,
    [indicadorId, nodoId]
  );
  return parseFloat(total);
}

// Inserta un movimiento. Con `colapsarMismoDia: true` (solo lo pide el
// modo proporcional — ver aportaciones.queries.js::procesarCambioNodo),
// si ya existe uno SIN anular del MISMO nodo, MISMO indicador, de HOY,
// se ajusta esa misma fila en vez de crear una nueva: "uno por nodo y
// por día, que se va ajustando" — varios cambios de avance el mismo día
// no generan una fila por cada clic. Completar/reabrir una actividad
// (modo al_concluir) NUNCA colapsa: cada uno es su propio renglón, aunque
// ocurran el mismo día — "no borres el movimiento, inserta uno
// invertido" solo tiene sentido si el original queda intacto y aparte.
async function crear({ idIndicador, cantidad, fecha, origen, idNodoOrigen, nota, creadoPor, colapsarMismoDia = false }, client = null) {
  const db = client || pool;
  if (parseFloat(cantidad) === 0) return null; // nada que registrar

  if (colapsarMismoDia && origen === 'actividad' && idNodoOrigen) {
    const { rows: [existente] } = await db.query(
      `SELECT id, cantidad FROM indicador_movimientos
        WHERE id_indicador = $1 AND id_nodo_origen = $2 AND origen = 'actividad'
          AND fecha = $3 AND anulado_en IS NULL
        LIMIT 1`,
      [idIndicador, idNodoOrigen, fecha]
    );
    if (existente) {
      const nuevaCantidad = parseFloat(existente.cantidad) + parseFloat(cantidad);
      const { rows: [actualizado] } = await db.query(
        `UPDATE indicador_movimientos SET cantidad = $1, nota = $2 WHERE id = $3 RETURNING *`,
        [nuevaCantidad, nota || null, existente.id]
      );
      await recalcularValorActual(idIndicador, db);
      return actualizado;
    }
  }

  const { rows: [movimiento] } = await db.query(
    `INSERT INTO indicador_movimientos
       (id_indicador, cantidad, fecha, origen, id_nodo_origen, nota, creado_por)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [idIndicador, cantidad, fecha, origen, idNodoOrigen || null, nota || null, creadoPor || null]
  );
  await recalcularValorActual(idIndicador, db);
  return movimiento;
}

// Anular NO borra: deja el renglón visible (tachado en la pantalla) con
// quién y por qué, y recalcula valor_actual sin ese movimiento. Mismo
// patrón que ya usan riesgos (estado 'Cerrado') y evidencias en esta
// plataforma — nunca un DELETE sobre algo que un usuario capturó.
async function anular(movimientoId, { motivo, usuarioId }, client = null) {
  const db = client || pool;
  const { rows: [movimiento] } = await db.query(
    `UPDATE indicador_movimientos
        SET anulado_en = NOW(), anulado_por = $1, motivo_anulacion = $2
      WHERE id = $3 AND anulado_en IS NULL
      RETURNING *`,
    [usuarioId || null, motivo || null, movimientoId]
  );
  if (!movimiento) return null;
  await recalcularValorActual(movimiento.id_indicador, db);
  return movimiento;
}

// Historial completo de un indicador para la pantalla de detalle —
// resuelve el nombre del nodo de origen con un triple LEFT JOIN por id
// (mismo patrón que aportaciones.queries.js::listarPorIndicador): el id
// es UUID globalmente único entre etapas/acciones/tareas, así que como
// mucho uno de los tres LEFT JOIN encuentra fila.
async function listarPorIndicador(indicadorId) {
  const { rows } = await pool.query(
    `SELECT m.*,
        u.nombre_completo AS creador_nombre,
        ua.nombre_completo AS anulador_nombre,
        COALESCE(e.nombre, a.nombre, t.nombre) AS nodo_nombre,
        CASE WHEN e.id IS NOT NULL THEN 'etapa'
             WHEN a.id IS NOT NULL THEN 'accion'
             WHEN t.id IS NOT NULL THEN 'tarea' END AS nodo_tipo
       FROM indicador_movimientos m
       LEFT JOIN usuarios u ON u.id = m.creado_por
       LEFT JOIN usuarios ua ON ua.id = m.anulado_por
       LEFT JOIN etapas e ON e.id = m.id_nodo_origen
       LEFT JOIN acciones a ON a.id = m.id_nodo_origen
       LEFT JOIN tareas t ON t.id = m.id_nodo_origen
      WHERE m.id_indicador = $1
      ORDER BY m.fecha DESC, m.created_at DESC`,
    [indicadorId]
  );
  return rows;
}

// Serie para la gráfica de "acumulado en el tiempo" y para construir
// `historico` en /publico/indicadores — un punto por fecha con valor
// (SOLO movimientos no anulados), acumulado desde el primero. Si dos
// movimientos caen en la misma fecha, se suman en un solo punto.
async function historicoAcumulado(indicadorId, limite = null) {
  const { rows } = await pool.query(
    `SELECT fecha, SUM(cantidad)::numeric AS delta
       FROM indicador_movimientos
      WHERE id_indicador = $1 AND anulado_en IS NULL
      GROUP BY fecha
      ORDER BY fecha ASC`,
    [indicadorId]
  );
  let acumulado = 0;
  const serie = rows.map(r => {
    acumulado += parseFloat(r.delta);
    return { fecha: r.fecha, valor: acumulado };
  });
  return limite ? serie.slice(-limite) : serie;
}

// Fecha del último movimiento no anulado — "fecha_corte" real del dato,
// a diferencia de `indicadores.updated_at` (que se mueve con cualquier
// edición, no solo con una captura).
async function fechaUltimoMovimiento(indicadorId) {
  const { rows: [row] } = await pool.query(
    `SELECT MAX(fecha) AS fecha FROM indicador_movimientos
      WHERE id_indicador = $1 AND anulado_en IS NULL`,
    [indicadorId]
  );
  return row?.fecha || null;
}

async function obtenerIndicadorDeMovimiento(movimientoId) {
  const { rows: [row] } = await pool.query(
    'SELECT id_indicador FROM indicador_movimientos WHERE id = $1', [movimientoId]
  );
  return row?.id_indicador || null;
}

module.exports = {
  recalcularValorActual,
  sumaAcumuladaDeNodo,
  crear,
  anular,
  listarPorIndicador,
  historicoAcumulado,
  fechaUltimoMovimiento,
  obtenerIndicadorDeMovimiento,
};
