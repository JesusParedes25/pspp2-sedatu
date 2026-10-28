-- Migración 085: tipo de notificación para cuando alguien sin permiso de
-- alta en el catálogo de indicadores (rol 'externo') pide que se agregue
-- uno — ver catalogo-indicadores.controller.js::solicitar(). Antes ese
-- intento solo recibía un 403 sin ninguna salida. Mismo patrón que las
-- demás migraciones que agregan un tipo: extender el CHECK de
-- notificaciones (ver 060_notificacion_retiro.sql).

ALTER TABLE notificaciones DROP CONSTRAINT IF EXISTS notificaciones_tipo_check;

ALTER TABLE notificaciones ADD CONSTRAINT notificaciones_tipo_check
  CHECK (tipo IN (
    'Vencimiento',
    'Inactividad',
    'Riesgo',
    'Comentario',
    'MencionUsuario',
    'PermisoNuevo',
    'AccionBloqueada',
    'AvanceDG',
    'Invitacion',
    'RespuestaInvitacion',
    'Solicitud',
    'RespuestaSolicitud',
    'AsignacionRiesgo',
    'RespuestaAsignacionRiesgo',
    'RetiroParticipante',
    'SolicitudIndicador'  -- alguien sin permiso de alta pidió un indicador nuevo del catálogo
  ));
