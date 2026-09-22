-- Migración 070: unidad_periodo (Año/Sexenio/Personalizado) + etiqueta de periodo
-- Idempotente: usa DO $$ con IF NOT EXISTS, mismo estilo que 024.
--
-- Generaliza el corte "Anual" (hasta ahora el único desglose temporal
-- posible además de "Global") para cubrir sexenios y cortes propios de
-- cada área, sin tocar el comportamiento de los indicadores Anuales
-- que ya existen.
--
-- unidad_periodo solo tiene sentido cuando temporalidad = 'Anual'; en
-- un indicador 'Global' queda presente pero sin uso. DEFAULT 'Anio'
-- puebla todas las filas existentes sin ningún UPDATE manual — ningún
-- indicador Anual existente cambia de comportamiento.
--
-- indicador_metas_anuales.anio pasa a ser NULLABLE: para periodos
-- 'Personalizado' no representa un año calendario y se deja en NULL
-- (el orden se resuelve por created_at) — evita reutilizar la columna
-- como un índice sintético sin significado real, que sería confuso
-- para quien lea la tabla directo o para una futura API externa que
-- consuma estos datos. Para 'Anio' y 'Sexenio' sigue siendo el año
-- calendario real (para Sexenio, el año de inicio del bloque).
-- UNIQUE(id_indicador, anio) sigue funcionando sin cambios: Postgres
-- no considera los NULL iguales entre sí.
--
-- indicador_metas_anuales.etiqueta es el texto a mostrar cuando "anio"
-- no basta (rango de un sexenio, o el nombre libre de un periodo
-- personalizado). NULL para filas existentes — no se relabelean datos
-- históricos. Convención de lectura en todo el código: etiqueta ||
-- String(anio).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='indicadores' AND column_name='unidad_periodo') THEN
    ALTER TABLE indicadores ADD COLUMN unidad_periodo VARCHAR(15) NOT NULL DEFAULT 'Anio';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'indicadores_unidad_periodo_check') THEN
    ALTER TABLE indicadores ADD CONSTRAINT indicadores_unidad_periodo_check
      CHECK (unidad_periodo IN ('Anio','Sexenio','Personalizado'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='indicador_metas_anuales' AND column_name='etiqueta') THEN
    ALTER TABLE indicador_metas_anuales ADD COLUMN etiqueta VARCHAR(80) NULL;
  END IF;

  -- anio NULLABLE: DROP NOT NULL es idempotente por sí solo en Postgres
  -- (no falla si la columna ya lo era), no hace falta el chequeo previo.
  ALTER TABLE indicador_metas_anuales ALTER COLUMN anio DROP NOT NULL;
END $$;
