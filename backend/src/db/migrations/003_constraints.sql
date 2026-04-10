-- ═══════════════════════════════════════════════════════════════
-- PSPP v2.0 — Migración 003: Constraints adicionales
-- Restricciones de negocio que no se pueden expresar con CHECK simples.
-- ═══════════════════════════════════════════════════════════════

-- Asegurar que fecha_fin >= fecha_inicio en acciones
ALTER TABLE acciones
  ADD CONSTRAINT chk_acciones_fechas
  CHECK (fecha_fin >= fecha_inicio);

-- Asegurar que fecha_limite >= fecha_inicio en proyectos (si ambas existen)
ALTER TABLE proyectos
  ADD CONSTRAINT chk_proyectos_fechas
  CHECK (fecha_limite IS NULL OR fecha_inicio IS NULL OR fecha_limite >= fecha_inicio);

-- Asegurar que porcentaje esté entre 0 y 100 en acciones
ALTER TABLE acciones
  ADD CONSTRAINT chk_acciones_porcentaje
  CHECK (porcentaje_avance >= 0 AND porcentaje_avance <= 100);

-- Asegurar que porcentaje calculado esté entre 0 y 100 en etapas
ALTER TABLE etapas
  ADD CONSTRAINT chk_etapas_porcentaje
  CHECK (porcentaje_calculado >= 0 AND porcentaje_calculado <= 100);

-- Asegurar que porcentaje calculado esté entre 0 y 100 en proyectos
ALTER TABLE proyectos
  ADD CONSTRAINT chk_proyectos_porcentaje
  CHECK (porcentaje_calculado >= 0 AND porcentaje_calculado <= 100);
