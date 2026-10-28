/**
 * ARCHIVO: publico.controller.js
 * PROPÓSITO: API de salida para el tablero ejecutivo externo.
 *            Autenticada con token de servicio (api_tokens), NO con la
 *            sesión de un usuario.
 *
 * MINI-CLASE: qué contrato se le promete al consumidor
 * ─────────────────────────────────────────────────────────────────
 * Un consumidor externo no puede depender de nuestros UUIDs ni de los
 * nombres, que cambian. Por eso la respuesta se organiza alrededor de
 * `clave` (ver migración 049): estable, legible y única. Mientras la
 * clave no cambie, el tablero del otro lado puede empatar la serie
 * histórica sin importar qué se haya renombrado de este lado.
 *
 * Es de SOLO LECTURA a propósito: la plataforma externa consulta, no
 * escribe. Cualquier escritura entraría por la app, con un usuario
 * real detrás y su registro de actividad.
 *
 * MINI-CLASE: `actualizado_en` vs. `fecha_corte` (Bloque 8 del encargo)
 * ─────────────────────────────────────────────────────────────────
 * `actualizado_en` es `indicadores.updated_at`: se mueve con CUALQUIER
 * edición de la fila (renombrar, cambiar la meta, re-vincular el
 * catálogo), no solo con una captura de avance — no es confiable para
 * saber "a qué fecha corresponde este número". `fecha_corte` es la
 * fecha del movimiento no anulado más reciente del historial
 * (indicador_movimientos, migración 084): la fecha real del dato. Para
 * un indicador migrado sin movimientos todavía posteriores a la
 * migración (Bloque 9), `fecha_corte` puede venir null — el documento
 * en docs/api-indicadores.md explica este caso.
 * ─────────────────────────────────────────────────────────────────
 */
const pool = require('../db/pool');
const { calcularAvancePorcentaje } = require('../utils/indicador-calculo');

const HISTORICO_LIMITE_DEFAULT = 60;
const HISTORICO_LIMITE_MAXIMO = 365;

