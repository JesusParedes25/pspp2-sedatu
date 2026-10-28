-- Migración 086: siembra inicial del historial de movimientos
-- (indicador_movimientos, migración 084) a partir de lo ya capturado en
-- la versión anterior.
--
-- Bloque 9 de la "Versión final de Indicadores" — gateada explícitamente
-- en los números medidos en producción antes de escribirla: 22
-- indicadores activos (17 Simple, 3 Anual, 2 Categorías) e
-- indicador_metas_anuales con CERO filas con valor distinto de cero (así
-- que los 3 Anuales se tratan igual que los Simple — un solo total, sin
-- nada escondido por periodo que migrar).
--
-- Regla por tipo:
--   - Simple / Anual (9.1 / 9.2): un movimiento con indicadores.valor_actual.
--   - Categorías (9.3): un movimiento con la SUMA DE LOS VALORES reales de
--     cada categoría (indicador_categorias.valor_actual) — NUNCA
--     indicadores.valor_actual directo ni la suma de metas. Esto importa:
--     un indicador puede tener una categoría con valor 90,000 contra una
--     meta de 80,000, y el total migrado debe reflejar los 90,000 reales.
--     El desglose completo por categoría queda en la nota del movimiento,
--     como registro legible de dónde salió el número.
--
-- NUNCA toca indicador_metas_anuales/indicador_categorias — solo se LEEN
-- para construir la nota de categorías. Solo INSERTA en
-- indicador_movimientos. Idempotente: un indicador con ya un movimiento
-- origen='migracion' no se vuelve a procesar (seguro ante un
-- `npm run migrate` repetido).

DO $$
DECLARE
  fila RECORD;
  total_categorias NUMERIC;
  categorias_texto TEXT;
  monto NUMERIC;
BEGIN
  FOR fila IN
    SELECT i.id, i.valor_actual, i.updated_at, i.composicion
      FROM indicadores i
     WHERE i.activo = true
       AND NOT EXISTS (
         SELECT 1 FROM indicador_movimientos m
          WHERE m.id_indicador = i.id AND m.origen = 'migracion'
       )
  LOOP
    IF fila.composicion = 'Categorias' THEN
      SELECT COALESCE(SUM(c.valor_actual), 0),
             string_agg(format('%s: %s', c.nombre, COALESCE(c.valor_actual, 0)), ', ' ORDER BY c.orden)
        INTO total_categorias, categorias_texto
        FROM indicador_categorias c
       WHERE c.id_indicador = fila.id;

      monto := total_categorias;
      IF monto > 0 THEN
        INSERT INTO indicador_movimientos (id_indicador, cantidad, fecha, origen, nota)
        VALUES (
          fila.id, monto, fila.updated_at::date, 'migracion',
          'Valor migrado de la versión anterior (no es una fecha de corte real). '
            || 'Suma de categorías al momento de migrar — ' || COALESCE(categorias_texto, '(sin categorías)')
        );
      END IF;
    ELSE
      monto := fila.valor_actual;
      IF monto > 0 THEN
        INSERT INTO indicador_movimientos (id_indicador, cantidad, fecha, origen, nota)
        VALUES (
          fila.id, monto, fila.updated_at::date, 'migracion',
          'Valor migrado de la versión anterior (no es una fecha de corte real)'
        );
      END IF;
    END IF;
  END LOOP;
END $$;

-- Cierre del Bloque 9: a partir de aquí, valor_actual de CUALQUIER
-- indicador activo (migrado en este paso o no) queda recalculado como la
-- suma de sus propios movimientos no anulados — la misma regla que
-- recalcularValorActual aplica desde la app en adelante
-- (indicador-movimientos.queries.js). Para los recién migrados esto no
-- cambia nada (el movimiento insertado ya tiene el mismo monto); para un
-- indicador por categorías cuyo valor_actual hubiera quedado
-- desincronizado de la suma real de sus categorías, esta pasada lo
-- corrige de una vez.
-- No se incluye updated_at en el SET: queda intacto (esta pasada es un
-- recálculo de consistencia, no una edición real del indicador).
UPDATE indicadores i
   SET valor_actual = (
     SELECT COALESCE(SUM(m.cantidad), 0)
       FROM indicador_movimientos m
      WHERE m.id_indicador = i.id AND m.anulado_en IS NULL
   )
 WHERE i.activo = true;
