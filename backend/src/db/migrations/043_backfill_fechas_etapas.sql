-- ═══════════════════════════════════════════════════════════════
-- PSPP v2.0 — Migración 043: Recalcular fecha_inicio/fecha_fin de
-- etapas considerando también las tareas (no solo las acciones
-- directas de primer nivel).
--
-- recalcularEtapa() (utils/recalculos.js) solo miraba las acciones
-- directas de la etapa para calcular sus fechas. Si un equipo captura
-- fecha_inicio/fecha_fin a nivel tarea (o en subacciones) y nunca en
-- la acción contenedora, la etapa se quedaba sin fechas — por eso no
-- aparecían barras en el Cronograma aunque sí hubiera fechas
-- capturadas más abajo en el árbol.
--
-- Este backfill es de una sola vez: recalcula fecha_inicio/fecha_fin
-- de TODAS las etapas con la lógica corregida (ya aplicada en el
-- código para los próximos recálculos). Solo escribe estas dos
-- columnas — no toca avance, estado, semáforo ni ningún otro dato.
-- IDEMPOTENTE: recalcular de nuevo produce el mismo resultado.
-- ═══════════════════════════════════════════════════════════════

UPDATE etapas e SET
  fecha_inicio = agg.fecha_inicio,
  fecha_fin = agg.fecha_fin
FROM (
  SELECT id_etapa, MIN(fi) AS fecha_inicio, MAX(ff) AS fecha_fin
  FROM (
    SELECT id_etapa, fecha_inicio AS fi, fecha_fin AS ff
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
