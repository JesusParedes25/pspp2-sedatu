/**
 * ARCHIVO: auth.controller.js
 * PROPÓSITO: Manejar login, renovación y obtención del usuario autenticado.
 *
 * NOTA TÉCNICA: Flujo de autenticación con JWT
 * ─────────────────────────────────────────────────────────────────
 * 1. Usuario envía correo + password al endpoint POST /auth/login
 * 2. Buscamos al usuario por correo en la BD
 * 3. Comparamos el password con bcrypt.compare() (hash vs texto)
 * 4. Si coincide, generamos un JWT con jwt.sign() que incluye
 *    id, correo, rol e id_dg del usuario
 * 5. El frontend guarda el token en sessionStorage y lo envía en
 *    cada petición como "Authorization: Bearer <token>"
 * ─────────────────────────────────────────────────────────────────
 *
 * NOTA TÉCNICA: sesión por inactividad, no por duración fija
 * ─────────────────────────────────────────────────────────────────
 * El token expira (`exp`) a las JWT_INACTIVIDAD_HORAS (8h por omisión)
 * de EMITIDO, sea el de login o el de una renovación — por eso el
 * frontend llama a POST /auth/renovar cuando detecta actividad real de
 * la persona (ver frontend/src/hooks/useSesionActividad.js), para
 * empujar ese reloj hacia adelante. Lo que SÍ queda fijo desde el login
 * es `ini` (inicio real de la sesión): renovarToken lo copia tal cual al
 * payload nuevo en cada renovación, porque es la única forma de medir
 * JWT_SESION_MAX_HORAS (72h por omisión, el techo absoluto) contra el
 * inicio real de la sesión y no contra la última renovación — si no,
 * alguien con un token robado podría renovarlo indefinidamente cada
 * 7h59 sin tocar jamás el techo. `ini` es un claim propio, NO el `iat`
 * estándar del JWT: jsonwebtoken reescribe `iat` en cada sign() y la
 * opción pensada para fijarlo a mano (`noTimestamp`) en realidad lo
 * BORRA del payload en vez de respetar el valor dado — se descubrió con
 * una prueba que fallaba, no por lectura de la documentación.
 * `tv` (token_version) viaja en el payload desde el login y en cada
 * renovación; el middleware lo compara contra usuarios.token_version en
 * cada petición (ver auth.middleware.js) — es lo que permite revocar una
 * sesión sin esperar a que el token expire solo.
 * ─────────────────────────────────────────────────────────────────
 */
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('../db/pool');
const { inactividadSegundos, sesionMaxSegundos } = require('../utils/sesion');

