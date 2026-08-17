/**
 * ARCHIVO: permisos.queries.js
 * PROPÓSITO: Responder, para un proyecto y un usuario, en qué nodos
 *            concretos puede capturar — para que la interfaz muestre
 *            editable exactamente lo que el servidor va a aceptar.
 *
 * MINI-CLASE: por qué esto tiene que existir
 * ─────────────────────────────────────────────────────────────────
 * Desde que se puede invitar a alguien a una etapa suelta (y no al
 * proyecto entero), "¿puede editar?" dejó de tener una sola respuesta
 * por proyecto: depende del nodo. La interfaz no puede adivinarlo —no
 * conoce nodo_miembros— así que preguntaba a usePermisos, que solo sabe
 * de perfiles y DGs, y terminaba mostrando campos editables que el
 * servidor rechazaba (o al revés, escondiendo los que sí podía tocar).
 *
 * Este módulo devuelve la lista YA EXPANDIDA hacia abajo: si te
 * asignaron una etapa, en la lista vienen también sus acciones y tareas.
 * Así el frontend solo pregunta "¿está este id en la lista?" y no tiene
 * que reimplementar la herencia, que es justo donde las dos capas se
 * desincronizan.
 * ─────────────────────────────────────────────────────────────────
 */
const pool = require('../pool');

// Nodos del proyecto en los que el usuario está asignado, expandidos a
// sus descendientes. Devuelve { etapa: [...ids], accion: [...], tarea: [...] }.
async function nodosEditablesUsuario(proyectoId, usuarioId, db) {
  const conn = db || pool;
  const vacio = { etapa: [], accion: [], tarea: [] };
  if (!proyectoId || !usuarioId) return vacio;

  // Estructura del proyecto: quién cuelga de quién.
  const { rows: etapas } = await conn.query(
    'SELECT id, id_responsable FROM etapas WHERE id_proyecto = $1', [proyectoId]
  );
  const idsEtapas = etapas.map(e => e.id);

  const { rows: acciones } = await conn.query(`
    SELECT a.id, a.id_etapa, a.id_accion_padre, a.id_responsable
    FROM acciones a
    WHERE a.id_proyecto = $1 OR a.id_etapa = ANY($2::uuid[])
  `, [proyectoId, idsEtapas]);
  const idsAcciones = acciones.map(a => a.id);

  const { rows: tareas } = await conn.query(
    'SELECT id, id_accion, id_responsable FROM tareas WHERE id_accion = ANY($1::uuid[])',
    [idsAcciones]
  );

  // Asignaciones explícitas: nodo_miembros aceptados + la columna id_responsable.
  const { rows: miembros } = await conn.query(`
    SELECT tipo_nodo, id_nodo FROM nodo_miembros
    WHERE id_usuario = $1 AND estado = 'aceptada'
      AND (
        (tipo_nodo = 'etapa'  AND id_nodo = ANY($2::uuid[])) OR
        (tipo_nodo = 'accion' AND id_nodo = ANY($3::uuid[])) OR
        (tipo_nodo = 'tarea'  AND id_nodo = ANY($4::uuid[]))
      )
  `, [usuarioId, idsEtapas, idsAcciones, tareas.map(t => t.id)]);

  const asignadas = { etapa: new Set(), accion: new Set(), tarea: new Set() };
  for (const m of miembros) asignadas[m.tipo_nodo]?.add(m.id_nodo);
  for (const e of etapas) if (e.id_responsable === usuarioId) asignadas.etapa.add(e.id);
  for (const a of acciones) if (a.id_responsable === usuarioId) asignadas.accion.add(a.id);
  for (const t of tareas) if (t.id_responsable === usuarioId) asignadas.tarea.add(t.id);

  if (!asignadas.etapa.size && !asignadas.accion.size && !asignadas.tarea.size) return vacio;

  // Herencia hacia abajo. Las subacciones pueden anidarse, así que se
  // recorre la lista de acciones hasta que deje de crecer.
  let creció = true;
  while (creció) {
    creció = false;
    for (const a of acciones) {
      if (asignadas.accion.has(a.id)) continue;
      const heredaDeEtapa = a.id_etapa && asignadas.etapa.has(a.id_etapa);
      const heredaDePadre = a.id_accion_padre && asignadas.accion.has(a.id_accion_padre);
      if (heredaDeEtapa || heredaDePadre) { asignadas.accion.add(a.id); creció = true; }
    }
  }
  for (const t of tareas) {
    if (t.id_accion && asignadas.accion.has(t.id_accion)) asignadas.tarea.add(t.id);
  }

  return {
    etapa: [...asignadas.etapa],
    accion: [...asignadas.accion],
    tarea: [...asignadas.tarea],
  };
}

module.exports = { nodosEditablesUsuario };
