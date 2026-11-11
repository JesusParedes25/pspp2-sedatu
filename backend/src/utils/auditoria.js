/**
 * ARCHIVO: auditoria.js
 * PROPÓSITO: Bitácora OFICIAL de auditoría de PSPP — la única fuente de
 *            verdad para el formato de dictaminación de la DGTIC, que exige
 *            trazabilidad con el estado previo y posterior del objeto
 *            afectado, en un historial inalterable.
 *
 * NOTA TÉCNICA: por qué esta es "la" bitácora y las otras dos no
 * ─────────────────────────────────────────────────────────────────
 * PSPP tiene tres tablas que podrían confundirse con "la bitácora" (ver
 * también migración 088, que deja este mismo criterio como COMMENT ON
 * TABLE en la base de datos):
 *   - `auditoria` (esta, migración 001): registro_id SIN llave foránea
 *     a propósito, así que una fila sobrevive aunque se borre la entidad
 *     que describe — incluida la cascada de borrar un proyecto completo
 *     (ver eliminarProyectoController/purgarProyecto en
 *     proyectos.queries.js, que registran aquí ANTES del DELETE). Es la
 *     única de las tres que cumple "historial inalterable".
 *   - `actividad_log` (migración 031, backend/src/utils/actividad-log.js):
 *     su propio SQL se autodescribe como "auditoría informal". Alimenta
 *     pantallas con texto legible para humanos (Bitácora del proyecto,
 *     "Actividad reciente" de Carteras, Tablero General, Resumen) pero se
 *     borra en cascada con el proyecto. No es la bitácora de cumplimiento.
 *   - `actividad` (migración 039, backend/src/db/queries/actividad.queries.js):
 *     el stream de actividad de la interfaz (comentarios, archivos,
 *     riesgos, cambios de estatus/avance con fecha+autor). Es comodidad
 *     de usuario para la pestaña de Detalle, NO auditoría: solo guarda el
 *     valor nuevo, nunca el anterior, y también se borra en cascada.
 * Cualquier operación que modifique un campo de negocio y necesite
 * trazabilidad ante un dictamen debe llamar a registrarAuditoria() de
 * AQUÍ — no inventar una cuarta tabla ni reusar las otras dos para eso.
 * ─────────────────────────────────────────────────────────────────
 *
 * NOTA TÉCNICA: ninguna vía de edición o borrado
 * ─────────────────────────────────────────────────────────────────
 * No existe ningún endpoint, ruta ni función que permita UPDATE o DELETE
 * sobre `auditoria` — ni siquiera para un superadmin. El único INSERT en
 * todo el backend pasa por esta función. Si alguna vez se agrega una
 * pantalla para LEER la bitácora, que sea de solo lectura; que esta nota
 * quede aquí para que quien la escriba no tenga que volver a verificarlo
 * desde cero.
 * ─────────────────────────────────────────────────────────────────
 */
const pool = require('../db/pool');

const OPERACIONES_VALIDAS = ['INSERT', 'UPDATE', 'DELETE'];

/**
 * Inserta una fila en la bitácora oficial de auditoría.
 *
 * @param {object} datos
 * @param {string} datos.tabla            - tabla_afectada (p. ej. 'etapas')
 * @param {string} datos.registroId       - UUID del registro afectado
 * @param {string} datos.campoModificado  - campo que cambió (p. ej.
 *   'avance_actual', 'estado', 'rol'); en INSERT/DELETE de fila completa,
 *   un nombre descriptivo del evento (p. ej. 'fila')
 * @param {*} [datos.valorAnterior]       - valor previo (null en INSERT)
 * @param {*} [datos.valorNuevo]          - valor nuevo (null en DELETE)
 * @param {string} [datos.operacion]      - 'INSERT'|'UPDATE'|'DELETE', por omisión 'UPDATE'
 * @param {string|null} datos.idUsuario   - UUID de quien hizo el cambio; null
 *   SOLO para una acción del propio sistema sin actor humano (p. ej. la
 *   purga automática de proyectos a los 30 días, utils/purgarProyectos.js)
 *   — hay que pasarlo explícitamente, omitirlo es un error de quien llama.
 * @param {string} [datos.idEventoOrigen] - UUID de la auditoría raíz, para correlacionar cascadas
 * @param {object} [datos.client]         - pg client de transacción; por omisión el pool compartido
 * @returns {Promise<string>} UUID de la fila insertada
 */
async function registrarAuditoria(datos) {
  const {
    tabla, registroId, campoModificado,
    valorAnterior = null, valorNuevo = null,
    operacion = 'UPDATE', idUsuario, idEventoOrigen = null, client
  } = datos || {};

  if (!tabla || !registroId || !campoModificado) {
    throw new Error('registrarAuditoria: tabla, registroId y campoModificado son obligatorios');
  }
  if (idUsuario === undefined) {
    throw new Error('registrarAuditoria: idUsuario es obligatorio (pasar null explícito solo para una acción del propio sistema sin actor humano)');
  }
  if (!OPERACIONES_VALIDAS.includes(operacion)) {
    throw new Error(`registrarAuditoria: operación no válida: ${operacion}`);
  }

  const db = client || pool;
  const res = await db.query(
    `INSERT INTO auditoria
       (tabla_afectada, registro_id, campo_modificado, valor_anterior, valor_nuevo,
        operacion, id_usuario, id_evento_origen)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [tabla, registroId, campoModificado,
      _aTexto(valorAnterior), _aTexto(valorNuevo),
      operacion, idUsuario, idEventoOrigen]
  );
  return res.rows[0].id;
}

// valor_anterior/valor_nuevo son TEXT: un snapshot de fila (p. ej. al borrar
// un proyecto completo) llega como objeto y se guarda como JSON legible, no
// como "[object Object]".
function _aTexto(valor) {
  if (valor === undefined || valor === null) return null;
  if (typeof valor === 'object') return JSON.stringify(valor);
  return String(valor);
}

module.exports = { registrarAuditoria };
