-- ═══════════════════════════════════════════════════════════════
-- PSPP v2.0 — Migración 013: Ampliar riesgos para subacciones
--
-- Agrega 'Subaccion' al CHECK constraint de riesgos.entidad_tipo
-- para permitir riesgos a nivel de subacción, completando la
-- cobertura de los 4 niveles jerárquicos.
-- ═══════════════════════════════════════════════════════════════

-- 1. Eliminar constraint antiguo
ALTER TABLE riesgos DROP CONSTRAINT IF EXISTS riesgos_entidad_tipo_check;

-- 2. Recrear con 'Subaccion' incluido
ALTER TABLE riesgos ADD CONSTRAINT riesgos_entidad_tipo_check CHECK (
  entidad_tipo IN ('Proyecto','Subproyecto','Etapa','Accion','Subaccion')
);
