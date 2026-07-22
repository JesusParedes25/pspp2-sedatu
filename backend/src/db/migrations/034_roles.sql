-- Migración 034: Renombrar roles de usuarios.rol al nuevo esquema
-- Esquema viejo: 'Ejecutivo','Directivo','Responsable','Operativo' (+ 'superadmin')
-- Esquema nuevo: 'superadmin','ejecutivo','direccion','enlace','externo'
-- Idempotente: DROP CONSTRAINT IF EXISTS + UPDATE con WHERE por valor viejo + ADD CONSTRAINT IF NOT EXISTS

-- 1. Eliminar el constraint viejo que solo permite los valores capitalizados
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;

-- 2. Normalizar valores existentes al esquema nuevo
UPDATE usuarios SET rol = 'ejecutivo' WHERE rol = 'Ejecutivo';
UPDATE usuarios SET rol = 'direccion' WHERE rol = 'Directivo';
UPDATE usuarios SET rol = 'enlace'    WHERE rol IN ('Responsable', 'Operativo');

-- 2b. Corrección de drift: estos 8 usuarios ficticios (sembrados por 025) fueron
-- migrados manualmente a 'externo' antes de que este cambio quedara versionado.
-- Se realinean a 'enlace' para ser consistentes con la regla Operativo→enlace anterior.
UPDATE usuarios SET rol = 'enlace' WHERE rol = 'externo' AND correo IN (
  'carlos.hernandez@sedatu.gob.mx',
  'maria.torres@sedatu.gob.mx',
  'patricia.olvera@sedatu.gob.mx',
  'laura.jimenez@sedatu.gob.mx'
);

-- 3. Agregar el constraint nuevo
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'usuarios_rol_check') THEN
    ALTER TABLE usuarios ADD CONSTRAINT usuarios_rol_check
      CHECK (rol IN ('superadmin', 'ejecutivo', 'direccion', 'enlace', 'externo'));
  END IF;
END$$;
