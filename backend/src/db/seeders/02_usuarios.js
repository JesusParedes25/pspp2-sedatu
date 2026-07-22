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

    // IDs de DGs adicionales
    const dgicam  = await client.query("SELECT id FROM direcciones_generales WHERE siglas = 'DGICAM'");
    const dggird  = await client.query("SELECT id FROM direcciones_generales WHERE siglas = 'DGGIRDCC'");
    const dgtic   = await client.query("SELECT id FROM direcciones_generales WHERE siglas = 'DGTIC'");
    const dgptm   = await client.query("SELECT id FROM direcciones_generales WHERE siglas = 'DGPTM'");
    const dgimrc  = await client.query("SELECT id FROM direcciones_generales WHERE siglas = 'DGIMRC'");
    const dgpp    = await client.query("SELECT id FROM direcciones_generales WHERE siglas = 'DGPP'");
    const dgie    = await client.query("SELECT id FROM direcciones_generales WHERE siglas = 'DGIE'");
    const dgtn    = await client.query("SELECT id FROM direcciones_generales WHERE siglas = 'DGTN'");
    const dgrpe   = await client.query("SELECT id FROM direcciones_generales WHERE siglas = 'DGRPE'");

    const idDGICAM  = dgicam.rows[0]?.id  || null;
    const idDGGIRD  = dggird.rows[0]?.id  || null;
    const idDGTIC   = dgtic.rows[0]?.id   || null;
    const idDGPTM   = dgptm.rows[0]?.id   || null;
    const idDGIMRC  = dgimrc.rows[0]?.id  || null;
    const idDGPP    = dgpp.rows[0]?.id    || null;
    const idDGIE    = dgie.rows[0]?.id    || null;
    const idDGTN    = dgtn.rows[0]?.id    || null;
    const idDGRPE   = dgrpe.rows[0]?.id   || null;

    const usuarios = [
      // ─── Usuarios originales ───────────────────────────────────
      {
        nombre_completo: 'Jesús Paredes',
        correo: 'jesus.paredes@sedatu.gob.mx',
        cargo: 'Subdirector de Tecnologías para la Sistematización y Análisis Territorial',
        rol: 'superadmin',
        id_dg: idDGOTU,
        id_direccion_area: idDAOT
      },
      {
        nombre_completo: 'Pablo Hernández Rivas',
        correo: 'pablo.director@sedatu.gob.mx',
        cargo: 'Director de Análisis en Ordenamiento Territorial',
        rol: 'direccion',
        id_dg: idDGOTU,
        id_direccion_area: idDAOT
      },
      {
        nombre_completo: 'Laura Méndez Castillo',
        correo: 'enlace.dgomr@sedatu.gob.mx',
        cargo: 'Subdirectora de Análisis Metropolitano',
        rol: 'enlace',
        id_dg: idDGOMR,
        id_direccion_area: null
      },
      {
        nombre_completo: 'Roberto Sánchez Fuentes',
        correo: 'enlace.dgpv@sedatu.gob.mx',
        cargo: 'Analista de Política de Vivienda',
        rol: 'enlace',
        id_dg: idDGPV,
        id_direccion_area: null
      },
      {
        nombre_completo: 'Mónica Torres Vega',
        correo: 'enlace.ran@sedatu.gob.mx',
        cargo: 'Técnico de Información Agraria',
        rol: 'enlace',
        id_dg: idDGOTU,
        id_direccion_area: null
      },
      {
        nombre_completo: 'Alejandro Ríos Montoya',
        correo: 'subsecretario@sedatu.gob.mx',
        cargo: 'Subsecretario de Ordenamiento Territorial, Urbano y Vivienda',
        rol: 'ejecutivo',
        id_dg: idDGOTU,
        id_direccion_area: null
      },

      // ─── Usuarios ficticios adicionales ────────────────────────
      {
        nombre_completo: 'Claudia Ramírez Ortega',
        correo: 'c.ramirez@sedatu.gob.mx',
        cargo: 'Directora General de Política Territorial y Movilidad',
        rol: 'direccion',
        id_dg: idDGPTM,
        id_direccion_area: null
      },
      {
        nombre_completo: 'Fernando Espinoza Leal',
        correo: 'f.espinoza@sedatu.gob.mx',
        cargo: 'Subdirector de Gestión de Riesgos',
        rol: 'enlace',
        id_dg: idDGGIRD,
        id_direccion_area: null
      },
      {
        nombre_completo: 'Adriana Vázquez Moreno',
        correo: 'a.vazquez@sedatu.gob.mx',
        cargo: 'Analista de Modernización Catastral',
        rol: 'enlace',
        id_dg: idDGIMRC,
        id_direccion_area: null
      },
      {
        nombre_completo: 'Carlos Jiménez Peña',
        correo: 'c.jimenez@sedatu.gob.mx',
        cargo: 'Subdirector de Infraestructura y Equipamiento',
        rol: 'enlace',
        id_dg: idDGIE,
        id_direccion_area: null
      },
      {
        nombre_completo: 'Sofía Gutiérrez Ávila',
        correo: 's.gutierrez@sedatu.gob.mx',
        cargo: 'Coordinadora de Tecnologías de la Información',
        rol: 'ejecutivo',
        id_dg: idDGTIC,
        id_direccion_area: null
      },
      {
        nombre_completo: 'Diego Morales Ibáñez',
        correo: 'd.morales@sedatu.gob.mx',
        cargo: 'Analista de Programación y Presupuesto',
        rol: 'enlace',
        id_dg: idDGPP,
        id_direccion_area: null
      },
      {
        nombre_completo: 'Valeria Campos Duarte',
        correo: 'v.campos@sedatu.gob.mx',
        cargo: 'Subdirectora de Concertación Agraria',
        rol: 'enlace',
        id_dg: idDGICAM,
        id_direccion_area: null
      },
      {
        nombre_completo: 'Héctor Reyes Blanco',
        correo: 'h.reyes@sedatu.gob.mx',
        cargo: 'Analista de Terrenos Nacionales',
        rol: 'enlace',
        id_dg: idDGTN,
        id_direccion_area: null
      },
      {
        nombre_completo: 'Patricia Luna Serrano',
        correo: 'p.luna@sedatu.gob.mx',
        cargo: 'Directora de Resoluciones Presidenciales',
        rol: 'direccion',
        id_dg: idDGRPE,
        id_direccion_area: null
      },
      {
        nombre_completo: 'Iván Castillo Domínguez',
        correo: 'i.castillo@sedatu.gob.mx',
        cargo: 'Subdirector de Ordenamiento Regional',
        rol: 'enlace',
        id_dg: idDGOMR,
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
