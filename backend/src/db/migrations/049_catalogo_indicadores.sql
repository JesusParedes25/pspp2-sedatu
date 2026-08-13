-- ═══════════════════════════════════════════════════════════════
-- PSPP v2.0 — Migración 049: Catálogo de indicadores
--
-- Hoy cada proyecto escribe sus indicadores a mano, así que el mismo
-- indicador conceptual aparece tecleado distinto en cada proyecto
-- ("Hectáreas aptas" / "Has. aptas" / "hectáreas aptas para vivienda").
-- Eso hace imposible sumar o comparar entre proyectos, y sería un
-- problema serio al exponerlos por API a otra plataforma: no habría
-- forma de saber que dos filas hablan de lo mismo.
--
-- El catálogo da una definición única por indicador. Cada indicador de
-- proyecto puede apuntar a una entrada del catálogo (id_catalogo).
--
-- CLAVE ESTABLE: `clave` es el identificador que verá la plataforma
-- externa. Se elige texto legible (no el UUID) para que el consumidor
-- pueda mapearlo sin depender de nuestros IDs internos, y es UNIQUE
-- para que nunca haya ambigüedad. Renombrar el indicador NO cambia su
-- clave — ese es justamente el punto.
--
-- MIGRACIÓN ADITIVA: `id_catalogo` es NULLABLE. Los indicadores que ya
-- existen siguen funcionando exactamente igual aunque no queden
-- ligados a ninguna entrada; nada se rompe si el backfill no los
-- reconoce a todos.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS catalogo_indicadores (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- Identificador estable de cara a la API externa. Nunca se reusa.
  clave                VARCHAR(80) NOT NULL UNIQUE,
  nombre               VARCHAR(300) NOT NULL,
  descripcion          TEXT,
  -- Mismos dominios que la tabla `indicadores`, para que al elegir del
  -- catálogo se pueda prellenar sin traducciones.
  tipo                 VARCHAR(30) NOT NULL,
  unidad               VARCHAR(30) NOT NULL,
  unidad_personalizada VARCHAR(80),
  etiqueta_unidad      VARCHAR(80),
  -- Metadatos que hacen comparable el dato entre proyectos: cómo se
  -- calcula y de dónde sale. Son texto libre a propósito: hoy no hay
  -- proceso que los valide y forzar estructura sin necesidad real solo
  -- estorbaría la captura.
  definicion           TEXT,
  fuente               VARCHAR(300),
  -- Desactivar en vez de borrar: un indicador retirado no debe
  -- ofrecerse para proyectos nuevos, pero los proyectos que ya lo usan
  -- conservan su referencia y su historial.
  activo               BOOLEAN NOT NULL DEFAULT true,
  creado_por           UUID REFERENCES usuarios(id),
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- Búsqueda por nombre desde el selector del formulario
CREATE INDEX IF NOT EXISTS idx_catalogo_indicadores_nombre
  ON catalogo_indicadores (lower(nombre));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'indicadores' AND column_name = 'id_catalogo'
  ) THEN
    ALTER TABLE indicadores
      ADD COLUMN id_catalogo UUID REFERENCES catalogo_indicadores(id);
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_indicadores_catalogo
  ON indicadores (id_catalogo) WHERE id_catalogo IS NOT NULL;

-- ─── Sembrar el catálogo con lo que ya existe ───────────────────
-- El catálogo no arranca vacío: se construye a partir de los
-- indicadores realmente capturados, agrupando por nombre normalizado
-- (sin distinguir mayúsculas ni espacios sobrantes). Así el usuario
-- encuentra desde el primer día los indicadores que ya venía usando.
--
-- La clave se deriva del nombre: minúsculas, sin acentos, separado por
-- guiones. Si dos nombres distintos colapsan a la misma clave se le
-- añade un sufijo numérico, porque `clave` es UNIQUE.
INSERT INTO catalogo_indicadores (clave, nombre, tipo, unidad, unidad_personalizada, etiqueta_unidad, descripcion)
SELECT
  CASE WHEN d.colision = 1 THEN d.clave_base ELSE d.clave_base || '-' || d.colision END,
  d.nombre, d.tipo, d.unidad, d.unidad_personalizada, d.etiqueta_unidad, d.descripcion
FROM (
  SELECT
    -- Primer nombre visto para ese nombre normalizado
    (ARRAY_AGG(i.nombre ORDER BY i.created_at))[1]               AS nombre,
    (ARRAY_AGG(i.tipo ORDER BY i.created_at))[1]                 AS tipo,
    (ARRAY_AGG(i.unidad ORDER BY i.created_at))[1]               AS unidad,
    (ARRAY_AGG(i.unidad_personalizada ORDER BY i.created_at))[1] AS unidad_personalizada,
    (ARRAY_AGG(i.etiqueta_unidad ORDER BY i.created_at))[1]      AS etiqueta_unidad,
    (ARRAY_AGG(i.descripcion ORDER BY i.created_at))[1]          AS descripcion,
    LEFT(regexp_replace(
      translate(lower(trim(
        (ARRAY_AGG(i.nombre ORDER BY i.created_at))[1]
      )), 'áéíóúüñ', 'aeiouun'),
      '[^a-z0-9]+', '-', 'g'
    ), 70)                                                        AS clave_base,
    ROW_NUMBER() OVER (
      PARTITION BY LEFT(regexp_replace(
        translate(lower(trim(
          (ARRAY_AGG(i.nombre ORDER BY i.created_at))[1]
        )), 'áéíóúüñ', 'aeiouun'),
        '[^a-z0-9]+', '-', 'g'
      ), 70)
      ORDER BY (ARRAY_AGG(i.nombre ORDER BY i.created_at))[1]
    )                                                             AS colision
  FROM indicadores i
  WHERE i.nombre IS NOT NULL AND trim(i.nombre) <> ''
  GROUP BY lower(trim(i.nombre))
) d
ON CONFLICT (clave) DO NOTHING;

-- Ligar los indicadores existentes a su entrada del catálogo
UPDATE indicadores i
   SET id_catalogo = c.id
  FROM catalogo_indicadores c
 WHERE i.id_catalogo IS NULL
   AND lower(trim(i.nombre)) = lower(trim(c.nombre));
