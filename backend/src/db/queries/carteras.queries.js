/**
 * ARCHIVO: carteras.queries.js
 * PROPÓSITO: Consultas SQL para carteras de proyectos y su tabla puente
 *            cartera_proyecto.
 *
 * Una cartera NO es una carpeta: no mueve proyectos, no hereda permisos
 * (cualquier usuario autenticado ve cualquier proyecto igual que hoy en
 * /proyectos — ver CLAUDE.md), no se anida. Un proyecto puede estar en
 * varias carteras; "es_principal" marca cuál cuenta para los agregados
 * (para no sumarlo dos veces si aparece en más de una).
 */
const pool = require('../pool');

async function listarCarteras({ busqueda } = {}) {
  const condiciones = [];
  const parametros = [];
  let i = 1;
  if (busqueda) {
    condiciones.push(`c.nombre ILIKE $${i++}`);
    parametros.push(`%${busqueda}%`);
  }
  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

  const { rows } = await pool.query(`
    SELECT c.*,
      dg.siglas AS dg_lider_siglas, dg.nombre AS dg_lider_nombre,
      u.nombre_completo AS responsable_nombre,
      (SELECT COUNT(*) FROM cartera_proyecto cp WHERE cp.cartera_id = c.id) AS total_proyectos,
      (
        SELECT COUNT(DISTINCT p.id) FROM cartera_proyecto cp
        JOIN proyectos p ON p.id = cp.proyecto_id AND p.deleted_at IS NULL
        LEFT JOIN riesgos r ON r.entidad_tipo = 'Proyecto' AND r.entidad_id = p.id AND r.estado IN ('Abierto','En_mitigacion')
        WHERE cp.cartera_id = c.id
          AND (
            (p.estado NOT IN ('Concluido','Cancelado') AND p.fecha_limite IS NOT NULL AND p.fecha_limite < CURRENT_DATE)
            OR r.id IS NOT NULL
          )
      ) AS proyectos_en_riesgo
    FROM carteras c
    LEFT JOIN direcciones_generales dg ON dg.id = c.id_dg_lider
    LEFT JOIN usuarios u ON u.id = c.id_responsable
    ${where}
    ORDER BY c.nombre
  `, parametros);
  return rows;
}

async function obtenerCarteraPorId(id) {
  const { rows } = await pool.query(`
    SELECT c.*,
      dg.siglas AS dg_lider_siglas, dg.nombre AS dg_lider_nombre,
      u.nombre_completo AS responsable_nombre,
      cr.nombre_completo AS creador_nombre
    FROM carteras c
    LEFT JOIN direcciones_generales dg ON dg.id = c.id_dg_lider
    LEFT JOIN usuarios u ON u.id = c.id_responsable
    LEFT JOIN usuarios cr ON cr.id = c.id_creador
    WHERE c.id = $1
  `, [id]);
  return rows[0] || null;
}

async function crearCartera(datos, creadorId) {
  const n = (v) => (v === '' || v === undefined) ? null : v;
  const { rows } = await pool.query(`
    INSERT INTO carteras (nombre, descripcion, id_dg_lider, id_responsable, fecha_inicio, fecha_fin, id_creador)
    VALUES ($1,$2,$3,$4,$5,$6,$7)
    RETURNING *
  `, [datos.nombre, n(datos.descripcion), n(datos.id_dg_lider), n(datos.id_responsable), n(datos.fecha_inicio), n(datos.fecha_fin), creadorId]);
  return rows[0];
}

async function actualizarCartera(id, datos) {
  const n = (v) => (v === '' || v === undefined) ? null : v;
  const { rows } = await pool.query(`
    UPDATE carteras SET
      nombre = COALESCE($1, nombre),
      descripcion = $2,
      id_dg_lider = $3,
      id_responsable = $4,
      fecha_inicio = $5,
      fecha_fin = $6,
      updated_at = NOW()
    WHERE id = $7
    RETURNING *
  `, [datos.nombre, n(datos.descripcion), n(datos.id_dg_lider), n(datos.id_responsable), n(datos.fecha_inicio), n(datos.fecha_fin), id]);
  return rows[0] || null;
}

