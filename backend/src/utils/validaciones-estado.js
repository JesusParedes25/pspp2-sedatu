/**
 * ARCHIVO: validaciones-estado.js
 * PROPÓSITO: Módulo compartido para transiciones de estado, cascadas de
 *            cancelación, bloqueos, validación de completitud y auditoría
 *            en los 4 niveles jerárquicos: Proyecto, Etapa, Acción, Subacción.
 *
 * MINI-CLASE: Máquina de estados centralizada
 * ─────────────────────────────────────────────────────────────────
 * En vez de dispersar la lógica de "¿puedo pasar de Pendiente a
 * Bloqueada?" en cada controller, este módulo la centraliza.
 * Cada función recibe un `client` (pg transaction client) para que
 * TODO ocurra dentro de la misma transacción del controller.
 * El controller abre BEGIN, llama a estas funciones, y hace COMMIT.
 * Si algo falla, el ROLLBACK del controller deshace todo.
 * ─────────────────────────────────────────────────────────────────
 */
const pool = require('../db/pool');

// ─── Catálogo unificado ─────────────────────────────────────────
const ESTADOS_VALIDOS = [
  'Pendiente', 'En_proceso', 'Bloqueada', 'Completada', 'Cancelada'
];

// ─── Mapeo entidadTipo → tabla SQL + FK de hijos ────────────────
const MAPA_ENTIDAD = {
  Proyecto: {
    tabla: 'proyectos',
    hijos: [
      { tabla: 'etapas',    fk: 'id_proyecto', tipo: 'Etapa',    filtro: '' },
      { tabla: 'acciones',  fk: 'id_proyecto', tipo: 'Accion',   filtro: 'AND id_etapa IS NULL AND id_accion_padre IS NULL' }
    ]
  },
  Etapa: {
    tabla: 'etapas',
    padreTabla: 'proyectos',
    padreFk: 'id_proyecto',
    padreTipo: 'Proyecto',
    hijos: [
      { tabla: 'acciones', fk: 'id_etapa', tipo: 'Accion', filtro: 'AND id_accion_padre IS NULL' }
    ]
  },
  Accion: {
    tabla: 'acciones',
    hijos: [
      { tabla: 'acciones', fk: 'id_accion_padre', tipo: 'Subaccion', filtro: '' }
    ]
  },
  Subaccion: {
    tabla: 'acciones',
    hijos: []
  }
};

// ─── Helpers internos ───────────────────────────────────────────

/**
 * Obtiene el estado actual de una entidad.
 * Retorna { estado, id_etapa?, id_proyecto?, id_accion_padre? }
 */
async function obtenerEntidad(entidadTipo, entidadId, client) {
  const db = client || pool;
  const mapa = MAPA_ENTIDAD[entidadTipo];
  if (!mapa) throw _error(`Tipo de entidad no soportado: ${entidadTipo}`, 400);

  const res = await db.query(
    `SELECT * FROM ${mapa.tabla} WHERE id = $1`, [entidadId]
  );
  if (res.rows.length === 0) {
    throw _error(`${entidadTipo} no encontrado: ${entidadId}`, 404);
  }
  return res.rows[0];
}

/**
 * Determina el tipo real de una fila de acciones (Accion vs Subaccion).
 */
function tipoRealAccion(fila) {
  return fila.id_accion_padre ? 'Subaccion' : 'Accion';
}

/**
 * Obtiene el id y tipo del padre de una entidad.
 * Retorna { padreId, padreTipo } o null si es raíz.
 */
function obtenerPadreInfo(entidadTipo, entidad) {
  if (entidadTipo === 'Subaccion') {
    return { padreId: entidad.id_accion_padre, padreTipo: 'Accion' };
  }
  if (entidadTipo === 'Accion') {
    if (entidad.id_etapa) return { padreId: entidad.id_etapa, padreTipo: 'Etapa' };
    if (entidad.id_proyecto) return { padreId: entidad.id_proyecto, padreTipo: 'Proyecto' };
    return null;
  }
  if (entidadTipo === 'Etapa') {
    if (entidad.id_proyecto) return { padreId: entidad.id_proyecto, padreTipo: 'Proyecto' };
    return null;
  }
  return null; // Proyecto es raíz
}

