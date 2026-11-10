-- Migración 087: marca de versión para poder revocar sesiones sin esperar
-- a que el JWT expire por su cuenta (desactivar una cuenta, cambiar su
-- contraseña). El middleware de sesión compara esta columna contra el
-- claim `tv` que trae el token; si no coinciden, el token deja de servir
-- aunque su firma y su `exp` sigan siendo válidos.
-- Idempotente: usa DO $$ con IF NOT EXISTS, igual que 024.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='usuarios' AND column_name='token_version') THEN
    ALTER TABLE usuarios ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0;
  END IF;
END$$;
