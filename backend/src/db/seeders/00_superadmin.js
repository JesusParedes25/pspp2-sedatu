/**
 * ARCHIVO: 00_superadmin.js
 * PROPÓSITO: Asegurar que exista el usuario superadmin definido en las
 *            variables de entorno. Corre en dev Y en producción en cada
 *            arranque del backend. Si el usuario no existe, lo crea con la
 *            contraseña de PASSWORD_USER; si ya existe, solo asegura
 *            rol/activo — nunca toca su contraseña (ver comentario junto al
 *            UPDATE), jamás crea duplicados.
 *
 * Variables requeridas en .env:
 *   SUPERADMIN_EMAIL    (default: superadmin@example.org — ficticio a
 *                        propósito, nunca una cuenta ni un dominio real)
 *   SUPERADMIN_NOMBRE   (default: Usuario Administrador — ficticio)
 *   PASSWORD_USER       contraseña en texto plano — se hashea con bcrypt
 */
const pool = require('../pool');
const bcrypt = require('bcryptjs');

async function asegurarSuperAdmin() {
  const correo  = process.env.SUPERADMIN_EMAIL  || 'superadmin@example.org';
  const nombre  = process.env.SUPERADMIN_NOMBRE || 'Usuario Administrador';
  const password = process.env.PASSWORD_USER;

  if (!password) {
    console.log('  ⚠  PASSWORD_USER no definido — superadmin no creado/actualizado.');
    return;
  }

  const hash = await bcrypt.hash(password, 10);

  await pool.query(`
    INSERT INTO usuarios (nombre_completo, correo, cargo, rol, password_hash, activo)
    VALUES ($1, $2, 'Administrador del Sistema', 'superadmin', $3, true)
    ON CONFLICT (correo) DO UPDATE
      SET rol    = 'superadmin',
          activo = true
    -- password_hash queda fuera a propósito: $3/EXCLUDED.password_hash solo
    -- se usa para la fila nueva en el INSERT. Si la cuenta ya existe, no se
    -- reescribe aquí — de lo contrario, una contraseña cambiada desde la
    -- plataforma se revertiría al valor de PASSWORD_USER en cada arranque
    -- del backend, sin ningún aviso. No lo agregues de vuelta al SET.
  `, [nombre, correo, hash]);

  console.log(`  ✓ Superadmin asegurado: ${correo}`);
}

module.exports = asegurarSuperAdmin;
