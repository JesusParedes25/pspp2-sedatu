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
async function listarProyectos({ estado, tipo, idDg, busqueda, carteraId, sinCartera, participacion, usuarioId, pagina = 1, limite = 12 }) {
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
  if (carteraId) {
    condiciones.push(`EXISTS (
      SELECT 1 FROM cartera_proyecto cp2 WHERE cp2.proyecto_id = p.id AND cp2.cartera_id = $${indice}
    )`);
    parametros.push(carteraId);
    indice++;
  }
  if (sinCartera) {
    condiciones.push(`NOT EXISTS (
      SELECT 1 FROM cartera_proyecto cp3 WHERE cp3.proyecto_id = p.id
    )`);
  }
  // Filtro "¿dónde participo?". La visibilidad NO cambia — todos siguen
  // pudiendo ver todos los proyectos; esto solo acota el listado para que
  // cada quien encuentre lo suyo entre decenas. Participar es ser creador,
  // estar en proyecto_usuarios, o tener una asignación explícita en una
  // etapa/acción/tarea puntual (nodo_miembros aceptado, o ser directamente
  // su id_responsable) — mismo criterio que obtenerProyectosUsuario en
  // miembros.queries.js (que alimenta Tablero/Mapa/Evidencias): sin esto,
  // a quien solo se invitaba a una parte del proyecto tampoco le aparecía
  // aquí bajo "Donde participo". El permiso que da el cargo (ejecutivo,
  // director de la DG) no cuenta como participación.
  if (usuarioId && (participacion === 'participo' || participacion === 'responsable')) {
    const soloResponsable = participacion === 'responsable';
    const rolProyecto = soloResponsable ? `AND pu_f.rol = 'responsable'` : '';
    const rolNodo = soloResponsable ? `AND nm_f.rol = 'responsable'` : '';
    condiciones.push(`(
      p.id_creador = $${indice}
      OR EXISTS (
        SELECT 1 FROM proyecto_usuarios pu_f
         WHERE pu_f.id_proyecto = p.id AND pu_f.id_usuario = $${indice} ${rolProyecto}
      )
      OR EXISTS (
        SELECT 1 FROM etapas e_f WHERE e_f.id_proyecto = p.id AND (
          e_f.id_responsable = $${indice}
          OR EXISTS (
            SELECT 1 FROM nodo_miembros nm_f
             WHERE nm_f.tipo_nodo = 'etapa' AND nm_f.id_nodo = e_f.id AND nm_f.id_usuario = $${indice}
               AND nm_f.estado = 'aceptada' ${rolNodo}
          )
        )
      )
      OR EXISTS (
        SELECT 1 FROM acciones a_f LEFT JOIN etapas ea_f ON ea_f.id = a_f.id_etapa
         WHERE COALESCE(a_f.id_proyecto, ea_f.id_proyecto) = p.id AND (
          a_f.id_responsable = $${indice}
          OR EXISTS (
            SELECT 1 FROM nodo_miembros nm_f2
             WHERE nm_f2.tipo_nodo = 'accion' AND nm_f2.id_nodo = a_f.id AND nm_f2.id_usuario = $${indice}
               AND nm_f2.estado = 'aceptada' ${rolNodo}
          )
        )
      )
      OR EXISTS (
        SELECT 1 FROM tareas t_f
        JOIN acciones a2_f ON a2_f.id = t_f.id_accion
        LEFT JOIN etapas ea2_f ON ea2_f.id = a2_f.id_etapa
         WHERE COALESCE(a2_f.id_proyecto, ea2_f.id_proyecto) = p.id AND (
          t_f.id_responsable = $${indice}
          OR EXISTS (
            SELECT 1 FROM nodo_miembros nm_f3
             WHERE nm_f3.tipo_nodo = 'tarea' AND nm_f3.id_nodo = t_f.id AND nm_f3.id_usuario = $${indice}
               AND nm_f3.estado = 'aceptada' ${rolNodo}
          )
        )
      )
    )`);
    parametros.push(usuarioId);
    indice++;
  }

  // El usuario que consulta, para resolver su papel en cada fila. Va antes
  // de limite/offset para que su índice no dependa de la paginación.
  const indiceUsuario = indice++;
  parametros.push(usuarioId || null);

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
      cp.cartera_id,
      c.nombre AS cartera_nombre,
      (SELECT COUNT(*) FROM etapas e WHERE e.id_proyecto = p.id) AS total_etapas,
      (SELECT COUNT(*) FROM acciones a WHERE a.id_proyecto = p.id AND a.estado NOT IN ('Completada','Cancelada')) AS acciones_pendientes,
      (SELECT COUNT(*) FROM riesgos r WHERE r.entidad_tipo = 'Proyecto' AND r.entidad_id = p.id AND r.estado IN ('Abierto','En_mitigacion')) AS riesgos_activos,
      -- Papel del usuario que consulta EN ESTE proyecto ('responsable',
      -- 'colaborador' o NULL). El frontend lo combina con el rol global
      -- para etiquetar la tarjeta (ver utils/papelProyecto.js): así se ve
      -- de un vistazo qué puede hacer uno en cada proyecto, en vez de
      -- deducirlo por qué botones aparecen.
      (SELECT pu.rol FROM proyecto_usuarios pu
        WHERE pu.id_proyecto = p.id AND pu.id_usuario = $${indiceUsuario}) AS mi_rol_proyecto
    FROM proyectos p
    LEFT JOIN direcciones_generales dg ON dg.id = p.id_dg_lider
    LEFT JOIN direcciones_area da ON da.id = p.id_direccion_area_lider
    LEFT JOIN usuarios u ON u.id = p.id_creador
    LEFT JOIN programas pr ON pr.id = p.id_programa
    LEFT JOIN cartera_proyecto cp ON cp.proyecto_id = p.id AND cp.es_principal = true
    LEFT JOIN carteras c ON c.id = cp.cartera_id
    WHERE ${whereClause}
    ORDER BY p.es_prioritario DESC, p.updated_at DESC
    LIMIT $${indice++} OFFSET $${indice}
  `, parametros);

  // Conteo total para paginación
  // El conteo reusa el mismo WHERE pero sin los parámetros que solo usa
  // el SELECT (usuario para el papel) ni los de paginación.
  const conteo = await pool.query(`
    SELECT COUNT(*) AS total FROM proyectos p WHERE ${whereClause}
  `, parametros.slice(0, -3));

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
        es_prioritario, ciclo_anual, dependencia_externa, descripcion_dependencia,
        tiene_subproyectos, fecha_inicio, fecha_limite,
        id_dg_lider, id_direccion_area_lider, id_creador, id_programa,
        categoria, instrumento, escala_territorial, fase_actual,
        financiamiento, ejercicio_fiscal, instancia_solicitante, prioridad, observaciones
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
      RETURNING *
    `, [
      datos.nombre, emptyToNull(datos.descripcion), datos.tipo, emptyToNull(datos.meta_descripcion),
      datos.es_prioritario || false, datos.ciclo_anual || false,
      datos.dependencia_externa || false, emptyToNull(datos.descripcion_dependencia),
      datos.tiene_subproyectos || false, emptyToNull(datos.fecha_inicio), emptyToNull(datos.fecha_limite),
      emptyToNull(datos.id_dg_lider),
      emptyToNull(datos.id_direccion_area_lider),
      creadorId,
      emptyToNull(datos.id_programa),
      emptyToNull(datos.categoria), emptyToNull(datos.instrumento),
      emptyToNull(datos.escala_territorial), emptyToNull(datos.fase_actual),
      emptyToNull(datos.financiamiento), emptyToNull(datos.ejercicio_fiscal),
      emptyToNull(datos.instancia_solicitante), emptyToNull(datos.prioridad),
      emptyToNull(datos.observaciones)
    ]);

    const proyecto = resultado.rows[0];

    // Agregar la DG líder como participante con rol Lider
    await client.query(`
      INSERT INTO proyecto_dgs (id_proyecto, id_dg, id_direccion_area, rol_en_proyecto, id_responsable)
      VALUES ($1, $2, $3, 'Lider', $4)
    `, [proyecto.id, emptyToNull(datos.id_dg_lider), emptyToNull(datos.id_direccion_area_lider), creadorId]);

    // El creador queda como 'responsable' en proyecto_usuarios: es lo que
    // usan los checks de permisos (puedeInvitar/puedeGestionar) para decidir
    // si puede agregar a otros colaboradores. Sin esta fila, el creador no
    // podía invitar a nadie a su propio proyecto.
    await client.query(`
      INSERT INTO proyecto_usuarios (id_proyecto, id_usuario, rol, estado, aceptado_en)
      VALUES ($1, $2, 'responsable', 'aceptada', NOW())
      ON CONFLICT (id_proyecto, id_usuario) DO NOTHING
    `, [proyecto.id, creadorId]);

    // Insertar indicadores si los hay
    if (tieneIndicadores) {
      for (let i = 0; i < datos.indicadores.length; i++) {
        await indicadoresQueries.crear(
          proyecto.id,
          { ...datos.indicadores[i], orden: i + 1 },
          client,
          creadorId
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
        es_prioritario          = $5,
        ciclo_anual             = $6,
        dependencia_externa     = $7,
        descripcion_dependencia = $8,
        tiene_subproyectos      = $9,
        fecha_inicio            = $10,
        fecha_limite            = $11,
        id_dg_lider             = $12,
        id_direccion_area_lider = $13,
        id_programa             = $14,
        categoria               = $16,
        instrumento             = $17,
        escala_territorial      = $18,
        fase_actual             = $19,
        financiamiento          = $20,
        ejercicio_fiscal        = $21,
        instancia_solicitante   = $22,
        prioridad               = $23,
        observaciones           = $24,
        updated_at              = NOW()
      WHERE id = $15 AND deleted_at IS NULL
      RETURNING *
    `, [
      datos.nombre,
      n(datos.descripcion),
      n(datos.tipo),
      n(datos.meta_descripcion),
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
      n(datos.categoria), n(datos.instrumento),
      n(datos.escala_territorial), n(datos.fase_actual),
      n(datos.financiamiento), n(datos.ejercicio_fiscal),
      n(datos.instancia_solicitante), n(datos.prioridad),
      n(datos.observaciones),
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

// Papelera: proyectos eliminados dentro de la ventana de 30 días (los
// vencidos ya fueron purgados — ver utils/purgarProyectos.js).
async function obtenerProyectosEliminados() {
  const { rows } = await pool.query(`
    SELECT p.id, p.nombre, p.tipo, p.deleted_at,
      (p.deleted_at + INTERVAL '30 days')::date AS purga_programada,
      GREATEST(0, 30 - EXTRACT(DAY FROM NOW() - p.deleted_at)::int) AS dias_restantes,
      dg.siglas AS dg_lider_siglas,
      u.nombre_completo AS creador_nombre
    FROM proyectos p
    LEFT JOIN direcciones_generales dg ON dg.id = p.id_dg_lider
    LEFT JOIN usuarios u ON u.id = p.id_creador
    WHERE p.deleted_at IS NOT NULL
    ORDER BY p.deleted_at DESC
  `);
  return rows;
}

// Restaura un proyecto eliminado (solo si sigue dentro de la ventana de 30
// días — pasado ese punto ya se purgó y no hay nada que restaurar).
async function restaurarProyecto(proyectoId) {
  const { rows } = await pool.query(`
    UPDATE proyectos SET deleted_at = NULL, updated_at = NOW()
    WHERE id = $1 AND deleted_at IS NOT NULL
    RETURNING id
  `, [proyectoId]);
  return rows[0] || null;
}

// Elimina permanentemente un proyecto que ya está en la papelera (solo superadmin)
async function purgarProyecto(proyectoId) {
  const { rows } = await pool.query(
    'DELETE FROM proyectos WHERE id = $1 AND deleted_at IS NOT NULL RETURNING id, nombre',
    [proyectoId]
  );
  return rows[0] || null;
}

// Obtiene las DGs participantes de un proyecto — CALCULADO, no leído de
// una tabla curada a mano (proyecto_dgs quedó sin ninguna forma de
// llenarse desde la interfaz). Una DG "participa" si es la DG líder del
// proyecto, o si cualquier persona de esa DG es responsable o colaboradora
// de CUALQUIER parte del proyecto (el proyecto en general, o una etapa,
// acción o tarea específica) — nada de curación manual.
async function obtenerDGsProyecto(proyectoId) {
  const resultado = await pool.query(`
    WITH dgs_detectadas AS (
      SELECT p.id_dg_lider AS id_dg FROM proyectos p WHERE p.id = $1 AND p.id_dg_lider IS NOT NULL
      UNION
      SELECT e.id_dg FROM etapas e WHERE e.id_proyecto = $1 AND e.id_dg IS NOT NULL
      UNION
      SELECT a.id_dg FROM acciones a WHERE a.id_proyecto = $1 AND a.id_dg IS NOT NULL
      UNION
      SELECT u.id_dg FROM etapas e JOIN usuarios u ON u.id = e.id_responsable
        WHERE e.id_proyecto = $1 AND u.id_dg IS NOT NULL
      UNION
      SELECT u.id_dg FROM acciones a JOIN usuarios u ON u.id = a.id_responsable
        WHERE a.id_proyecto = $1 AND u.id_dg IS NOT NULL
      UNION
      SELECT u.id_dg FROM tareas t
        JOIN acciones a ON a.id = t.id_accion
        JOIN usuarios u ON u.id = t.id_responsable
        WHERE a.id_proyecto = $1 AND u.id_dg IS NOT NULL
      UNION
      SELECT u.id_dg FROM proyecto_usuarios pu JOIN usuarios u ON u.id = pu.id_usuario
        WHERE pu.id_proyecto = $1 AND u.id_dg IS NOT NULL
      UNION
      SELECT u.id_dg FROM nodo_miembros nm JOIN usuarios u ON u.id = nm.id_usuario
        WHERE u.id_dg IS NOT NULL AND (
          (nm.tipo_nodo = 'etapa' AND EXISTS (SELECT 1 FROM etapas e WHERE e.id = nm.id_nodo AND e.id_proyecto = $1))
          OR (nm.tipo_nodo = 'accion' AND EXISTS (SELECT 1 FROM acciones a WHERE a.id = nm.id_nodo AND a.id_proyecto = $1))
          OR (nm.tipo_nodo = 'tarea' AND EXISTS (
                SELECT 1 FROM tareas t JOIN acciones a ON a.id = t.id_accion
                WHERE t.id = nm.id_nodo AND a.id_proyecto = $1))
        )
    )
    SELECT
      dg.id AS id_dg,
      dg.siglas AS dg_siglas,
      dg.nombre AS dg_nombre,
      CASE WHEN dg.id = p.id_dg_lider THEN 'Lider' ELSE 'Colaboradora' END AS rol_en_proyecto
    FROM dgs_detectadas dd
    JOIN direcciones_generales dg ON dg.id = dd.id_dg
    CROSS JOIN (SELECT id_dg_lider FROM proyectos WHERE id = $1) p
    ORDER BY (dg.id = p.id_dg_lider) DESC, dg.siglas ASC
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
  obtenerProyectosEliminados,
  restaurarProyecto,
  purgarProyecto,
  obtenerDGsProyecto,
  agregarDGProyecto,
  eliminarDGProyecto,
  obtenerEtiquetas,
  actualizarImagenProyecto,
};