// Núcleo de la respuesta — lo comparten la ruta pública (autenticada con
// token, GET /publico/indicadores) y el probador de Administración > API
// (autenticado con la sesión del superadmin, nunca con el token: el
// token solo se guarda hasheado, así que el panel no podría usarlo ni
// si quisiera). Las dos rutas corren exactamente este mismo código —
// lo que el probador muestra es la respuesta real, no una simulación.
async function obtenerDatosIndicadores(soloClave, historicoLimite) {
  const { rows } = await pool.query(`
    SELECT
      c.clave, c.nombre, c.descripcion, c.tipo, c.unidad,
      c.unidad_personalizada, c.etiqueta_unidad, c.definicion, c.fuente,
      c.activo,
      i.id            AS indicador_id,
      i.meta_global, i.valor_actual,
      p.id            AS proyecto_id,
      p.nombre        AS proyecto_nombre,
      p.estado        AS proyecto_estado,
      dg.siglas       AS dg_siglas,
      creador.nombre_completo AS capturado_por,
      i.updated_at    AS actualizado_en
    FROM catalogo_indicadores c
    LEFT JOIN indicadores i ON i.id_catalogo = c.id AND i.activo = true
    LEFT JOIN proyectos p   ON p.id = i.id_proyecto AND p.deleted_at IS NULL AND p.estado != 'Cancelada'
    LEFT JOIN direcciones_generales dg ON dg.id = p.id_dg_lider
    LEFT JOIN usuarios creador ON creador.id = i.id_creador
    WHERE ($1::text IS NULL OR c.clave = $1)
    ORDER BY c.nombre, p.nombre
  `, [soloClave]);

  const idsIndicador = [...new Set(rows.map(r => r.indicador_id).filter(Boolean))];

  // Por lote, no uno por indicador — fecha_corte y historico de TODOS
  // los indicadores de esta respuesta en dos consultas, sin importar
  // cuántos proyectos traiga.
  const fechaCortePorIndicador = {};
  const historicoPorIndicador = {};
  if (idsIndicador.length > 0) {
    const { rows: fechas } = await pool.query(`
      SELECT id_indicador, MAX(fecha) AS fecha_corte
        FROM indicador_movimientos
       WHERE id_indicador = ANY($1) AND anulado_en IS NULL
       GROUP BY id_indicador
    `, [idsIndicador]);
    for (const f of fechas) fechaCortePorIndicador[f.id_indicador] = f.fecha_corte;

    const { rows: movimientos } = await pool.query(`
      SELECT id_indicador, fecha, SUM(cantidad)::numeric AS delta
        FROM indicador_movimientos
       WHERE id_indicador = ANY($1) AND anulado_en IS NULL
       GROUP BY id_indicador, fecha
       ORDER BY id_indicador, fecha ASC
    `, [idsIndicador]);
    const acumuladoPorIndicador = {};
    for (const m of movimientos) {
      const acumulado = (acumuladoPorIndicador[m.id_indicador] || 0) + parseFloat(m.delta);
      acumuladoPorIndicador[m.id_indicador] = acumulado;
      (historicoPorIndicador[m.id_indicador] = historicoPorIndicador[m.id_indicador] || [])
        .push({ fecha: m.fecha, valor: acumulado });
    }
    // Cap: los últimos N puntos, no una página intermedia — quien
    // consume esto es casi siempre una gráfica que quiere "lo más
    // reciente", nunca "la página 3 del historial". Ver docs/api-indicadores.md.
    if (historicoLimite) {
      for (const id of Object.keys(historicoPorIndicador)) {
        historicoPorIndicador[id] = historicoPorIndicador[id].slice(-historicoLimite);
      }
    }
  }

  // Se agrupa en Node y no en SQL para poder devolver el desglose
  // anidado; el volumen es de decenas de indicadores, no de millones.
  const porClave = new Map();
  for (const r of rows) {
    if (!porClave.has(r.clave)) {
      porClave.set(r.clave, {
        clave: r.clave,
        nombre: r.nombre,
        descripcion: r.descripcion,
        tipo: r.tipo,
        unidad: r.unidad,
        etiqueta_unidad: r.etiqueta_unidad || r.unidad_personalizada || null,
        definicion: r.definicion,
        fuente: r.fuente,
        activo: r.activo,
        meta_total: 0,
        avance_total: 0,
        proyectos: [],
      });
    }
    const entrada = porClave.get(r.clave);
    // Un indicador del catálogo puede no estar usado por nadie todavía:
    // se devuelve igual, con totales en cero, para que el consumidor
    // conozca el universo completo y no solo lo que ya tiene datos.
    if (!r.indicador_id) continue;

    const meta = r.meta_global == null ? null : parseFloat(r.meta_global);
    const valor = r.valor_actual == null ? 0 : parseFloat(r.valor_actual);
    entrada.meta_total += meta || 0;
    entrada.avance_total += valor;
    entrada.proyectos.push({
      proyecto_id: r.proyecto_id,
      proyecto: r.proyecto_nombre,
      estado: r.proyecto_estado,
      dg: r.dg_siglas,
      meta,
      avance: valor,
      capturado_por: r.capturado_por,
      actualizado_en: r.actualizado_en,
      fecha_corte: fechaCortePorIndicador[r.indicador_id] || null,
      historico: historicoPorIndicador[r.indicador_id] || [],
    });
  }

  const datos = [...porClave.values()].map(e => ({
    ...e,
    porcentaje: calcularAvancePorcentaje(e.avance_total, e.meta_total),
  }));

  return { generado_en: new Date().toISOString(), total: datos.length, datos };
}

function leerHistoricoLimite(query) {
  const pedido = parseInt(query.historico_limite, 10);
  if (!Number.isFinite(pedido) || pedido <= 0) return HISTORICO_LIMITE_DEFAULT;
  return Math.min(pedido, HISTORICO_LIMITE_MAXIMO);
}

// GET /publico/indicadores — autenticado con token (requiereApiToken).
async function indicadores(req, res, next) {
  try {
    const soloClave = req.query.clave || null;
    const historicoLimite = leerHistoricoLimite(req.query);
    res.json(await obtenerDatosIndicadores(soloClave, historicoLimite));
  } catch (err) { next(err); }
}

// GET /admin/api-tokens/probar — Administración > API, autenticado con
// la SESIÓN del superadmin (requiereRol, ver admin.routes.js), nunca
// con un token real: el token solo se guarda hasheado, ni este panel
// puede recuperarlo. Corre exactamente la misma consulta que la ruta
// pública — lo que se ve aquí es la respuesta real, no una simulación.
async function probar(req, res, next) {
  try {
    const soloClave = req.query.clave || null;
    const historicoLimite = leerHistoricoLimite(req.query);
    res.json(await obtenerDatosIndicadores(soloClave, historicoLimite));
  } catch (err) { next(err); }
}

module.exports = { indicadores, probar };