function expiraEnISO(segundosDesdeAhora) {
  return new Date(Date.now() + segundosDesdeAhora * 1000).toISOString();
}

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

    // `tv` y `ini` — ver la nota técnica arriba del archivo.
    const tokenPayload = {
      id: usuario.id,
      correo: usuario.correo,
      rol: usuario.rol,
      id_dg: usuario.id_dg,
      id_direccion_area: usuario.id_direccion_area,
      nombre_completo: usuario.nombre_completo,
      tv: usuario.token_version || 0,
      ini: Math.floor(Date.now() / 1000)
    };

    // Vigencia por inactividad leída de JWT_INACTIVIDAD_HORAS (documentada
    // en README.md junto a las demás variables de entorno), 8h por omisión
    // si la variable no está definida o no es válida.
    const segundos = inactividadSegundos();
    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
      expiresIn: segundos
    });

    // Devolver token y datos del usuario (sin password_hash)
    res.json({
      datos: {
        token,
        expiraEn: expiraEnISO(segundos),
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

// POST /auth/renovar — Cambia un token vigente por uno nuevo con el reloj
// de inactividad reiniciado. Montado detrás de verificarToken (ver
// auth.routes.js), así que un token expirado, con firma inválida o de una
// sesión ya revocada nunca llega aquí — responde 401 antes, con el mismo
// código que cualquier otra ruta protegida. Lo único que se valida AQUÍ es
// el techo absoluto: pasado JWT_SESION_MAX_HORAS desde `ini` (el inicio
// real de la sesión, no la última renovación — ver la nota técnica arriba
// del archivo), la renovación se niega y hay que volver a entrar.
async function renovarToken(req, res, next) {
  try {
    const edadSesionSegundos = Math.floor(Date.now() / 1000) - req.sesionMeta.inicioSesion;
    if (edadSesionSegundos > sesionMaxSegundos()) {
      return res.status(401).json({
        error: true,
        mensaje: 'La sesión alcanzó su tiempo máximo, inicia sesión de nuevo',
        codigo: 'AUTH_SESSION_MAX_AGE'
      });
    }

    const segundos = inactividadSegundos();
    const token = jwt.sign(
      {
        id: req.usuario.id,
        correo: req.usuario.correo,
        rol: req.usuario.rol,
        id_dg: req.usuario.id_dg,
        id_direccion_area: req.usuario.id_direccion_area,
        nombre_completo: req.usuario.nombre_completo,
        tv: req.sesionMeta.tokenVersion,
        ini: req.sesionMeta.inicioSesion
      },
      process.env.JWT_SECRET,
      { expiresIn: segundos }
    );

    res.json({ datos: { token, expiraEn: expiraEnISO(segundos) } });
  } catch (err) {
    next(err);
  }
}

// POST /auth/activar-cuenta — Establece password usando token de activación
async function activarCuenta(req, res, next) {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ error: true, mensaje: 'token y password son requeridos' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: true, mensaje: 'La contraseña debe tener al menos 8 caracteres' });
    }

    const { rows } = await pool.query(
      `SELECT ta.id, ta.id_usuario, ta.expira_en, ta.usado
       FROM tokens_activacion ta
       WHERE ta.token = $1`,
      [token]
    );
    const ta = rows[0];
    if (!ta) return res.status(404).json({ error: true, mensaje: 'Token inválido o no encontrado' });
    if (ta.usado) return res.status(400).json({ error: true, mensaje: 'Este enlace ya fue utilizado' });
    if (new Date(ta.expira_en) < new Date()) return res.status(400).json({ error: true, mensaje: 'El enlace ha expirado' });

    const hash = await bcrypt.hash(password, 10);
    // token_version + 1 revoca cualquier sesión que hubiera quedado abierta
    // con la contraseña anterior (ver auth.middleware.js).
    await pool.query('UPDATE usuarios SET password_hash = $1, token_version = token_version + 1 WHERE id = $2', [hash, ta.id_usuario]);
    await pool.query('UPDATE tokens_activacion SET usado = true WHERE id = $1', [ta.id]);

    res.json({ mensaje: 'Contraseña establecida correctamente. Ya puedes iniciar sesión.' });
  } catch (err) { next(err); }
}

// POST /auth/solicitar-recuperacion — { correo }
// Responde SIEMPRE el mismo mensaje genérico exista o no la cuenta, para no
// filtrar qué correos están registrados. Como el backend no tiene un mailer
// propio (los correos de activación ya se mandan desde el navegador vía
// EmailJS, ver AdminCatalogos.jsx#enviarCorreoInvitacion), este endpoint
// también le regresa al frontend los datos para que él dispare el envío —
// pero solo cuando el usuario sí existe (campo `enviar`).
async function solicitarRecuperacion(req, res, next) {
  const MENSAJE_GENERICO = 'Si el correo está registrado, recibirás un enlace de recuperación en los próximos minutos.';
  try {
    const { correo } = req.body;
    if (!correo) {
      return res.status(400).json({ error: true, mensaje: 'El correo es requerido' });
    }

    const { rows } = await pool.query(
      'SELECT id, nombre_completo, correo FROM usuarios WHERE correo = $1 AND activo = true',
      [correo]
    );
    const usuario = rows[0];

    if (!usuario) {
      return res.json({ mensaje: MENSAJE_GENERICO, enviar: false });
    }

    const token = crypto.randomBytes(48).toString('hex');
    await pool.query(
      `INSERT INTO tokens_activacion (id_usuario, token, expira_en, tipo)
       VALUES ($1, $2, NOW() + INTERVAL '4 hours', 'recuperacion')`,
      [usuario.id, token]
    );

    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const reset_link = `${baseUrl}/restablecer-contrasena?token=${token}`;

    res.json({
      mensaje: MENSAJE_GENERICO,
      enviar: true,
      nombre: usuario.nombre_completo,
      correo: usuario.correo,
      reset_link,
    });
  } catch (err) { next(err); }
}

