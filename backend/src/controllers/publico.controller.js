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

// Notas de mantenimiento interno que algún seeder/panel deja escritas en
// un campo de texto libre del catálogo (hoy solo `definicion`, ver
// backend/src/db/seeders/00_catalogo_indicadores_v1_sedatu.js) y que no
// deben salir en una API pensada para un consumidor externo. No se tocan
// en la base, solo se ocultan al armar esta respuesta.
const PREFIJO_NOTA_INTERNA = '⚠';
function quitarNotaInterna(texto) {
  if (!texto || !texto.trim().startsWith(PREFIJO_NOTA_INTERNA)) return texto;
  return null;
}

// Núcleo de la respuesta — lo comparten la ruta pública (autenticada con
// token, GET /publico/indicadores) y el probador de Administración > API
// (autenticado con la sesión del superadmin, nunca con el token: el
// token solo se guarda hasheado, así que el panel no podría usarlo ni
// si quisiera). Las dos rutas corren exactamente este mismo código —
// lo que el probador muestra es la respuesta real, no una simulación.
//
// `soloClave`: pedir un solo indicador por su clave estable — siempre
// se devuelve, tenga o no proyectos, esté activo o no en el catálogo:
// es una consulta puntual y deliberada de un consumidor que ya sabe qué
// busca, no el barrido general que `incluirTodos` controla.
// `incluirTodos`: sin esto, el barrido general (sin `soloClave`) se
// acota a indicadores con al menos un proyecto que los mida — de los
// ~1400 del catálogo institucional, la enorme mayoría nunca se vinculó
// a un proyecto y es ruido puro para quien consume la API. Con
// `incluirTodos`, se devuelve también lo que ningún proyecto mide.
//
// Deliberadamente NO se filtra por `activo` del catálogo: un indicador
// puede desactivarse en el catálogo (ya no se ofrece para proyectos
// nuevos) sin que el proyecto que ya lo capturaba deje de hacerlo —
// ocultarlo aquí haría desaparecer, sin aviso, un número que el
// tablero externo ya venía graficando. `activo` viaja en la respuesta
// para que el consumidor decida, como ya documentaba api-indicadores.md.
async function obtenerDatosIndicadores(soloClave, historicoLimite, incluirTodos = false) {
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
        definicion: quitarNotaInterna(r.definicion),
        fuente: quitarNotaInterna(r.fuente),
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

  let datos = [...porClave.values()].map(e => ({
    ...e,
    porcentaje: calcularAvancePorcentaje(e.avance_total, e.meta_total),
  }));

  // Una consulta puntual por `clave` siempre devuelve su indicador,
  // tenga o no proyectos; el barrido general lo oculta por omisión
  // salvo que se pida `incluirTodos` (ver nota de la función, arriba).
  if (!soloClave && !incluirTodos) {
    datos = datos.filter(e => e.proyectos.length > 0);
  }

  return { generado_en: new Date().toISOString(), total: datos.length, datos };
}

function leerHistoricoLimite(query) {
  const pedido = parseInt(query.historico_limite, 10);
  if (!Number.isFinite(pedido) || pedido <= 0) return HISTORICO_LIMITE_DEFAULT;
  return Math.min(pedido, HISTORICO_LIMITE_MAXIMO);
}

function leerIncluirTodos(query) {
  return query.todos === '1' || query.todos === 'true';
}

// GET /publico/indicadores — autenticado con token (requiereApiToken).
async function indicadores(req, res, next) {
  try {
    const soloClave = req.query.clave || null;
    const historicoLimite = leerHistoricoLimite(req.query);
    const incluirTodos = leerIncluirTodos(req.query);
    res.json(await obtenerDatosIndicadores(soloClave, historicoLimite, incluirTodos));
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
    const incluirTodos = leerIncluirTodos(req.query);
    res.json(await obtenerDatosIndicadores(soloClave, historicoLimite, incluirTodos));
  } catch (err) { next(err); }
}

module.exports = { indicadores, probar };