function _error(mensaje, statusCode) {
  const err = new Error(mensaje);
  err.statusCode = statusCode;
  return err;
}

// ─── Funciones públicas ─────────────────────────────────────────

/**
 * Orquestador principal de cambio de estado.
 * Valida la transición, ejecuta efectos secundarios (bloqueo,
 * desbloqueo, cascada, completitud) y registra auditoría.
 *
 * @param {string} entidadTipo - 'Proyecto'|'Etapa'|'Accion'|'Subaccion'
 * @param {string} entidadId   - UUID de la entidad
 * @param {string} estadoNuevo - Estado destino
 * @param {object} opciones    - { motivoBloqueo, notaResolucion, idUsuario }
 * @param {object} client      - pg client de transacción
 * @returns {{ estadoAnterior, estadoNuevo, auditoria_id }}
 */
async function cambiarEstado(entidadTipo, entidadId, estadoNuevo, opciones, client) {
  const db = client || pool;
  const { motivoBloqueo, notaResolucion, idUsuario } = opciones;

  if (!ESTADOS_VALIDOS.includes(estadoNuevo)) {
    throw _error(`Estado no válido: ${estadoNuevo}`, 400);
  }
  if (!idUsuario) {
    throw _error('idUsuario es requerido para cambiar estado', 400);
  }

  const entidad = await obtenerEntidad(entidadTipo, entidadId, db);
  const estadoAnterior = entidad.estado;

  if (estadoAnterior === estadoNuevo) {
    throw _error(`La entidad ya está en estado ${estadoNuevo}`, 400);
  }

  // ── Validar reactivación desde Cancelada ──
  if (estadoAnterior === 'Cancelada') {
    await validarReactivacion(entidadTipo, entidad, db);
  }

  // ── Validar transición a Bloqueada ──
  if (estadoNuevo === 'Bloqueada') {
    if (!motivoBloqueo) {
      throw _error('El motivo de bloqueo es obligatorio', 400);
    }
    await crearBloqueo(entidadTipo, entidadId, motivoBloqueo, idUsuario, db);
  }

  // ── Cerrar bloqueo activo al salir de Bloqueada ──
  if (estadoAnterior === 'Bloqueada' && estadoNuevo !== 'Bloqueada') {
    await cerrarBloqueoActivo(
      entidadTipo, entidadId, notaResolucion || 'Desbloqueado', idUsuario, db
    );
  }

  // ── Validar completitud ──
  if (estadoNuevo === 'Completada') {
    const check = await validarCompletitud(entidadTipo, entidadId, db);
    if (!check.valido) {
      const nombres = check.hijosNoCumplidos
        .slice(0, 5)
        .map(h => `"${h.nombre}" (${h.estado})`)
        .join(', ');
      throw _error(
        `No se puede completar: hay hijos sin completar/cancelar: ${nombres}`, 400
      );
    }
  }

  // ── Actualizar estado en BD ──
  const mapa = MAPA_ENTIDAD[entidadTipo];
  await db.query(
    `UPDATE ${mapa.tabla} SET estado = $1, updated_at = NOW() WHERE id = $2`,
    [estadoNuevo, entidadId]
  );

  // ── Registrar auditoría raíz ──
  const auditoriaId = await registrarAuditoria(
    mapa.tabla, entidadId, estadoAnterior, estadoNuevo, idUsuario, null, db
  );

  // ── Cascada de cancelación ──
  if (estadoNuevo === 'Cancelada') {
    await cascadaCancelacion(entidadTipo, entidadId, idUsuario, auditoriaId, db);
  }

  return { estadoAnterior, estadoNuevo, auditoria_id: auditoriaId };
}

/**
 * Cancela en cascada todos los descendientes de una entidad.
 * Cierra bloqueos activos de los cancelados. Registra auditoría
 * con id_evento_origen apuntando a la auditoría raíz.
 */
