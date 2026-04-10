/**
 * ARCHIVO: auth.controller.js
 * PROPÓSITO: Manejar login y obtención del usuario autenticado.
 *
 * MINI-CLASE: Flujo de autenticación con JWT
 * ─────────────────────────────────────────────────────────────────
 * 1. Usuario envía correo + password al endpoint POST /auth/login
 * 2. Buscamos al usuario por correo en la BD
 * 3. Comparamos el password con bcrypt.compare() (hash vs texto)
 * 4. Si coincide, generamos un JWT con jwt.sign() que incluye
 *    id, correo, rol e id_dg del usuario
 * 5. El frontend guarda el token en localStorage y lo envía en
 *    cada petición como "Authorization: Bearer <token>"
 * ─────────────────────────────────────────────────────────────────
 */
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');

// POST /auth/login — Autenticar usuario y devolver JWT
async function login(req, res, next) {
  try {
    const { correo, password } = req.body;

    if (!correo || !password) {
      return res.status(400).json({
        error: true,
        mensaje: 'Correo y contraseña son requeridos',
        codigo: 'CAMPOS_REQUERIDOS'
      });
    }

    // Buscar usuario por correo, incluyendo datos de DG y dirección de área
    const resultado = await pool.query(`
      SELECT
        u.*,
        dg.siglas AS dg_siglas,
        dg.nombre AS dg_nombre,
        da.siglas AS direccion_area_siglas,
        da.nombre AS direccion_area_nombre
      FROM usuarios u
      LEFT JOIN direcciones_generales dg ON dg.id = u.id_dg
      LEFT JOIN direcciones_area da ON da.id = u.id_direccion_area
      WHERE u.correo = $1 AND u.activo = true
    `, [correo]);

    const usuario = resultado.rows[0];

    if (!usuario) {
      return res.status(401).json({
        error: true,
        mensaje: 'Credenciales inválidas',
        codigo: 'AUTH_INVALID_CREDENTIALS'
      });
    }

    // Comparar password ingresado con el hash almacenado
    const passwordValido = await bcrypt.compare(password, usuario.password_hash);

    if (!passwordValido) {
      return res.status(401).json({
        error: true,
        mensaje: 'Credenciales inválidas',
        codigo: 'AUTH_INVALID_CREDENTIALS'
      });
    }

    // Generar JWT con datos esenciales del usuario
    const tokenPayload = {
      id: usuario.id,
      correo: usuario.correo,
      rol: usuario.rol,
      id_dg: usuario.id_dg,
      id_direccion_area: usuario.id_direccion_area,
      nombre_completo: usuario.nombre_completo
    };

    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '8h'
    });

    // Devolver token y datos del usuario (sin password_hash)
    res.json({
      datos: {
        token,
        usuario: {
          id: usuario.id,
          nombre_completo: usuario.nombre_completo,
          correo: usuario.correo,
          cargo: usuario.cargo,
          rol: usuario.rol,
          id_dg: usuario.id_dg,
          dg_siglas: usuario.dg_siglas,
          dg_nombre: usuario.dg_nombre,
          id_direccion_area: usuario.id_direccion_area,
          direccion_area_siglas: usuario.direccion_area_siglas,
          direccion_area_nombre: usuario.direccion_area_nombre
        }
      },
      mensaje: 'Login exitoso'
    });
  } catch (err) {
    next(err);
  }
}

// GET /auth/me — Obtener datos del usuario autenticado
async function obtenerUsuarioActual(req, res, next) {
  try {
    const resultado = await pool.query(`
      SELECT
        u.id, u.nombre_completo, u.correo, u.cargo, u.rol,
        u.id_dg, u.id_direccion_area,
        dg.siglas AS dg_siglas,
        dg.nombre AS dg_nombre,
        da.siglas AS direccion_area_siglas,
        da.nombre AS direccion_area_nombre
      FROM usuarios u
      LEFT JOIN direcciones_generales dg ON dg.id = u.id_dg
      LEFT JOIN direcciones_area da ON da.id = u.id_direccion_area
      WHERE u.id = $1
    `, [req.usuario.id]);

    const usuario = resultado.rows[0];

    if (!usuario) {
      return res.status(404).json({
        error: true,
        mensaje: 'Usuario no encontrado',
        codigo: 'USUARIO_NO_ENCONTRADO'
      });
    }

    res.json({ datos: usuario });
  } catch (err) {
    next(err);
  }
}

module.exports = { login, obtenerUsuarioActual };
