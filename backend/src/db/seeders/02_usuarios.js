/**
 * ARCHIVO: 02_usuarios.js
 * PROPÓSITO: Insertar los 6 usuarios de demostración con contraseñas hasheadas.
 *
 * MINI-CLASE: bcrypt y hashing de contraseñas
 * ─────────────────────────────────────────────────────────────────
 * NUNCA se almacena la contraseña en texto plano. bcrypt aplica un
 * algoritmo de hashing irreversible con un "salt" aleatorio. El
 * número 10 en genSalt(10) indica 2^10 = 1024 rondas de hashing,
 * lo que hace computacionalmente costoso un ataque de fuerza bruta.
 * Al hacer login, bcrypt.compare() hashea la contraseña ingresada
 * con el mismo salt y compara los hashes, nunca el texto plano.
 * ─────────────────────────────────────────────────────────────────
 */
const bcrypt = require('bcryptjs');
const pool = require('../pool');

async function seedUsuarios() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Hashear la contraseña de demo una sola vez para todos los usuarios
    const passwordHash = await bcrypt.hash('demo2026', 10);

    // Obtener IDs de DGs y Direcciones de Área
    const dgotu = await client.query("SELECT id FROM direcciones_generales WHERE siglas = 'DGOTU'");
    const dgomr = await client.query("SELECT id FROM direcciones_generales WHERE siglas = 'DGOMR'");
    const dgpv = await client.query("SELECT id FROM direcciones_generales WHERE siglas = 'DGPV'");
    const daot = await client.query("SELECT id FROM direcciones_area WHERE siglas = 'DAOT'");

    const idDGOTU = dgotu.rows[0].id;
    const idDGOMR = dgomr.rows[0].id;
    const idDGPV = dgpv.rows[0].id;
    const idDAOT = daot.rows[0].id;

    const usuarios = [
      {
        nombre_completo: 'Jesús Paredes',
        correo: 'jesus.paredes@sedatu.gob.mx',
        cargo: 'Subdirector de Tecnologías para la Sistematización y Análisis Territorial',
        rol: 'Responsable',
        id_dg: idDGOTU,
        id_direccion_area: idDAOT
      },
      {
        nombre_completo: 'Pablo (Director DAOT)',
        correo: 'pablo.director@sedatu.gob.mx',
        cargo: 'Director de Análisis en Ordenamiento Territorial',
        rol: 'Directivo',
        id_dg: idDGOTU,
        id_direccion_area: idDAOT
      },
      {
        nombre_completo: 'Enlace DGOMR',
        correo: 'enlace.dgomr@sedatu.gob.mx',
        cargo: 'Analista de Ordenamiento Metropolitano',
        rol: 'Responsable',
        id_dg: idDGOMR,
        id_direccion_area: null
      },
      {
        nombre_completo: 'Enlace DGPV',
        correo: 'enlace.dgpv@sedatu.gob.mx',
        cargo: 'Analista de Política de Vivienda',
        rol: 'Responsable',
        id_dg: idDGPV,
        id_direccion_area: null
      },
      {
        nombre_completo: 'Enlace RAN',
        correo: 'enlace.ran@sedatu.gob.mx',
        cargo: 'Técnico de Información Agraria',
        rol: 'Operativo',
        id_dg: idDGOTU,
        id_direccion_area: null
      },
      {
        nombre_completo: 'Subsecretario SOTUV',
        correo: 'subsecretario@sedatu.gob.mx',
        cargo: 'Subsecretario de Ordenamiento Territorial, Urbano y Vivienda',
        rol: 'Ejecutivo',
        id_dg: idDGOTU,
        id_direccion_area: null
      },
    ];

    const usuarioIds = {};
    for (const usuario of usuarios) {
      const resultado = await client.query(`
        INSERT INTO usuarios (nombre_completo, correo, password_hash, cargo, rol, id_dg, id_direccion_area)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (correo) DO UPDATE SET
          nombre_completo = EXCLUDED.nombre_completo,
          cargo = EXCLUDED.cargo,
          rol = EXCLUDED.rol,
          password_hash = EXCLUDED.password_hash
        RETURNING id
      `, [
        usuario.nombre_completo,
        usuario.correo,
        passwordHash,
        usuario.cargo,
        usuario.rol,
        usuario.id_dg,
        usuario.id_direccion_area
      ]);
      usuarioIds[usuario.correo] = resultado.rows[0].id;
    }

    await client.query('COMMIT');
    console.log('  ✓ Usuarios:', Object.keys(usuarioIds).length);
    return usuarioIds;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = seedUsuarios;
