-- Migración 089: correo por SMTP del lado del servidor, se retira EmailJS
--
-- El envío de correo deja de ser un botón del navegador (EmailJS) y pasa a
-- ser un relevo SMTP que el backend llama directamente (ver
-- backend/src/utils/correo.js, configurado por las variables SMTP_* /
-- CORREO_REMITENTE* — deploy/README.md). configuracion_sistema solo guardó,
-- desde que se creó (migración 031), las credenciales de las dos cuentas de
-- EmailJS (invitación/recuperación y asignación de participación, migraciones
-- 031/041/081/082) — confirmado por grep que ningún código del backend ni del
-- frontend queda leyéndola o escribiéndola una vez retirado EmailJS, así que
-- se elimina por completo y no solo sus filas.
--
-- Idempotente: si la tabla ya no existe (migración ya corrida), no hace nada.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'configuracion_sistema') THEN
    DROP TABLE configuracion_sistema;
  END IF;
END $$;
