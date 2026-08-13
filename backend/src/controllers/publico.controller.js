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
 * ─────────────────────────────────────────────────────────────────
 */
const pool = require('../db/pool');

// GET /publico/indicadores
// Consolidado por indicador del catálogo: la suma de metas y avances de
// todos los proyectos vivos que lo usan, más el desglose por proyecto.
async function indicadores(req, res, next) {
  try {
    const soloClave = req.query.clave || null;

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
      LEFT JOIN proyectos p   ON p.id = i.id_proyecto AND p.deleted_at IS NULL
      LEFT JOIN direcciones_generales dg ON dg.id = p.id_dg_lider
      LEFT JOIN usuarios creador ON creador.id = i.id_creador
      WHERE ($1::text IS NULL OR c.clave = $1)
      ORDER BY c.nombre, p.nombre
    `, [soloClave]);

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
      });
    }

    const datos = [...porClave.values()].map(e => ({
      ...e,
      porcentaje: e.meta_total > 0
        ? Math.round((e.avance_total / e.meta_total) * 1000) / 10
        : null,
    }));

    res.json({
      generado_en: new Date().toISOString(),
      total: datos.length,
      datos,
    });
  } catch (err) { next(err); }
}

module.exports = { indicadores };
