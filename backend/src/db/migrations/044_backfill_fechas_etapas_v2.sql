-- ═══════════════════════════════════════════════════════════════
-- PSPP v2.0 — Migración 044: Recalcular fecha_inicio/fecha_fin de
-- etapas (v2) — ahora sí considerando fecha_limite.
--
-- La migración 043 ya corrigió que se mirara hasta el nivel tarea,
-- pero seguía usando acciones.fecha_fin directo. El campo "Vence"
-- que se edita desde la tarjeta de nodo (NodoCard) escribe en
-- fecha_limite, NO en fecha_fin — así que cualquier acción cuya
-- fecha de fin se haya capturado únicamente por ahí seguía sin
-- contarse. Este backfill usa COALESCE(fecha_limite, fecha_fin),
-- el mismo criterio que ya usa el resto de la app (p.ej. semáforo).
--
-- Solo escribe fecha_inicio/fecha_fin de etapas — no toca avance,
-- estado, semáforo ni ningún otro dato.
-- IDEMPOTENTE: recalcular de nuevo produce el mismo resultado.
-- ═══════════════════════════════════════════════════════════════

UPDATE etapas e SET
  fecha_inicio = agg.fecha_inicio,
  fecha_fin = agg.fecha_fin
FROM (
  SELECT id_etapa, MIN(fi) AS fecha_inicio, MAX(ff) AS fecha_fin
  FROM (
    SELECT id_etapa, fecha_inicio AS fi, COALESCE(fecha_limite, fecha_fin) AS ff
    FROM acciones
    WHERE estado != 'Cancelada' AND id_etapa IS NOT NULL

    UNION ALL

    SELECT a.id_etapa, t.fecha_inicio AS fi, t.fecha_limite AS ff
    FROM tareas t
    JOIN acciones a ON a.id = t.id_accion
    WHERE t.estado != 'Cancelada' AND a.id_etapa IS NOT NULL
  ) todas
  GROUP BY id_etapa
) agg
WHERE e.id = agg.id_etapa;
