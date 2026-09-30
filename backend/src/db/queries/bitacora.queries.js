/**
 * ARCHIVO: bitacora.queries.js
 * PROPÓSITO: Bitácora unificada de TODO lo que pasa en un proyecto — a
 *            diferencia de ActividadStream (por nodo) o "Actividad
 *            reciente" (un widget chico de 50 filas), esta es la vista
 *            completa, paginada y filtrable del proyecto entero.
 *
 * MINI-CLASE: por qué se combinan 5 fuentes sin duplicar nada
 * ─────────────────────────────────────────────────────────────────
 * PSPP tiene dos sistemas de bitácora en paralelo, cada uno completo
 * para lo que cubre pero no para todo:
 *   - `actividad` (migración 039) + los 3 modelos viejos (`comentarios`,
 *     `evidencias`, `riesgos`, con entidad_tipo/entidad_id o columnas
 *     id_etapa/id_accion/id_subaccion) — cubren comentario/archivo/
 *     riesgo/avance/estatus de CUALQUIER nodo. Un riesgo/comentario/
 *     archivo de Etapa-Acción-Subacción vive en el modelo viejo; el de
 *     una Tarea (que nunca tuvo esas columnas) vive en `actividad`.
 *     Avance/estatus/estatus-cualitativo (cualquier nivel) también
 *     viven en `actividad` (`registrarAvance`).
 *   - `actividad_log` (migración 031) — el registro de eventos que NO
 *     tienen fila propia en ningún modelo de nodo: miembro agregado,
 *     cambios vía PUT /estado (genérico, distinto del de "Registrar
 *     avance"), e indicadores/aportaciones. También registra comentario/
 *     evidencia con un resumen de una línea — pero ESO ya está cubierto
 *     por las tablas de arriba, así que aquí se excluye a propósito
 *     (`tipo IN ('estado','miembro','indicador')`) para no mostrar el
 *     mismo comentario dos veces.
 * ─────────────────────────────────────────────────────────────────
 */
const pool = require('../pool');

const CAMPOS_COMUNES = `id, categoria, titulo, contenido, autor_id, autor_nombre, created_at,
  nodo_tipo, nodo_id, nodo_nombre, metadata`;

async function obtenerEtapaAccionIds(proyectoId) {
  const [{ rows: etapas }, { rows: acciones }] = await Promise.all([
    pool.query('SELECT id FROM etapas WHERE id_proyecto = $1', [proyectoId]),
    pool.query('SELECT id FROM acciones WHERE id_proyecto = $1', [proyectoId]),
  ]);
  return { etapaIds: etapas.map(e => e.id), accionIds: acciones.map(a => a.id) };
}

