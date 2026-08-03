-- ═══════════════════════════════════════════════════════════════
-- PSPP v2.0 — Migración 046: Backfill de creadores como 'responsable'
--
-- La migración 030 (proyecto_usuarios) migró a los creadores existentes
-- en ese momento como 'responsable', pero crearProyecto() nunca quedó
-- actualizada para insertar esa misma fila en cada proyecto nuevo. Todo
-- proyecto creado después de la migración 030 quedó sin responsable en
-- proyecto_usuarios, por lo que su creador no podía invitar a nadie más
-- (el check de permisos puedeInvitar/puedeGestionar solo mira esa tabla).
--
-- Esta migración repite el mismo backfill para cerrar el hueco en los
-- proyectos existentes. Es idempotente (ON CONFLICT DO NOTHING) — no
-- toca ninguna fila que ya exista en proyecto_usuarios.
-- ═══════════════════════════════════════════════════════════════

INSERT INTO proyecto_usuarios (id_proyecto, id_usuario, rol, aceptado_en)
SELECT p.id, p.id_creador, 'responsable', NOW()
FROM proyectos p
WHERE p.id_creador IS NOT NULL AND p.deleted_at IS NULL
ON CONFLICT (id_proyecto, id_usuario) DO NOTHING;