async function cascadaCancelacion(entidadTipo, entidadId, idUsuario, auditoriaOrigenId, client) {
  const db = client || pool;
  const mapa = MAPA_ENTIDAD[entidadTipo];
  if (!mapa || !mapa.hijos) return;

  for (const hijo of mapa.hijos) {
    // Obtener hijos que no están ya cancelados
    const res = await db.query(
      `SELECT id, nombre, estado FROM ${hijo.tabla}
       WHERE ${hijo.fk} = $1 AND estado != 'Cancelada' ${hijo.filtro}`,
      [entidadId]
    );

    if (res.rows.length === 0) continue;

    const ids = res.rows.map(r => r.id);

    // Cancelar en batch
    await db.query(
      `UPDATE ${hijo.tabla} SET estado = 'Cancelada', updated_at = NOW()
       WHERE id = ANY($1)`,
      [ids]
    );

    // Cerrar bloqueos activos de los cancelados
    await db.query(
      `UPDATE bloqueos SET fecha_desbloqueo = NOW(),
         nota_resolucion = 'Cerrado por cancelación en cascada',
         id_responsable_desbloqueo = $1
       WHERE entidad_tipo = $2 AND entidad_id = ANY($3)
         AND fecha_desbloqueo IS NULL`,
      [idUsuario, hijo.tipo, ids]
    );

    // Registrar auditoría para cada hijo cancelado
    for (const fila of res.rows) {
      const subAudId = await registrarAuditoria(
        hijo.tabla, fila.id, fila.estado, 'Cancelada',
        idUsuario, auditoriaOrigenId, db
      );
      // Recursar: cancelar descendientes del hijo
      await cascadaCancelacion(hijo.tipo, fila.id, idUsuario, auditoriaOrigenId, db);
    }
  }
}

/**
 * Valida que todos los hijos directos estén en Completada o Cancelada.
 * Retorna { valido: bool, hijosNoCumplidos: [{ id, nombre, estado }] }
 */
async function validarCompletitud(entidadTipo, entidadId, client) {
  const db = client || pool;
  const mapa = MAPA_ENTIDAD[entidadTipo];
  if (!mapa || !mapa.hijos || mapa.hijos.length === 0) {
    return { valido: true, hijosNoCumplidos: [] };
  }

  const noCumplidos = [];

  for (const hijo of mapa.hijos) {
    const res = await db.query(
      `SELECT id, nombre, estado FROM ${hijo.tabla}
       WHERE ${hijo.fk} = $1 AND estado NOT IN ('Completada', 'Cancelada') ${hijo.filtro}`,
      [entidadId]
    );
    noCumplidos.push(...res.rows);
  }

  return {
    valido: noCumplidos.length === 0,
    hijosNoCumplidos: noCumplidos
  };
}

/**
 * Crea un bloqueo activo para una entidad.
 * Falla si ya existe un bloqueo activo (por el unique index parcial).
 */
async function crearBloqueo(entidadTipo, entidadId, motivo, idUsuario, client) {
  const db = client || pool;
  try {
    await db.query(
      `INSERT INTO bloqueos (entidad_tipo, entidad_id, motivo, id_creador)
       VALUES ($1, $2, $3, $4)`,
      [entidadTipo, entidadId, motivo, idUsuario]
    );
  } catch (err) {
    if (err.code === '23505') { // unique_violation
      throw _error('Ya existe un bloqueo activo para esta entidad', 409);
    }
    throw err;
  }
}

/**
 * Cierra el bloqueo activo de una entidad (si existe).
 */
async function cerrarBloqueoActivo(entidadTipo, entidadId, notaResolucion, idUsuario, client) {
  const db = client || pool;
  await db.query(
    `UPDATE bloqueos
     SET fecha_desbloqueo = NOW(),
         nota_resolucion = $1,
         id_responsable_desbloqueo = $2
     WHERE entidad_tipo = $3 AND entidad_id = $4
       AND fecha_desbloqueo IS NULL`,
    [notaResolucion, idUsuario, entidadTipo, entidadId]
  );
}

