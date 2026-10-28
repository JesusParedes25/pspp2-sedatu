-- ═══════════════════════════════════════════════════════════════
-- PSPP v2.0 — Migración 084: Historial de movimientos de indicadores
--
-- Hasta ahora capturar un valor era un UPDATE que pisaba el anterior — si
-- alguien ponía 150 y al día siguiente 180, el 150 desaparecía para
-- siempre. `indicador_movimientos` es de SOLO INSERCIÓN: cada captura
-- (manual o generada por completar/avanzar una actividad vinculada)
-- queda como una fila propia, y `indicadores.valor_actual` pasa a ser la
-- SUMA de los movimientos no anulados — ver utils/indicador-movimientos.js.
--
-- Aditiva, no destructiva:
--   · `indicadores.valor_actual` SE QUEDA (la leen Tablero, carteras,
--     panorama, tarjetas y /publico/indicadores) — solo cambia cómo se
--     calcula, nunca se quita la columna.
--   · `indicador_metas_anuales` e `indicador_categorias` NO se tocan.
--   · Nadie pierde nada de lo ya capturado: la migración de datos
--     existentes (backfill a `indicador_movimientos` con origen
--     'migracion') vive en la migración 085, después de que production
--     corrió la verificación de "foto previa" (ver docs del PR).
--
-- Anular un movimiento no lo borra (`anulado_en`/`anulado_por`/
-- `motivo_anulacion`) — mismo patrón ya usado por riesgos y evidencias en
-- esta plataforma: el registro queda visible, tachado, nunca desaparece.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS indicador_movimientos (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_indicador    UUID NOT NULL REFERENCES indicadores(id) ON DELETE CASCADE,
  -- Puede ser negativa: una corrección o un retroceso de avance proporcional
  -- restan en vez de sumar, en vez de editar la fila de otro día.
  cantidad        NUMERIC NOT NULL,
  fecha           DATE NOT NULL DEFAULT CURRENT_DATE,
  origen          VARCHAR(20) NOT NULL
                  CHECK (origen IN ('actividad', 'manual', 'migracion')),
  -- UUID de la etapa/acción/tarea que generó el movimiento (origen=
  -- 'actividad'). NULL para 'manual'/'migracion'. Deliberadamente sin
  -- columna de tipo aparte: el id es UUID globalmente único entre
  -- etapas/acciones/tareas, así que resolver a cuál tabla pertenece es un
  -- LEFT JOIN triple por id (mismo patrón ya usado en
  -- aportaciones.queries.js::listarPorIndicador), sin necesidad de
  -- guardar el tipo por separado.
  id_nodo_origen  UUID NULL,
  nota            TEXT NULL,
  creado_por      UUID REFERENCES usuarios(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Anular en vez de borrar.
  anulado_en      TIMESTAMPTZ NULL,
  anulado_por     UUID REFERENCES usuarios(id),
  motivo_anulacion TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_indicador_movimientos_indicador
  ON indicador_movimientos (id_indicador) WHERE anulado_en IS NULL;

-- Para la suma acumulada de UN nodo hacia UN indicador (algoritmo de
-- "diferencia contra lo ya acumulado" de aportaciones proporcionales) y
-- para el "mismo nodo, mismo día" que agrupa varios ajustes de avance en
-- una sola fila en vez de decenas de movimientos minúsculos.
CREATE INDEX IF NOT EXISTS idx_indicador_movimientos_nodo_fecha
  ON indicador_movimientos (id_indicador, id_nodo_origen, fecha)
  WHERE anulado_en IS NULL AND id_nodo_origen IS NOT NULL;

-- ─── Aportaciones que hoy apuntan a una categoría ─────────────────────
-- Con las categorías retirándose del flujo vivo (ver Bloque 1 del
-- encargo), las aportaciones que elegían una categoría específica pasan a
-- apuntar al indicador completo — ninguna queda huérfana. No se borra
-- ninguna fila, solo se limpia la referencia a id_categoria.
-- indicador_categorias en sí NO se toca (sigue intacta, como pide 9.4).
UPDATE indicador_aportaciones SET id_categoria = NULL WHERE id_categoria IS NOT NULL;
