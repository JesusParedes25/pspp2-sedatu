-- 041_recuperar_contrasena.sql
-- PROPÓSITO: Soporte para el flujo de "recuperar contraseña", reutilizando
-- la tabla tokens_activacion (en vez de crear una tabla nueva). La columna
-- `tipo` distingue un token de activación de cuenta ('activacion', default,
-- retrocompatible con las filas existentes) de uno de recuperación de
-- contraseña ('recuperacion').

ALTER TABLE tokens_activacion ADD COLUMN IF NOT EXISTS tipo VARCHAR(20) NOT NULL DEFAULT 'activacion';

-- Clave opcional de configuración: si el admin configura un template de
-- EmailJS distinto para el correo de recuperación (con el asunto/cuerpo
-- correctos), se usa ese; si la deja vacía, se reutiliza emailjs_template_id
-- (el mismo de activación) — ver auth.controller.js#obtenerConfigCorreoPublico.
INSERT INTO configuracion_sistema (clave, descripcion) VALUES
  ('emailjs_template_id_recuperacion', 'ID del template de recuperación de contraseña en EmailJS (opcional; si se deja vacío se reutiliza emailjs_template_id)')
ON CONFLICT (clave) DO NOTHING;