/**
 * Valida que se pueda reactivar una entidad cancelada.
 * El padre NO debe estar cancelado.
 */
async function validarReactivacion(entidadTipo, entidad, client) {
  const db = client || pool;
  const padreInfo = obtenerPadreInfo(entidadTipo, entidad);
  if (!padreInfo) return; // Proyecto raíz, siempre puede reactivarse

  const padre = await obtenerEntidad(padreInfo.padreTipo, padreInfo.padreId, db);
  if (padre.estado === 'Cancelada') {
    throw _error(
      `No se puede reactivar: el ${padreInfo.padreTipo.toLowerCase()} padre está cancelado`, 400
    );
  }
}

/**
 * Registra un cambio de estado en la tabla auditoria.
 * Retorna el UUID de la fila insertada.
 */
async function registrarAuditoria(tabla, registroId, valorAnterior, valorNuevo, idUsuario, idEventoOrigen, client) {
  const db = client || pool;
  const res = await db.query(
    `INSERT INTO auditoria
       (tabla_afectada, registro_id, campo_modificado, valor_anterior, valor_nuevo,
        operacion, id_usuario, id_evento_origen)
     VALUES ($1, $2, 'estado', $3, $4, 'UPDATE', $5, $6)
     RETURNING id`,
    [tabla, registroId, valorAnterior, valorNuevo, idUsuario, idEventoOrigen]
  );
  return res.rows[0].id;
}

/**
 * Cuenta descendientes de una entidad (para el diálogo de confirmación
 * de cancelación en el frontend).
 * Retorna { etapas, acciones, subacciones }
 */
async function contarDescendientes(entidadTipo, entidadId, client) {
  const db = client || pool;
  const conteo = { etapas: 0, acciones: 0, subacciones: 0 };

  if (entidadTipo === 'Proyecto') {
    const e = await db.query(
      `SELECT COUNT(*) FROM etapas WHERE id_proyecto = $1 AND estado != 'Cancelada'`,
      [entidadId]
    );
    conteo.etapas = parseInt(e.rows[0].count);

    const a = await db.query(
      `SELECT COUNT(*) FROM acciones
       WHERE id_proyecto = $1 AND id_accion_padre IS NULL AND estado != 'Cancelada'`,
      [entidadId]
    );
    conteo.acciones = parseInt(a.rows[0].count);

    const s = await db.query(
      `SELECT COUNT(*) FROM acciones a
       JOIN acciones padre ON a.id_accion_padre = padre.id
       WHERE padre.id_proyecto = $1 AND a.estado != 'Cancelada'`,
      [entidadId]
    );
    conteo.subacciones = parseInt(s.rows[0].count);
  }

  if (entidadTipo === 'Etapa') {
    const a = await db.query(
      `SELECT COUNT(*) FROM acciones
       WHERE id_etapa = $1 AND id_accion_padre IS NULL AND estado != 'Cancelada'`,
      [entidadId]
    );
    conteo.acciones = parseInt(a.rows[0].count);

    const s = await db.query(
      `SELECT COUNT(*) FROM acciones
       WHERE id_accion_padre IN (SELECT id FROM acciones WHERE id_etapa = $1)
         AND estado != 'Cancelada'`,
      [entidadId]
    );
    conteo.subacciones = parseInt(s.rows[0].count);
  }

  if (entidadTipo === 'Accion') {
    const s = await db.query(
      `SELECT COUNT(*) FROM acciones
       WHERE id_accion_padre = $1 AND estado != 'Cancelada'`,
      [entidadId]
    );
    conteo.subacciones = parseInt(s.rows[0].count);
  }

  return conteo;
}

module.exports = {
  ESTADOS_VALIDOS,
  MAPA_ENTIDAD,
  cambiarEstado,
  cascadaCancelacion,
  validarCompletitud,
  crearBloqueo,
  cerrarBloqueoActivo,
  validarReactivacion,
  registrarAuditoria,
  contarDescendientes,
  obtenerEntidad,
  tipoRealAccion
};
