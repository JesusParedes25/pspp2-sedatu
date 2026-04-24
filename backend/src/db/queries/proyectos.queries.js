/**
 * ARCHIVO: proyectos.queries.js
 * PROPÓSITO: Todas las queries SQL de la tabla proyectos y proyecto_dgs.
 *
 * MINI-CLASE: Soft delete y filtrado con deleted_at
 * ─────────────────────────────────────────────────────────────────
 * En lugar de borrar proyectos con DELETE, marcamos deleted_at con
 * la fecha actual. Esto preserva el historial para auditoría.
 * Todas las queries de listado filtran con "WHERE deleted_at IS NULL"
 * para excluir los proyectos "eliminados". Si algún día se necesita
 * restaurar un proyecto, basta con poner deleted_at = NULL.
 * ─────────────────────────────────────────────────────────────────
 */
const pool = require('../pool');
const indicadoresQueries = require('./indicadores.queries');

// Lista proyectos con filtros opcionales, paginación y datos del líder
async function listarProyectos({ estado, tipo, idDg, busqueda, pagina = 1, limite = 12 }) {
  const condiciones = ['p.deleted_at IS NULL'];
  const parametros = [];
  let indice = 1;

  if (estado) {
    condiciones.push(`p.estado = $${indice++}`);
    parametros.push(estado);
  }
  if (tipo) {
    condiciones.push(`p.tipo = $${indice++}`);
    parametros.push(tipo);
  }
  if (idDg) {
    condiciones.push(`(p.id_dg_lider = $${indice} OR EXISTS (
      SELECT 1 FROM proyecto_dgs pd WHERE pd.id_proyecto = p.id AND pd.id_dg = $${indice}
    ))`);
    parametros.push(idDg);
    indice++;
  }
  if (busqueda) {
    condiciones.push(`(p.nombre ILIKE $${indice} OR p.descripcion ILIKE $${indice})`);
    parametros.push(`%${busqueda}%`);
    indice++;
  }

  const offset = (pagina - 1) * limite;
  parametros.push(limite, offset);

  const whereClause = condiciones.join(' AND ');

  const resultado = await pool.query(`
    SELECT
      p.*,
      dg.siglas AS dg_lider_siglas,
      dg.nombre AS dg_lider_nombre,
      da.siglas AS direccion_area_lider_siglas,
      u.nombre_completo AS creador_nombre,
      pr.nombre AS programa_nombre,
      pr.clave AS programa_clave,
      (SELECT COUNT(*) FROM etapas e WHERE e.id_proyecto = p.id) AS total_etapas,
      (SELECT COUNT(*) FROM acciones a WHERE a.id_proyecto = p.id AND a.estado NOT IN ('Completada','Cancelada')) AS acciones_pendientes,
      (SELECT COUNT(*) FROM riesgos r WHERE r.entidad_tipo = 'Proyecto' AND r.entidad_id = p.id AND r.estado IN ('Abierto','En_mitigacion')) AS riesgos_activos
    FROM proyectos p
    LEFT JOIN direcciones_generales dg ON dg.id = p.id_dg_lider
    LEFT JOIN direcciones_area da ON da.id = p.id_direccion_area_lider
    LEFT JOIN usuarios u ON u.id = p.id_creador
    LEFT JOIN programas pr ON pr.id = p.id_programa
    WHERE ${whereClause}
    ORDER BY p.es_prioritario DESC, p.updated_at DESC
    LIMIT $${indice++} OFFSET $${indice}
  `, parametros);

  // Conteo total para paginación
  const conteo = await pool.query(`
    SELECT COUNT(*) AS total FROM proyectos p WHERE ${whereClause}
  `, parametros.slice(0, -2));

  return {
    proyectos: resultado.rows,
    total: parseInt(conteo.rows[0].total),
    pagina,
    limite
  };
}

// Obtiene un proyecto por ID con todos sus datos relacionados
async function obtenerProyectoPorId(proyectoId) {
  const resultado = await pool.query(`
    SELECT
      p.*,
      dg.siglas AS dg_lider_siglas,
      dg.nombre AS dg_lider_nombre,
      da.siglas AS direccion_area_lider_siglas,
      da.nombre AS direccion_area_lider_nombre,
      u.nombre_completo AS creador_nombre,
      pr.nombre AS programa_nombre,
      pr.clave AS programa_clave
    FROM proyectos p
    LEFT JOIN direcciones_generales dg ON dg.id = p.id_dg_lider
    LEFT JOIN direcciones_area da ON da.id = p.id_direccion_area_lider
    LEFT JOIN usuarios u ON u.id = p.id_creador
    LEFT JOIN programas pr ON pr.id = p.id_programa
    WHERE p.id = $1 AND p.deleted_at IS NULL
  `, [proyectoId]);

  const proyecto = resultado.rows[0] || null;

  // Adjuntar indicadores del proyecto (nueva tabla)
  if (proyecto) {
    proyecto.indicadores = await indicadoresQueries.listarPorProyecto(proyectoId);
  }

  return proyecto;
}

