-- Migración 060: tipo de notificación para cuando a alguien lo quitan de
-- un proyecto o de una etapa/acción/tarea puntual. Antes de esto, quitar a
-- un participante (DELETE /proyectos/:id/miembros/:userId o
-- DELETE .../miembros-nodo/:userId) no le avisaba nada a esa persona — se
-- quedaba sin acceso sin enterarse por qué. Mismo patrón que las demás
-- migraciones que agregan un tipo: extender el CHECK de notificaciones.

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
    'RetiroParticipante'  -- te quitaron del proyecto, o de una etapa/acción/tarea
  ));
