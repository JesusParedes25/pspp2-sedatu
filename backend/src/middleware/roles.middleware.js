/**
 * ARCHIVO: roles.middleware.js
 * PROPÓSITO: Restringir acceso a rutas según el rol del usuario autenticado.
 *
 * MINI-CLASE: Autorización basada en roles (RBAC)
 * ─────────────────────────────────────────────────────────────────
 * Autenticación = "¿quién eres?" (lo resuelve auth.middleware.js).
 * Autorización = "¿puedes hacer esto?" (lo resuelve este archivo).
 * Los 4 roles de PSPP son jerárquicos:
 *   Ejecutivo > Directivo > Responsable > Operativo
 * requiereRol(['Ejecutivo','Directivo']) genera un middleware que
 * solo deja pasar a esos roles y rechaza al resto con 403.
 * ─────────────────────────────────────────────────────────────────
 */

// Genera un middleware que solo permite los roles especificados
function requiereRol(rolesPermitidos) {
  return (req, res, next) => {
    // req.usuario fue adjuntado por auth.middleware.js
    if (!req.usuario) {
      return res.status(401).json({
        error: true,
        mensaje: 'No autenticado',
        codigo: 'AUTH_REQUIRED'
      });
    }

    if (!rolesPermitidos.includes(req.usuario.rol)) {
      return res.status(403).json({
        error: true,
        mensaje: `Acceso denegado. Se requiere rol: ${rolesPermitidos.join(' o ')}`,
        codigo: 'FORBIDDEN_ROLE'
      });
    }

    next();
  };
}

module.exports = { requiereRol };
