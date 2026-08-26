-- Migración 061: permite riesgos a nivel Tarea. El modelo polimórfico de
-- riesgos (entidad_tipo + entidad_id) nunca incluyó Tarea — quedó como
-- hueco deliberado (ver CLAUDE.md) mientras Tarea reportaba riesgos por un
-- cuadro de texto rápido que caía al stream `actividad` en vez de a esta
-- tabla, sin nivel/responsable/aceptar-declinar. Ahora Tarea usa el mismo
-- ModalRiesgo que Etapa/Acción, así que necesita el mismo soporte de datos.

ALTER TABLE riesgos DROP CONSTRAINT IF EXISTS riesgos_entidad_tipo_check;
ALTER TABLE riesgos ADD CONSTRAINT riesgos_entidad_tipo_check CHECK (
  entidad_tipo IN ('Proyecto','Subproyecto','Etapa','Accion','Subaccion','Tarea')
);
