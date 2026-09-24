-- Migración 075: índice de trigramas (GIST) sobre catalogo_indicadores.nombre.
--
-- buscarDuplicadosSugeridos() (pantalla "Fusionar duplicados") necesita
-- encontrar, para cada una de las 1387+ entradas del catálogo, sus
-- entradas más parecidas — un self-join que evalúe similarity() en cada
-- par posible (~950 mil pares) mide ~21s en pruebas, y Postgres no usa un
-- índice GIN para acotar un self-join columna-contra-columna en una tabla
-- de este tamaño (el planner prefiere un Seq Scan por fila).
--
-- Un índice GIST con gist_trgm_ops sí acelera esto: soporta búsquedas KNN
-- ("los N más parecidos") vía el operador de distancia "<->" dentro de
-- una LATERAL, una fila a la vez — de ~21s a ~2.5s en las mismas pruebas.
-- Se usa GIST (no GIN, a diferencia del índice de `producto` en la
-- migración 073) específicamente porque GIN no soporta ese operador de
-- distancia para búsquedas KNN.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_catalogo_indicadores_nombre_gist_trgm') THEN
    CREATE INDEX idx_catalogo_indicadores_nombre_gist_trgm
      ON catalogo_indicadores USING gist (nombre gist_trgm_ops);
  END IF;
END$$;
