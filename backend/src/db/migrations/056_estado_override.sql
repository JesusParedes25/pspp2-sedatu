-- Migración 056: estado_override — mismo patrón que avance_override /
-- semaforo_override (migración 024): cuando es TRUE, el estatus del nodo
-- lo fija el usuario y el recálculo automático deja de sobreescribirlo.
-- Extiende esa capacidad a contenedores (Etapa, Acción-contenedor) y a
-- Proyecto, que antes tenían el campo `estado` bloqueado para edición
-- manual (rechazado explícitamente por cambiarEstado()) o, en el caso de
-- Proyecto, nunca recalculado en absoluto.
-- Idempotente: usa DO $$ con IF NOT EXISTS.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='etapas' AND column_name='estado_override') THEN
    ALTER TABLE etapas ADD COLUMN estado_override BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='acciones' AND column_name='estado_override') THEN
    ALTER TABLE acciones ADD COLUMN estado_override BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='proyectos' AND column_name='estado_override') THEN
    ALTER TABLE proyectos ADD COLUMN estado_override BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END$$;
