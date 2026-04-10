-- ═══════════════════════════════════════════════════════════════════
-- MIGRACIÓN 009: Agregar 'Subaccion' al CHECK constraint de comentarios
-- ═══════════════════════════════════════════════════════════════════
-- Las subacciones ahora tienen hilo de discusión. Se necesita que
-- la columna entidad_tipo acepte 'Subaccion' como valor válido
-- además de los existentes: Proyecto, Subproyecto, Etapa, Accion, Riesgo.
-- ═══════════════════════════════════════════════════════════════════

-- 1. Eliminar constraint antiguo
ALTER TABLE comentarios DROP CONSTRAINT IF EXISTS comentarios_entidad_tipo_check;

-- 2. Recrear con 'Subaccion' incluido
ALTER TABLE comentarios ADD CONSTRAINT comentarios_entidad_tipo_check CHECK (
  entidad_tipo IN ('Proyecto','Subproyecto','Etapa','Accion','Riesgo','Subaccion')
);
