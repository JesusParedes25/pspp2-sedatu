-- Migración 080: administrador de cartera (extensión de la Fase 1 del
-- modelo de permisos nuevo — ver docs/modelo-permisos.md).
--
-- Pertenecer a una cartera NO otorga acceso a los proyectos que agrupa
-- (eso no cambia: una cartera agrupa por tema, no por permiso). Lo que
-- esta migración agrega es QUIÉN puede administrar la CARTERA MISMA
-- (editarla, eliminarla, agregar o quitar proyectos de ella) — hasta
-- ahora cualquier usuario autenticado podía hacer cualquiera de esas
-- cuatro cosas sobre cualquier cartera (ver el comentario de cabecera
-- de carteras.controller.js, "Opción A, decisión de producto").
--
-- Mismo patrón que proyectos: un solo administrador por cartera, por
-- omisión quien la creó, reasignable por un superadmin.
--
-- id_administrador es DISTINTO de id_responsable: id_responsable ya
-- existía (migración 048) como un campo descriptivo libre, elegible
-- desde el formulario sin ninguna regla ("Sin especificar" es válido,
-- cualquier usuario puede quedar ahí) — no se puede asumir que ya
-- contenga a quien de verdad administra. id_administrador es nuevo, se
-- llena aquí con el creador de cada cartera, y de ahí en adelante solo
-- lo cambia una reasignación explícita (no el formulario de edición).
DO $$
DECLARE
  huerfanos INT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'carteras' AND column_name = 'id_administrador'
  ) THEN
    ALTER TABLE carteras ADD COLUMN id_administrador UUID REFERENCES usuarios(id);
  END IF;

  UPDATE carteras SET id_administrador = id_creador
  WHERE id_administrador IS NULL AND id_creador IS NOT NULL;

  SELECT COUNT(*) INTO huerfanos FROM carteras WHERE id_administrador IS NULL;
  IF huerfanos > 0 THEN
    RAISE NOTICE 'Migración 080: % cartera(s) quedaron sin administrador (id_creador nulo). Asignar a mano: UPDATE carteras SET id_administrador = ''<id_usuario>'' WHERE id = ''<id_cartera>'';', huerfanos;
  END IF;
END$$;

-- ═════════════════════════════════════════════════════════════════
-- DOWN (ejecutar a mano si hace falta revertir esta migración)
-- ═════════════════════════════════════════════════════════════════
-- ALTER TABLE carteras DROP COLUMN IF EXISTS id_administrador;
