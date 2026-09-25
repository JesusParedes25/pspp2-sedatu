-- Migración 076: esquema (sin datos) para los títulos oficiales del
-- PSEDATU 2025-2030, y filtro por área responsable en el catálogo.
--
-- La migaja de pan del catálogo ("Objetivo 1 › Estrategia 1.3 › Línea
-- 1.3.2") hoy solo puede mostrar números, porque no existe una tabla con
-- los títulos oficiales de cada objetivo/estrategia. Estas dos tablas
-- quedan vacías a propósito — el usuario va a cargar los títulos reales
-- después, tomados del documento oficial del PSEDATU 2025-2030 ("no es
-- algo que el agente deba inventar"). Mientras no tengan filas, la migaja
-- sigue funcionando mostrando solo el número — ver
-- catalogo-indicadores.queries.js::obtenerTitulosPsedatu(), que devuelve
-- mapas vacíos si las tablas están vacías, sin romper nada.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'psedatu_objetivos') THEN
    CREATE TABLE psedatu_objetivos (
      clave  VARCHAR(2)   PRIMARY KEY,  -- ej. "1", "2", "3", "4"
      titulo VARCHAR(300) NOT NULL
    );
  END IF;
END$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'psedatu_estrategias') THEN
    CREATE TABLE psedatu_estrategias (
      clave  VARCHAR(5)   PRIMARY KEY,  -- ej. "1.1", "4.5" (objetivo.estrategia)
      titulo VARCHAR(400) NOT NULL
    );
  END IF;
END$$;