// Eliminar una cartera NUNCA elimina proyectos — solo deshace las
// asociaciones (ON DELETE CASCADE en cartera_proyecto se encarga).
async function eliminarCartera(id) {
  const { rows } = await pool.query('DELETE FROM carteras WHERE id = $1 RETURNING id, nombre', [id]);
  return rows[0] || null;
}

// Cuántos proyectos quedarían sin cartera principal si se borra esta
// cartera — para el mensaje de confirmación antes de eliminar.
async function contarPrincipalesQueQuedanSinCartera(carteraId) {
  const { rows } = await pool.query(`
    SELECT COUNT(*)::int AS total FROM cartera_proyecto
    WHERE cartera_id = $1 AND es_principal = true
  `, [carteraId]);
  return rows[0].total;
}

async function listarProyectosDeCartera(carteraId) {
  const { rows } = await pool.query(`
    SELECT p.id, p.nombre, p.estado, p.porcentaje_calculado, p.fecha_limite, p.id_creador,
      cp.es_principal,
      dg.siglas AS dg_siglas,
      u.nombre_completo AS creador_nombre,
      (SELECT COUNT(*) FROM riesgos r WHERE r.entidad_tipo = 'Proyecto' AND r.entidad_id = p.id AND r.estado IN ('Abierto','En_mitigacion')) AS riesgos_abiertos,
      (p.fecha_limite IS NOT NULL AND p.fecha_limite < CURRENT_DATE AND p.estado NOT IN ('Concluido','Cancelado')) AS vencido
    FROM cartera_proyecto cp
    JOIN proyectos p ON p.id = cp.proyecto_id AND p.deleted_at IS NULL
    LEFT JOIN direcciones_generales dg ON dg.id = p.id_dg_lider
    LEFT JOIN usuarios u ON u.id = p.id_creador
    WHERE cp.cartera_id = $1
    ORDER BY cp.es_principal DESC, p.nombre
  `, [carteraId]);
  return rows;
}

// Resumen agregado para la pestaña "Resumen" del tablero: distribución
// por estado (nunca un % único, ver CLAUDE.md / decisión de producto),
// riesgos, y próximos vencimientos.
async function resumenCartera(carteraId) {
  const { rows: proyectos } = await pool.query(`
    SELECT p.id, p.nombre, p.estado, p.fecha_limite, dg.siglas AS dg_siglas,
      (p.fecha_limite IS NOT NULL AND p.fecha_limite < CURRENT_DATE AND p.estado NOT IN ('Concluido','Cancelado')) AS vencido
    FROM cartera_proyecto cp
    JOIN proyectos p ON p.id = cp.proyecto_id AND p.deleted_at IS NULL
    LEFT JOIN direcciones_generales dg ON dg.id = p.id_dg_lider
    WHERE cp.cartera_id = $1
  `, [carteraId]);

  const distribucion = { concluido: 0, en_proceso: 0, vencido: 0, pausado: 0, sin_iniciar: 0 };
  for (const p of proyectos) {
    if (p.estado === 'Concluido') distribucion.concluido++;
    else if (p.estado === 'Cancelado') { /* no cuenta en la distribución visible */ }
    else if (p.vencido) distribucion.vencido++;
    else if (p.estado === 'En_proceso') distribucion.en_proceso++;
    else if (p.estado === 'Pausado') distribucion.pausado++;
    else distribucion.sin_iniciar++;
  }

  const { rows: riesgos } = await pool.query(`
    SELECT r.id, r.titulo, r.nivel, r.descripcion, r.tipo, p.id AS id_proyecto, p.nombre AS proyecto_nombre,
      dg.siglas AS dg_siglas, u.nombre_completo AS responsable_nombre
    FROM cartera_proyecto cp
    JOIN proyectos p ON p.id = cp.proyecto_id AND p.deleted_at IS NULL
    JOIN riesgos r ON r.entidad_tipo = 'Proyecto' AND r.entidad_id = p.id AND r.estado IN ('Abierto','En_mitigacion')
    LEFT JOIN direcciones_generales dg ON dg.id = p.id_dg_lider
    LEFT JOIN usuarios u ON u.id = r.id_responsable
    WHERE cp.cartera_id = $1
    ORDER BY r.created_at DESC
  `, [carteraId]);

  const { rows: porVencer } = await pool.query(`
    SELECT p.id, p.nombre, p.fecha_limite
    FROM cartera_proyecto cp
    JOIN proyectos p ON p.id = cp.proyecto_id AND p.deleted_at IS NULL
    WHERE cp.cartera_id = $1
      AND p.estado NOT IN ('Concluido','Cancelado')
      AND p.fecha_limite BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
    ORDER BY p.fecha_limite
  `, [carteraId]);

  const MS_DIA = 86400000;
  const hoy = Date.now();
  const vencidos = proyectos
    .filter(p => p.vencido)
    .map(p => ({
      id: p.id, nombre: p.nombre, fecha_limite: p.fecha_limite, dg_siglas: p.dg_siglas,
      dias_vencido: Math.floor((hoy - new Date(p.fecha_limite).getTime()) / MS_DIA),
    }))
    .sort((a, b) => b.dias_vencido - a.dias_vencido);

  const porVencerConDias = porVencer.map(p => ({
    ...p,
    dias_restantes: Math.ceil((new Date(p.fecha_limite).getTime() - hoy) / MS_DIA),
  }));

  return {
    total_proyectos: proyectos.length,
    distribucion,
    proyectos_en_riesgo: new Set([
      ...vencidos.map(p => p.id),
      ...riesgos.map(r => r.id_proyecto),
    ]).size,
    riesgos,
    vencidos,
    por_vencer: porVencerConDias,
  };
}