async function obtenerBitacoraProyecto(proyectoId, opciones = {}) {
  const { categoria, usuarioId, desde, hasta, busqueda, pagina = 1, limite = 30 } = opciones;
  const { etapaIds, accionIds } = await obtenerEtapaAccionIds(proyectoId);

  const union = `
    WITH todo AS (
      -- 1. Tabla nueva "actividad" (cubre TODOS los niveles para
      -- avance/estatus; solo Tareas para comentario/archivo/riesgo)
      SELECT
        ac.id,
        CASE ac.tipo_evento
          WHEN 'cambio_avance' THEN 'avance'
          WHEN 'cambio_estatus' THEN 'avance'
          WHEN 'estatus_cualitativo' THEN 'avance'
          ELSE ac.tipo_evento
        END AS categoria,
        CASE ac.tipo_evento
          WHEN 'cambio_avance' THEN 'Avance actualizado'
          WHEN 'cambio_estatus' THEN 'Estatus actualizado'
          WHEN 'estatus_cualitativo' THEN 'Estatus cualitativo'
          WHEN 'comentario' THEN 'Comentario'
          WHEN 'archivo' THEN 'Archivo adjuntado'
          WHEN 'riesgo' THEN 'Riesgo reportado'
          ELSE ac.tipo_evento
        END AS titulo,
        ac.contenido,
        ac.id_usuario AS autor_id,
        u.nombre_completo AS autor_nombre,
        ac.created_at,
        CASE WHEN ac.id_tarea IS NOT NULL THEN 'tarea'
             WHEN ac.id_accion IS NOT NULL THEN 'accion'
             WHEN ac.id_etapa IS NOT NULL THEN 'etapa' END AS nodo_tipo,
        COALESCE(ac.id_tarea, ac.id_accion, ac.id_etapa) AS nodo_id,
        COALESCE(t.nombre, a.nombre, e.nombre) AS nodo_nombre,
        ac.metadata
      FROM actividad ac
      LEFT JOIN usuarios u ON u.id = ac.id_usuario
      LEFT JOIN etapas e ON e.id = ac.id_etapa
      LEFT JOIN acciones a ON a.id = ac.id_accion
      LEFT JOIN tareas t ON t.id = ac.id_tarea
      WHERE ac.id_proyecto = $1

      UNION ALL

      -- 2. Comentarios (modelo viejo — Etapa/Accion/Subaccion/Proyecto)
      SELECT
        c.id, 'comentario' AS categoria, 'Comentario' AS titulo, c.contenido,
        c.id_autor AS autor_id, u.nombre_completo AS autor_nombre, c.created_at,
        CASE c.entidad_tipo WHEN 'Etapa' THEN 'etapa' WHEN 'Proyecto' THEN 'proyecto' ELSE 'accion' END AS nodo_tipo,
        c.entidad_id AS nodo_id,
        CASE WHEN c.entidad_tipo = 'Proyecto' THEN NULL ELSE COALESCE(et.nombre, ac2.nombre) END AS nodo_nombre,
        '{}'::jsonb AS metadata
      FROM comentarios c
      LEFT JOIN usuarios u ON u.id = c.id_autor
      LEFT JOIN etapas et ON c.entidad_tipo = 'Etapa' AND et.id = c.entidad_id
      LEFT JOIN acciones ac2 ON c.entidad_tipo IN ('Accion','Subaccion') AND ac2.id = c.entidad_id
      WHERE (c.entidad_tipo = 'Etapa' AND c.entidad_id = ANY($2))
         OR (c.entidad_tipo IN ('Accion','Subaccion') AND c.entidad_id = ANY($3))
         OR (c.entidad_tipo = 'Proyecto' AND c.entidad_id = $1)

      UNION ALL

      -- 3. Evidencias (modelo viejo — columnas directas, sin entidad_tipo)
      SELECT
        ev.id, 'archivo' AS categoria, 'Documento adjuntado' AS titulo,
        COALESCE(ev.titulo, ev.nombre_original) AS contenido,
        ev.id_autor AS autor_id, u.nombre_completo AS autor_nombre, ev.created_at,
        CASE WHEN ev.id_subaccion IS NOT NULL THEN 'accion'
             WHEN ev.id_accion IS NOT NULL THEN 'accion'
             WHEN ev.id_etapa IS NOT NULL THEN 'etapa' END AS nodo_tipo,
        COALESCE(ev.id_subaccion, ev.id_accion, ev.id_etapa) AS nodo_id,
        COALESCE(asub.nombre, aacc.nombre, eet.nombre) AS nodo_nombre,
        jsonb_build_object('categoria', ev.categoria, 'evidencia_id', ev.id) AS metadata
      FROM evidencias ev
      LEFT JOIN usuarios u ON u.id = ev.id_autor
      LEFT JOIN etapas eet ON eet.id = ev.id_etapa
      LEFT JOIN acciones aacc ON aacc.id = ev.id_accion
      LEFT JOIN acciones asub ON asub.id = ev.id_subaccion
      WHERE ev.id_etapa = ANY($2) OR ev.id_accion = ANY($3) OR ev.id_subaccion = ANY($3)

      UNION ALL

      -- 4. Riesgos (modelo viejo — Etapa/Accion/Subaccion/Proyecto; los de
      -- Tarea viven en "actividad", ya cubiertos arriba)
      SELECT
        r.id, 'riesgo' AS categoria,
        CASE WHEN r.tipo = 'Problema' THEN 'Problema reportado' ELSE 'Riesgo reportado' END AS titulo,
        r.titulo AS contenido,
        r.id_reportador AS autor_id, u.nombre_completo AS autor_nombre, r.created_at,
        CASE r.entidad_tipo WHEN 'Etapa' THEN 'etapa' WHEN 'Proyecto' THEN 'proyecto' ELSE 'accion' END AS nodo_tipo,
        r.entidad_id AS nodo_id,
        CASE WHEN r.entidad_tipo = 'Proyecto' THEN NULL ELSE COALESCE(ret.nombre, rac.nombre) END AS nodo_nombre,
        jsonb_build_object('nivel', r.nivel, 'estado', r.estado, 'riesgo_id', r.id) AS metadata
      FROM riesgos r
      LEFT JOIN usuarios u ON u.id = r.id_reportador
      LEFT JOIN etapas ret ON r.entidad_tipo = 'Etapa' AND ret.id = r.entidad_id
      LEFT JOIN acciones rac ON r.entidad_tipo IN ('Accion','Subaccion') AND rac.id = r.entidad_id
      WHERE (r.entidad_tipo = 'Etapa' AND r.entidad_id = ANY($2))
         OR (r.entidad_tipo IN ('Accion','Subaccion') AND r.entidad_id = ANY($3))
         OR (r.entidad_tipo = 'Proyecto' AND r.entidad_id = $1)

      UNION ALL

      -- 5. actividad_log — solo lo que NO tiene fila propia en ningún
      -- modelo de nodo (miembro/indicador/estado vía PUT /estado). Se
      -- excluye a propósito 'comentario'/'evidencia': esos ya se leen
      -- de sus tablas reales arriba, incluirlos también aquí los
      -- duplicaría (mismo evento, dos filas).
      SELECT
        al.id, al.tipo AS categoria, al.titulo, al.descripcion AS contenido,
        al.id_usuario AS autor_id, u.nombre_completo AS autor_nombre, al.created_at,
        CASE al.entidad_tipo
          WHEN 'Etapa' THEN 'etapa' WHEN 'Accion' THEN 'accion' WHEN 'Subaccion' THEN 'accion'
          WHEN 'Tarea' THEN 'tarea' WHEN 'Indicador' THEN 'indicador' ELSE NULL
        END AS nodo_tipo,
        al.entidad_id AS nodo_id,
        COALESCE(let.nombre, lac.nombre, lta.nombre, lind.nombre) AS nodo_nombre,
        al.metadata
      FROM actividad_log al
      LEFT JOIN usuarios u ON u.id = al.id_usuario
      LEFT JOIN etapas let ON al.entidad_tipo = 'Etapa' AND let.id = al.entidad_id
      LEFT JOIN acciones lac ON al.entidad_tipo IN ('Accion','Subaccion') AND lac.id = al.entidad_id
      LEFT JOIN tareas lta ON al.entidad_tipo = 'Tarea' AND lta.id = al.entidad_id
      LEFT JOIN indicadores lind ON al.entidad_tipo = 'Indicador' AND lind.id = al.entidad_id
      WHERE al.id_proyecto = $1 AND al.tipo IN ('estado', 'miembro', 'indicador')
    )
  `;

  const condiciones = [];
  const valores = [proyectoId, etapaIds, accionIds];
  let idx = valores.length;

  if (categoria) { idx++; condiciones.push(`categoria = $${idx}`); valores.push(categoria); }
  if (usuarioId) { idx++; condiciones.push(`autor_id = $${idx}`); valores.push(usuarioId); }
  if (desde) { idx++; condiciones.push(`created_at >= $${idx}`); valores.push(desde); }
  if (hasta) { idx++; condiciones.push(`created_at < $${idx}::date + interval '1 day'`); valores.push(hasta); }
  if (busqueda) {
    idx++;
    condiciones.push(`(titulo ILIKE $${idx} OR contenido ILIKE $${idx} OR nodo_nombre ILIKE $${idx} OR autor_nombre ILIKE $${idx})`);
    valores.push(`%${busqueda}%`);
  }
  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

  const offset = (pagina - 1) * limite;
  const paramLimite = valores.length + 1;
  const paramOffset = valores.length + 2;

  const { rows } = await pool.query(`
    ${union}
    SELECT ${CAMPOS_COMUNES} FROM todo
    ${where}
    ORDER BY created_at DESC
    LIMIT $${paramLimite} OFFSET $${paramOffset}
  `, [...valores, limite, offset]);

  const { rows: [{ total }] } = await pool.query(`
    ${union}
    SELECT COUNT(*)::int AS total FROM todo
    ${where}
  `, valores);

  return { datos: rows, total };
}

module.exports = { obtenerBitacoraProyecto };