// GET /auth/validar-token-recuperacion?token=X
async function validarTokenRecuperacion(req, res, next) {
  try {
    const { token } = req.query;
    if (!token) return res.json({ valid: false });

    const { rows } = await pool.query(
      `SELECT u.nombre_completo
       FROM tokens_activacion ta
       JOIN usuarios u ON u.id = ta.id_usuario
       WHERE ta.token = $1 AND ta.tipo = 'recuperacion' AND ta.usado = false AND ta.expira_en > NOW()`,
      [token]
    );
    if (!rows[0]) return res.json({ valid: false });

    res.json({ valid: true, nombre: rows[0].nombre_completo });
  } catch (err) { next(err); }
}

// POST /auth/restablecer-contrasena — { token, nueva_contrasena }
async function restablecerContrasena(req, res, next) {
  try {
    const { token, nueva_contrasena } = req.body;
    if (!token || !nueva_contrasena) {
      return res.status(400).json({ error: true, mensaje: 'token y nueva_contrasena son requeridos' });
    }
    if (nueva_contrasena.length < 8) {
      return res.status(400).json({ error: true, mensaje: 'La contraseña debe tener al menos 8 caracteres' });
    }

    const { rows } = await pool.query(
      `SELECT id, id_usuario FROM tokens_activacion
       WHERE token = $1 AND tipo = 'recuperacion' AND usado = false AND expira_en > NOW()`,
      [token]
    );
    const ta = rows[0];
    if (!ta) {
      return res.status(400).json({ error: true, mensaje: 'El enlace ha expirado o ya fue utilizado. Solicita uno nuevo.' });
    }

    const hash = await bcrypt.hash(nueva_contrasena, 10);
    // token_version + 1 revoca cualquier sesión que hubiera quedado abierta
    // con la contraseña anterior (ver auth.middleware.js) — relevante en
    // particular aquí: restablecer-contrasena es el flujo de "me robaron
    // la cuenta", así que una sesión ya abierta por quien sea no debe
    // sobrevivir al cambio.
    await pool.query('UPDATE usuarios SET password_hash = $1, token_version = token_version + 1 WHERE id = $2', [hash, ta.id_usuario]);
    await pool.query('UPDATE tokens_activacion SET usado = true WHERE id = $1', [ta.id]);

    res.json({ mensaje: 'Contraseña actualizada correctamente.' });
  } catch (err) { next(err); }
}

// GET /auth/config-correo — público (sin token), espejo de
// GET /admin/config/publico pero alcanzable ANTES de iniciar sesión, para
// que /solicitar-recuperacion pueda enviar el correo vía EmailJS. Prioriza
// el template de recuperación si está configurado; si no, reusa el de
// activación (mismo servicio/llave — no es una llave secreta, EmailJS la
// diseñó para vivir en el navegador).
async function obtenerConfigCorreoPublico(req, res, next) {
  try {
    const claves = ['emailjs_service_id', 'emailjs_template_id', 'emailjs_template_id_recuperacion', 'emailjs_public_key', 'emailjs_enabled'];
    const { rows } = await pool.query(
      'SELECT clave, valor FROM configuracion_sistema WHERE clave = ANY($1)', [claves]
    );
    const cfg = Object.fromEntries(rows.map(r => [r.clave, r.valor]));
    res.json({
      datos: {
        emailjs_service_id: cfg.emailjs_service_id,
        emailjs_template_id: cfg.emailjs_template_id_recuperacion || cfg.emailjs_template_id,
        emailjs_public_key: cfg.emailjs_public_key,
        emailjs_enabled: cfg.emailjs_enabled,
      },
    });
  } catch (err) { next(err); }
}

module.exports = {
  login,
  obtenerUsuarioActual,
  renovarToken,
  activarCuenta,
  solicitarRecuperacion,
  validarTokenRecuperacion,
  restablecerContrasena,
  obtenerConfigCorreoPublico,
};
