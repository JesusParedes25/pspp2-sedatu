-- Migración 059: asignación de responsable de un riesgo, con aceptar/
-- declinar — misma idea que la invitación a un proyecto (051), pero para
-- un riesgo: quien reporta o edita un riesgo propone un responsable, esa
-- persona acepta o declina, y la respuesta le llega de vuelta a quien
-- propuso. Un riesgo tiene un solo responsable a la vez (a diferencia de
-- solicitudes_participacion, que necesita conservar muchas filas
-- históricas), así que el seguimiento va directo en la fila del riesgo —
-- igual que 051 hizo con proyecto_usuarios/nodo_miembros en vez de crear
-- una tabla aparte.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='riesgos' AND column_name='id_asignado_por') THEN
    ALTER TABLE riesgos ADD COLUMN id_asignado_por UUID REFERENCES usuarios(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='riesgos' AND column_name='estado_responsable') THEN
    ALTER TABLE riesgos ADD COLUMN estado_responsable VARCHAR(12);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='riesgos' AND column_name='motivo_rechazo') THEN
    ALTER TABLE riesgos ADD COLUMN motivo_rechazo TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='riesgos' AND column_name='respondido_en') THEN
    ALTER TABLE riesgos ADD COLUMN respondido_en TIMESTAMP;
  END IF;
END$$;

-- NULL = sin responsable asignado (id_responsable también NULL). Con
-- responsable, es 'pendiente' hasta que responde, salvo que se haya
-- asignado a sí mismo (nadie necesita aceptar su propia asignación) — ese
-- caso lo resuelve la aplicación escribiendo 'aceptada' directamente.
ALTER TABLE riesgos DROP CONSTRAINT IF EXISTS riesgos_estado_responsable_check;
ALTER TABLE riesgos ADD CONSTRAINT riesgos_estado_responsable_check
  CHECK (estado_responsable IN ('pendiente', 'aceptada', 'rechazada') OR estado_responsable IS NULL);

-- Dos tipos de notificación más, mismo patrón que Solicitud/RespuestaSolicitud.
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
    'AsignacionRiesgo',          -- te asignaron como responsable de un riesgo
    'RespuestaAsignacionRiesgo'  -- respondieron la asignación que propusiste
  ));
