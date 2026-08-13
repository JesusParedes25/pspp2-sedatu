/**
 * ARCHIVO: api-tokens.queries.js
 * PROPÓSITO: Credenciales de servicio para que otra plataforma consuma
 *            la API de indicadores.
 *
 * MINI-CLASE: por qué solo se guarda el hash
 * ─────────────────────────────────────────────────────────────────
 * El token se genera aleatorio y se guarda hasheado con SHA-256. Ni
 * siquiera un superadmin puede volver a verlo: si se pierde, se
 * revoca y se emite otro. Guardarlo en claro significaría que
 * cualquiera con acceso de lectura a la base (un respaldo, un volcado
 * para depurar) se lleva una credencial funcional.
 *
 * SHA-256 sin salt es lo correcto AQUÍ y sería un error para
 * contraseñas: un token de 32 bytes aleatorios no es adivinable por
 * fuerza bruta ni por diccionario, así que no necesita el costo de
 * bcrypt — y sí necesita ser barato, porque se verifica en cada
 * petición de la plataforma externa.
 * ─────────────────────────────────────────────────────────────────
 */
const crypto = require('crypto');
const pool = require('../pool');

const PREFIJO = 'pspp_';

function hashear(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function listar() {
  const { rows } = await pool.query(`
    SELECT t.id, t.nombre, t.descripcion, t.prefijo, t.permisos, t.activo,
           t.ultimo_uso, t.usos, t.created_at, t.revocado_en,
           u.nombre_completo AS creador_nombre
      FROM api_tokens t
      LEFT JOIN usuarios u ON u.id = t.creado_por
     ORDER BY t.activo DESC, t.created_at DESC
  `);
  return rows;
}

// Devuelve el token EN CLARO una sola vez: es la única oportunidad de
// copiarlo. Después solo queda el hash.
async function crear({ nombre, descripcion }, usuarioId) {
  const token = PREFIJO + crypto.randomBytes(32).toString('hex');
  const { rows } = await pool.query(`
    INSERT INTO api_tokens (nombre, descripcion, token_hash, prefijo, creado_por)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id, nombre, descripcion, prefijo, permisos, activo, created_at
  `, [nombre, descripcion || null, hashear(token), token.slice(0, 12), usuarioId || null]);
  return { ...rows[0], token };
}

async function revocar(id) {
  const { rows } = await pool.query(`
    UPDATE api_tokens SET activo = false, revocado_en = NOW()
     WHERE id = $1 RETURNING id, nombre, activo, revocado_en
  `, [id]);
  return rows[0] || null;
}

// Verifica un token entrante. Registra el uso para que en el panel se
// vea si una credencial sigue viva o quedó olvidada.
async function verificar(token) {
  if (!token || typeof token !== 'string') return null;
  const { rows } = await pool.query(
    'SELECT * FROM api_tokens WHERE token_hash = $1 AND activo = true',
    [hashear(token)]
  );
  if (rows.length === 0) return null;

  // No se espera a que termine: el registro de uso no debe frenar la
  // respuesta ni tumbarla si falla.
  pool.query('UPDATE api_tokens SET ultimo_uso = NOW(), usos = usos + 1 WHERE id = $1', [rows[0].id])
    .catch(() => {});

  return rows[0];
}

module.exports = { listar, crear, revocar, verificar };
