-- ═══════════════════════════════════════════════════════════════
-- PSPP v2.0 — Migración 050: API de indicadores para el tablero
--                            ejecutivo externo
--
-- Dos piezas:
--
-- 1. api_tokens — credenciales de servicio administrables desde el
--    panel de superadmin, para no tener que tocar código ni variables
--    de entorno cada vez que haya que dar, rotar o revocar un acceso.
--
--    Se guarda SOLO el hash del token (SHA-256), nunca el token en
--    claro: si alguien lee la base no obtiene una credencial usable.
--    Por eso el valor completo se muestra UNA vez, al crearlo. Se
--    guarda además un prefijo visible (los primeros caracteres) para
--    poder identificar cuál es cuál en la lista sin revelarlo.
--
--    Revocar es desactivar, no borrar: se conserva el rastro de qué
--    credencial existió, quién la creó y cuándo se usó por última vez.
--
-- 2. indicadores.id_creador — hasta ahora no se sabía quién había dado
--    de alta el indicador de un proyecto. Se necesita para la API (el
--    tablero ejecutivo debe poder atribuir el dato) y para saber a
--    quién preguntarle cuando algo no cuadra.
--
-- Aditiva: nada existente cambia de comportamiento.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS api_tokens (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre        VARCHAR(200) NOT NULL,
  descripcion   TEXT,
  -- SHA-256 en hex del token. UNIQUE para poder buscar por hash directo.
  token_hash    CHAR(64) NOT NULL UNIQUE,
  -- Primeros caracteres del token, para reconocerlo en la lista.
  prefijo       VARCHAR(16) NOT NULL,
  -- Permisos del token. Hoy solo existe la lectura de indicadores; se
  -- guarda como arreglo para poder ampliar sin migrar otra vez.
  permisos      TEXT[] NOT NULL DEFAULT ARRAY['indicadores:leer'],
  activo        BOOLEAN NOT NULL DEFAULT true,
  ultimo_uso    TIMESTAMPTZ,
  usos          INTEGER NOT NULL DEFAULT 0,
  creado_por    UUID REFERENCES usuarios(id),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  revocado_en   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_api_tokens_activo ON api_tokens (activo) WHERE activo = true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'indicadores' AND column_name = 'id_creador'
  ) THEN
    ALTER TABLE indicadores ADD COLUMN id_creador UUID REFERENCES usuarios(id);
  END IF;
END$$;

-- Backfill: para los indicadores que ya existen no hay registro de quién
-- los creó, así que se atribuyen al creador del proyecto — que es quien
-- capturó el proyecto y, por tanto, sus indicadores iniciales. Es una
-- aproximación, pero es mejor que dejarlo vacío y no se pierde nada:
-- de aquí en adelante se guarda el usuario real.
UPDATE indicadores i
   SET id_creador = p.id_creador
  FROM proyectos p
 WHERE i.id_proyecto = p.id
   AND i.id_creador IS NULL
   AND p.id_creador IS NOT NULL;