// Crea un nuevo proyecto con indicadores y etiquetas en transacción
async function crearProyecto(datos, creadorId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const tieneIndicadores = datos.indicadores && datos.indicadores.length > 0;

    // Sanitizar: convertir "" a null para campos opcionales (UUIDs, fechas)
    const emptyToNull = (v) => (v === '' || v == null) ? null : v;

    const resultado = await client.query(`
      INSERT INTO proyectos (
        nombre, descripcion, tipo, meta_descripcion,
        tiene_indicador,
        es_prioritario, ciclo_anual, dependencia_externa, descripcion_dependencia,
        tiene_subproyectos, fecha_inicio, fecha_limite,
        id_dg_lider, id_direccion_area_lider, id_creador, id_programa
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      RETURNING *
    `, [
      datos.nombre, emptyToNull(datos.descripcion), datos.tipo, emptyToNull(datos.meta_descripcion),
      tieneIndicadores,
      datos.es_prioritario || false, datos.ciclo_anual || false,
      datos.dependencia_externa || false, emptyToNull(datos.descripcion_dependencia),
      datos.tiene_subproyectos || false, emptyToNull(datos.fecha_inicio), emptyToNull(datos.fecha_limite),
      emptyToNull(datos.id_dg_lider),
      emptyToNull(datos.id_direccion_area_lider),
      creadorId,
      emptyToNull(datos.id_programa)
    ]);

    const proyecto = resultado.rows[0];

    // Agregar la DG líder como participante con rol Lider
    await client.query(`
      INSERT INTO proyecto_dgs (id_proyecto, id_dg, id_direccion_area, rol_en_proyecto, id_responsable)
      VALUES ($1, $2, $3, 'Lider', $4)
    `, [proyecto.id, emptyToNull(datos.id_dg_lider), emptyToNull(datos.id_direccion_area_lider), creadorId]);

    // Insertar indicadores si los hay
    if (tieneIndicadores) {
      for (let i = 0; i < datos.indicadores.length; i++) {
        await indicadoresQueries.crear(
          proyecto.id,
          { ...datos.indicadores[i], orden: i + 1 },
          client
        );
      }
    }

    // Insertar etiquetas si las hay
    if (datos.etiquetas && datos.etiquetas.length > 0) {
      for (const etiqueta of datos.etiquetas) {
        await client.query(
          'INSERT INTO etiquetas (nombre, id_proyecto) VALUES ($1, $2)',
          [etiqueta, proyecto.id]
        );
      }
    }

    await client.query('COMMIT');
    return proyecto;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Actualiza un proyecto con todos sus campos e indicadores en transacción.
// El campo 'estado' ya NO se actualiza aquí — se maneja via validaciones-estado.js.
// Acepta un client externo para participar en una transacción del controller.
async function actualizarProyecto(proyectoId, datos, externalClient) {
  const n = (v) => (v === '' || v === undefined) ? null : v;
  const gestionaTransaccion = !externalClient;
  const client = externalClient || await pool.connect();
  try {
    if (gestionaTransaccion) await client.query('BEGIN');

    const tieneIndicadores = Array.isArray(datos.indicadores) && datos.indicadores.length > 0;

    const resultado = await client.query(`
      UPDATE proyectos SET
        nombre                  = COALESCE($1, nombre),
        descripcion             = $2,
        tipo                    = COALESCE($3, tipo),
        meta_descripcion        = $4,
        tiene_indicador         = $5,
        es_prioritario          = $6,
        ciclo_anual             = $7,
        dependencia_externa     = $8,
        descripcion_dependencia = $9,
        tiene_subproyectos      = $10,
        fecha_inicio            = $11,
        fecha_limite            = $12,
        id_dg_lider             = $13,
        id_direccion_area_lider = $14,
        id_programa             = $15,
        updated_at              = NOW()
      WHERE id = $16 AND deleted_at IS NULL
      RETURNING *
    `, [
      datos.nombre,
      n(datos.descripcion),
      n(datos.tipo),
      n(datos.meta_descripcion),
      tieneIndicadores,
      datos.es_prioritario ?? false,
      datos.ciclo_anual ?? false,
      datos.dependencia_externa ?? false,
      n(datos.descripcion_dependencia),
      datos.tiene_subproyectos ?? false,
      n(datos.fecha_inicio),
      n(datos.fecha_limite),
      n(datos.id_dg_lider),
      n(datos.id_direccion_area_lider),
      n(datos.id_programa),
      proyectoId,
    ]);

    const proyecto = resultado.rows[0];
    if (!proyecto) {
      if (gestionaTransaccion) await client.query('ROLLBACK');
      return null;
    }

    // Sincronizar etiquetas si se envían
    if (Array.isArray(datos.etiquetas)) {
      await client.query('DELETE FROM etiquetas WHERE id_proyecto = $1', [proyectoId]);
      for (const etiqueta of datos.etiquetas) {
        if (etiqueta?.trim()) {
          await client.query(
            'INSERT INTO etiquetas (nombre, id_proyecto) VALUES ($1, $2)',
            [etiqueta.trim(), proyectoId]
          );
        }
      }
    }

    if (gestionaTransaccion) await client.query('COMMIT');
    return proyecto;
  } catch (err) {
    if (gestionaTransaccion) await client.query('ROLLBACK');
    throw err;
  } finally {
    if (gestionaTransaccion) client.release();
  }
}

// Soft delete: marca deleted_at en lugar de borrar
async function eliminarProyecto(proyectoId) {
  const resultado = await pool.query(`
    UPDATE proyectos SET deleted_at = NOW(), updated_at = NOW()
    WHERE id = $1 AND deleted_at IS NULL
    RETURNING id
  `, [proyectoId]);

  return resultado.rows[0] || null;
}

// Obtiene las DGs participantes de un proyecto
async function obtenerDGsProyecto(proyectoId) {
  const resultado = await pool.query(`
    SELECT
      pd.*,
      dg.siglas AS dg_siglas,
      dg.nombre AS dg_nombre,
      da.siglas AS direccion_area_siglas,
      u.nombre_completo AS responsable_nombre
    FROM proyecto_dgs pd
    LEFT JOIN direcciones_generales dg ON dg.id = pd.id_dg
    LEFT JOIN direcciones_area da ON da.id = pd.id_direccion_area
    LEFT JOIN usuarios u ON u.id = pd.id_responsable
    WHERE pd.id_proyecto = $1
    ORDER BY pd.rol_en_proyecto ASC
  `, [proyectoId]);

  return resultado.rows;
}

// Agrega una DG colaboradora a un proyecto
async function agregarDGProyecto(proyectoId, datos) {
  const resultado = await pool.query(`
    INSERT INTO proyecto_dgs (id_proyecto, id_dg, id_direccion_area, rol_en_proyecto, id_responsable)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (id_proyecto, id_dg) DO NOTHING
    RETURNING *
  `, [proyectoId, datos.id_dg, datos.id_direccion_area, datos.rol_en_proyecto || 'Colaboradora', datos.id_responsable]);

  return resultado.rows[0] || null;
}

// Elimina una DG colaboradora de un proyecto
async function eliminarDGProyecto(proyectoId, dgId) {
  const resultado = await pool.query(`
    DELETE FROM proyecto_dgs
    WHERE id_proyecto = $1 AND id_dg = $2 AND rol_en_proyecto = 'Colaboradora'
    RETURNING id
  `, [proyectoId, dgId]);

  return resultado.rows[0] || null;
}

// Actualiza solo la imagen_url de un proyecto
async function actualizarImagenProyecto(proyectoId, imagenUrl) {
  const resultado = await pool.query(`
    UPDATE proyectos SET imagen_url = $1, updated_at = NOW()
    WHERE id = $2 AND deleted_at IS NULL
    RETURNING id, imagen_url
  `, [imagenUrl, proyectoId]);
  return resultado.rows[0] || null;
}

// Obtiene etiquetas de un proyecto
async function obtenerEtiquetas(proyectoId) {
  const resultado = await pool.query(
    'SELECT * FROM etiquetas WHERE id_proyecto = $1 ORDER BY nombre',
    [proyectoId]
  );
  return resultado.rows;
}

module.exports = {
  listarProyectos,
  obtenerProyectoPorId,
  crearProyecto,
  actualizarProyecto,
  eliminarProyecto,
  obtenerDGsProyecto,
  agregarDGProyecto,
  eliminarDGProyecto,
  obtenerEtiquetas,
  actualizarImagenProyecto,
};
