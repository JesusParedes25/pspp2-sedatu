-- Migración 073: metadatos de importación institucional para
-- catalogo_indicadores (instrumento oficial, área sugerida, producto/
-- objetivo estratégico, código de línea de acción del PSEDATU,
-- referencia documental) — soporta la importación masiva del catálogo
-- de indicadores de SEDATU y su organización/filtrado.
-- Idempotente: usa DO $$ con IF NOT EXISTS.

-- El catálogo real de SEDATU trae nombres de indicador más largos que
-- los 300 caracteres que bastaban hasta ahora (hasta 423 en 3 de las
-- 1387 entradas del lote v1) — se amplía el límite antes de sembrar.
-- ALTER COLUMN ... TYPE es seguro de re-ejecutar sin envolver en
-- IF NOT EXISTS (mismo criterio que el DROP NOT NULL de la migración 070).
ALTER TABLE catalogo_indicadores ALTER COLUMN nombre TYPE VARCHAR(500);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name='catalogo_indicadores' AND column_name='instrumento') THEN
    ALTER TABLE catalogo_indicadores ADD COLUMN instrumento VARCHAR(30) NULL;
  END IF;
END$$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='catalogo_indicadores_instrumento_check') THEN
    ALTER TABLE catalogo_indicadores ADD CONSTRAINT catalogo_indicadores_instrumento_check
      CHECK (instrumento IS NULL OR instrumento IN ('Informe de Gobierno','Informe de Labores','PSEDATU 2025-2030'));
  END IF;
END$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name='catalogo_indicadores' AND column_name='area_sugerida') THEN
    ALTER TABLE catalogo_indicadores ADD COLUMN area_sugerida VARCHAR(120) NULL;
  END IF;
END$$;

-- "producto" es TEXT (no VARCHAR corto): el valor real llega hasta 790
-- caracteres — es un objetivo/estrategia narrativo, no una etiqueta de
-- una palabra. Se llama "producto" (no "categoria") para no chocar con
-- el concepto ya existente de indicador_categorias/"Por categorías".
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name='catalogo_indicadores' AND column_name='producto') THEN
    ALTER TABLE catalogo_indicadores ADD COLUMN producto TEXT NULL;
  END IF;
END$$;

-- Código jerárquico "objetivo.estrategia.línea" del PSEDATU 2025-2030
-- (ej. "1.1.1"), o "objetivo.estrategia" para los indicadores
-- compuestos por fórmula (ej. "3.1"). NULL para Informe de Gobierno/
-- Labores, que no usan este esquema de codificación.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name='catalogo_indicadores' AND column_name='codigo_linea_accion') THEN
    ALTER TABLE catalogo_indicadores ADD COLUMN codigo_linea_accion VARCHAR(15) NULL;
  END IF;
END$$;

-- "referencia": dónde ubicar el dato dentro del documento fuente
-- (código de línea de acción, o "página N del informe") —
-- deliberadamente SEPARADA de la columna "fuente" ya existente, que en
-- el modelo significa de dónde proviene el dato (ej. "INEGI",
-- "CONAPO"). Mezclar ambas cosas en "fuente" sería incorrecto
-- semánticamente.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name='catalogo_indicadores' AND column_name='referencia') THEN
    ALTER TABLE catalogo_indicadores ADD COLUMN referencia VARCHAR(300) NULL;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_catalogo_indicadores_instrumento
  ON catalogo_indicadores(instrumento) WHERE instrumento IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_catalogo_indicadores_codigo_linea_accion
  ON catalogo_indicadores(codigo_linea_accion) WHERE codigo_linea_accion IS NOT NULL;

-- gin+trgm sobre producto: soporta el filtro por producto (combobox con
-- búsqueda en vivo) y que el buscador de texto libre también encuentre
-- coincidencias ahí, reusando pg_trgm (ya habilitado, migración 038)
-- igual que buscarSimilares().
CREATE INDEX IF NOT EXISTS idx_catalogo_indicadores_producto_trgm
  ON catalogo_indicadores USING gin (producto gin_trgm_ops);