// Agrega uno o varios proyectos a una cartera. Si esPrincipal=true y el
// proyecto ya tenía otra cartera principal, se le quita esa marca antes
// (un proyecto solo puede tener una principal — lo garantiza además el
// índice único parcial a nivel de base de datos).
async function agregarProyectos(carteraId, proyectoIds, { esPrincipal = false, agregadoPor } = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const agregados = [];
    for (const proyectoId of proyectoIds) {
      if (esPrincipal) {
        await client.query(
          'UPDATE cartera_proyecto SET es_principal = false WHERE proyecto_id = $1 AND es_principal = true',
          [proyectoId]
        );
      }
      const { rows } = await client.query(`
        INSERT INTO cartera_proyecto (cartera_id, proyecto_id, es_principal, agregado_por)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (cartera_id, proyecto_id) DO UPDATE SET es_principal = EXCLUDED.es_principal
        RETURNING *
      `, [carteraId, proyectoId, esPrincipal, agregadoPor || null]);
      agregados.push(rows[0]);
    }
    await client.query('COMMIT');
    return agregados;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function quitarProyecto(carteraId, proyectoId) {
  const { rows } = await pool.query(
    'DELETE FROM cartera_proyecto WHERE cartera_id = $1 AND proyecto_id = $2 RETURNING id',
    [carteraId, proyectoId]
  );
  return rows[0] || null;
}

// Cartera(s) de un proyecto — usado por el listado de "Todos los
// proyectos" para mostrar a qué cartera pertenece cada uno (solo la
// principal, que es la relevante para no confundir).
async function obtenerCarteraPrincipalDeProyectos(proyectoIds) {
  if (!proyectoIds.length) return {};
  const { rows } = await pool.query(`
    SELECT cp.proyecto_id, c.id AS cartera_id, c.nombre AS cartera_nombre
    FROM cartera_proyecto cp
    JOIN carteras c ON c.id = cp.cartera_id
    WHERE cp.proyecto_id = ANY($1) AND cp.es_principal = true
  `, [proyectoIds]);
  const mapa = {};
  for (const r of rows) mapa[r.proyecto_id] = { id: r.cartera_id, nombre: r.cartera_nombre };
  return mapa;
}

module.exports = {
  listarCarteras,
  obtenerCarteraPorId,
  crearCartera,
  actualizarCartera,
  eliminarCartera,
  contarPrincipalesQueQuedanSinCartera,
  listarProyectosDeCartera,
  resumenCartera,
  agregarProyectos,
  quitarProyecto,
  obtenerCarteraPrincipalDeProyectos,
};
