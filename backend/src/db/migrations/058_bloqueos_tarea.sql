-- Migración 058: agrega 'Tarea' al catálogo de entidad_tipo de bloqueos.
-- Tarea ahora pasa por cambiarEstado()/validaciones-estado.js igual que
-- Proyecto/Etapa/Accion/Subaccion (parte 3 del modelo de estatus) — al
-- bloquearla, crearBloqueo() intenta insertar entidad_tipo='Tarea', que
-- el CHECK original (migración 012) no contemplaba.
-- Mismo patrón que 013_riesgos_subaccion.sql (agregar un valor a un CHECK
-- existente): DROP + ADD con el catálogo ampliado.

ALTER TABLE bloqueos DROP CONSTRAINT IF EXISTS bloqueos_entidad_tipo_check;
ALTER TABLE bloqueos ADD CONSTRAINT bloqueos_entidad_tipo_check CHECK (
  entidad_tipo IN ('Proyecto','Subproyecto','Etapa','Accion','Subaccion','Tarea')
);
