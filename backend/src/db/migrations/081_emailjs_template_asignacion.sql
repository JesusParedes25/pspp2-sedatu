-- 081_emailjs_template_asignacion.sql
-- PROPÓSITO: Clave de configuración para el correo que avisa a alguien que
-- YA TIENE CUENTA que fue asignado como responsable/colaborador de un
-- proyecto o de un nodo (etapa/acción/tarea) — distinto del correo de
-- invitación a usuarios nuevos (emailjs_template_id, usado para activar
-- cuenta) y del de recuperación de contraseña (emailjs_template_id_recuperacion,
-- migración 041). Mismo patrón: el identificador del template en EmailJS lo
-- crea el administrador desde el panel (Configuración) y nunca se escribe
-- en el código — ver auditoria.controller.js/AdminCatalogos.jsx, que solo
-- leen esta clave de configuracion_sistema.
INSERT INTO configuracion_sistema (clave, descripcion) VALUES
  ('emailjs_template_id_asignacion', 'ID del template de EmailJS para avisar a un usuario YA EXISTENTE que fue asignado a un proyecto o nodo (responsable/colaborador) — distinto del template de invitación a cuenta nueva')
ON CONFLICT (clave) DO NOTHING;
