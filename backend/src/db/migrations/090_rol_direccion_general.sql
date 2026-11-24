-- ═══════════════════════════════════════════════════════════════
-- Migración 090: rol nuevo 'direccion_general' (paso 15 DGTIC)
--
-- Jerarquía institucional: una Dirección General contiene varias
-- Direcciones de Área. 'direccion' (Director/a de Área) ve los proyectos
-- de su propia área; 'direccion_general' (Director/a General) ve los de
-- TODAS las áreas de su Dirección General — mismo criterio de "bono de
-- DG" que ya usa 'direccion' hoy (comparar proyectos.id_dg_lider contra
-- usuario.id_dg), tope en 'lectura', nunca edición automática (ver
-- utils/funcion-efectiva.js, vía 'direccion_general_dg', y
-- utils/alcanceProyectos.js).
--
-- Los campos id_dg/id_direccion_area de `usuarios` ya existen desde la
-- migración 001 — este rol no necesita ninguna columna nueva, solo
-- ampliar el CHECK de valores permitidos.
--
-- IDEMPOTENTE: seguro de ejecutar múltiples veces.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'usuarios_rol_check') THEN
    ALTER TABLE usuarios ADD CONSTRAINT usuarios_rol_check
      CHECK (rol IN ('superadmin', 'ejecutivo', 'direccion_general', 'direccion', 'enlace', 'externo'));
  END IF;
END$$;
