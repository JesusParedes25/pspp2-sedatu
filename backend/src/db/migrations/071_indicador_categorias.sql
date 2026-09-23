-- Indicadores "multivalor": un indicador puede componerse de varias
-- categorías con nombre libre (ej. "Solicitudes de validación",
-- "Solicitudes de Firma"...) que suman al total del indicador, en vez
-- de un solo valor o un desglose por periodo. Excluyente con
-- unidad_periodo por diseño: un indicador es Simple, Por periodos, o
-- Por categorías, nunca dos a la vez — composicion='Categorias'
-- implica temporalidad='Global' en el código que escribe estos datos.
--
-- Tabla nueva y separada de indicador_metas_anuales a propósito, no
-- una reutilización de unidad_periodo='Personalizado': esa tabla y ese
-- mecanismo son explícitamente temporales (la columna se llama "anio",
-- anio_inicio/anio_fin gobiernan todo el flujo) — una fila de
-- categoría ahí sería un significado oculto dependiendo de un flag
-- externo a la tabla. Mismos tipos que indicador_metas_anuales
-- (migración 005) por consistencia dentro de la misma familia.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='indicadores' AND column_name='composicion') THEN
    ALTER TABLE indicadores ADD COLUMN composicion VARCHAR(15) NOT NULL DEFAULT 'Simple';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'indicadores_composicion_check') THEN
    ALTER TABLE indicadores ADD CONSTRAINT indicadores_composicion_check
      CHECK (composicion IN ('Simple','Categorias'));
  END IF;

  -- Tipo de gráfica (barras/dona) para cuando el indicador tiene algo
  -- que desglosar (temporalidad='Anual' o composicion='Categorias');
  -- para un indicador simple queda presente pero sin uso, igual que ya
  -- pasa con unidad_periodo hoy para indicadores Global.
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='indicadores' AND column_name='tipo_grafico') THEN
    ALTER TABLE indicadores ADD COLUMN tipo_grafico VARCHAR(10) NOT NULL DEFAULT 'barras';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'indicadores_tipo_grafico_check') THEN
    ALTER TABLE indicadores ADD CONSTRAINT indicadores_tipo_grafico_check
      CHECK (tipo_grafico IN ('barras','dona'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS indicador_categorias (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_indicador UUID NOT NULL REFERENCES indicadores(id) ON DELETE CASCADE,
  nombre       VARCHAR(120) NOT NULL,
  meta         DECIMAL(15,2) DEFAULT 0,
  valor_actual DECIMAL(15,2) DEFAULT 0,
  orden        INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_indicador_categorias_indicador ON indicador_categorias(id_indicador);
