/**
 * ARCHIVO: 00_superadmin.js
 * PROPÓSITO: Asegurar que exista el usuario superadmin definido en las
 *            variables de entorno. Corre en dev Y en producción en cada
 *            arranque del backend — si el usuario ya existe solo actualiza
 *            su contraseña y rol, jamás crea duplicados.
 *
 * Variables requeridas en .env:
 *   SUPERADMIN_EMAIL    (default: jesus.paredes@sedatu.gob.mx)
 *   SUPERADMIN_NOMBRE   (default: Jesús Paredes)
 *   PASSWORD_USER       contraseña en texto plano — se hashea con bcrypt
 */
const pool = require('../pool');
const bcrypt = require('bcryptjs');

async function asegurarSuperAdmin() {
  const correo  = process.env.SUPERADMIN_EMAIL  || 'jesus.paredes@sedatu.gob.mx';
  const nombre  = process.env.SUPERADMIN_NOMBRE || 'Jesús Paredes';
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
      SET password_hash = EXCLUDED.password_hash,
          rol            = 'superadmin',
          activo         = true
  `, [nombre, correo, hash]);

  console.log(`  ✓ Superadmin asegurado: ${correo}`);
}

module.exports = asegurarSuperAdmin;
