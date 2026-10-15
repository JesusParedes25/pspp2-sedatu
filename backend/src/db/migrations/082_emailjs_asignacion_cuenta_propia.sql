-- 082_emailjs_asignacion_cuenta_propia.sql
-- PROPÓSITO: el correo de "asignación de participación" (migración 081)
-- reusaba el service_id y el public_key de la cuenta de EmailJS de
-- "invitación a la plataforma" — mezclando credenciales entre dos
-- plantillas distintas. Decisión de producto: cada plantilla vive en su
-- propia cuenta de EmailJS (el plan gratuito da 2 plantillas por cuenta;
-- dos cuentas separadas dan 4 en total), así que cada una necesita su
-- trío COMPLETO e INDEPENDIENTE de credenciales — service_id,
-- template_id y public_key — sin heredar nada de la otra.
--
-- Esta migración retira la clave única de la 081
-- (emailjs_template_id_asignacion) y la reemplaza por un trío propio.
-- El valor que ya tuviera capturado (si lo hubiera) se migra al nuevo
-- campo de template_id — nunca se pierde ni hay que volver a
-- escribirlo a mano.
INSERT INTO configuracion_sistema (clave, descripcion) VALUES
  ('emailjs_asignacion_service_id', 'Service ID en EmailJS para el correo de asignación de participación (cuenta de EmailJS propia, independiente de la de invitación)'),
  ('emailjs_asignacion_template_id', 'Template ID en EmailJS para el correo de asignación de participación'),
  ('emailjs_asignacion_public_key', 'Public Key (User ID) en EmailJS para el correo de asignación de participación')
ON CONFLICT (clave) DO NOTHING;

UPDATE configuracion_sistema AS nuevo
SET valor = viejo.valor
FROM configuracion_sistema AS viejo
WHERE nuevo.clave = 'emailjs_asignacion_template_id'
  AND viejo.clave = 'emailjs_template_id_asignacion'
  AND nuevo.valor IS NULL
  AND viejo.valor IS NOT NULL;

DELETE FROM configuracion_sistema WHERE clave = 'emailjs_template_id_asignacion';
