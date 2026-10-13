-- Migración 079: la escalera única de función (lectura / captura /
-- responsable / administracion_proyecto), Fase 1 del modelo de permisos
-- nuevo (ver docs/modelo-permisos.md).
--
-- nodo_miembros.rol pasa a los tres primeros peldaños:
--   invitado -> lectura, colaborador -> captura, responsable -> responsable
--
-- proyecto_usuarios.rol pasa a los cuatro, con un colapso real: un
-- proyecto tiene UN SOLO administrador (por omisión, quien lo creó).
-- Antes de esta migración el esquema no impedía tener varias filas
-- rol='responsable' aceptadas en el mismo proyecto (sin índice único que
-- lo evitara) — confirmado en producción: 3 proyectos con 2 cada uno.
-- Regla de colapso:
--   - proyecto_usuarios.colaborador -> captura (sin ambigüedad)
--   - La fila cuyo id_usuario = proyectos.id_creador (si existe y está
--     aceptada) -> administracion_proyecto
--   - Si el creador no tiene fila en proyecto_usuarios, se le crea una
--     (estado='aceptada', rol='administracion_proyecto')
--   - Cualquier OTRA fila rol='responsable' que no sea el creador queda
--     en 'responsable' (ya no administra el proyecto completo, solo
--     conserva lo que ese peldaño da: editar fichas de nodos, crear y
--     eliminar hijos, invitar — ver docs/modelo-permisos.md)
--   - Si proyectos.id_creador es NULL (no ocurre en los datos actuales,
--     verificado: 0 filas), se promueve a administracion_proyecto el
--     responsable aceptado más antiguo (MIN(aceptado_en)); si tampoco
--     hay ninguno, el proyecto queda sin administrador — se reporta al
--     final de esta migración con un NOTICE, para que un superadmin lo
--     asigne a mano. No hay pantalla dedicada a esto todavía (la "Zona
--     de administración de personal" es Fase 7); mientras tanto,
--     `SELECT id, nombre FROM proyectos WHERE id NOT IN (SELECT id_proyecto
--     FROM proyecto_usuarios WHERE rol='administracion_proyecto')` lista
--     los afectados en cualquier momento.
--
-- Idempotente y reversible (ver sección DOWN al final, a ejecutar a mano
-- si hace falta revertir).

DO $$
DECLARE
  huerfanos INT;
BEGIN
  -- ─── nodo_miembros: aflojar el CHECK antes de reescribir valores ───
  ALTER TABLE nodo_miembros DROP CONSTRAINT IF EXISTS nodo_miembros_rol_check;

  UPDATE nodo_miembros SET rol = 'lectura'   WHERE rol = 'invitado';
  UPDATE nodo_miembros SET rol = 'captura'   WHERE rol = 'colaborador';
  -- 'responsable' ya se llama igual; no necesita UPDATE.

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'nodo_miembros_rol_check') THEN
    ALTER TABLE nodo_miembros ADD CONSTRAINT nodo_miembros_rol_check
      CHECK (rol IN ('lectura', 'captura', 'responsable'));
  END IF;

  -- ─── proyecto_usuarios: mismo patrón ───
  ALTER TABLE proyecto_usuarios DROP CONSTRAINT IF EXISTS proyecto_usuarios_rol_check;

  -- La columna nacía VARCHAR(20) (migración 030) — suficiente para
  -- 'responsable'/'colaborador', pero NO para 'administracion_proyecto'
  -- (23 caracteres). Sin este ALTER, el UPDATE de abajo falla con
  -- "value too long for type character varying(20)" — se descubrió
  -- corriendo esta migración por primera vez contra una base con el
  -- esquema real completo, nunca se había ejecutado antes. TEXT en vez
  -- de un VARCHAR(N) más grande, mismo criterio ya usado en
  -- nodo_miembros.rol (migración 033): sin tope artificial que un
  -- peldaño futuro pueda volver a golpear.
  ALTER TABLE proyecto_usuarios ALTER COLUMN rol TYPE TEXT;

  UPDATE proyecto_usuarios SET rol = 'captura' WHERE rol = 'colaborador';

  -- El creador, si ya tiene fila, sube a administracion_proyecto.
  UPDATE proyecto_usuarios pu
  SET rol = 'administracion_proyecto'
  FROM proyectos p
  WHERE pu.id_proyecto = p.id
    AND pu.id_usuario = p.id_creador
    AND pu.rol = 'responsable';

  -- Cualquier otro 'responsable' que no sea el creador baja a 'responsable'
  -- tal cual (ya es el nombre correcto del peldaño, no hace falta UPDATE) —
  -- esta línea es solo documentación: no queda ninguna fila 'responsable'
  -- de proyecto_usuarios con un significado distinto al nuevo peldaño.

  -- Si el creador no tenía fila en proyecto_usuarios, se la creamos.
  INSERT INTO proyecto_usuarios (id_proyecto, id_usuario, rol, estado, aceptado_en)
  SELECT p.id, p.id_creador, 'administracion_proyecto', 'aceptada', NOW()
  FROM proyectos p
  WHERE p.id_creador IS NOT NULL
    AND p.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM proyecto_usuarios pu
      WHERE pu.id_proyecto = p.id AND pu.id_usuario = p.id_creador
    )
  ON CONFLICT (id_proyecto, id_usuario) DO NOTHING;

  -- Proyectos con id_creador NULL: promover al responsable aceptado más
  -- antiguo. No ocurre hoy (0 filas verificadas), pero la migración debe
  -- quedar correcta si el dato apareciera después.
  UPDATE proyecto_usuarios pu
  SET rol = 'administracion_proyecto'
  FROM (
    SELECT DISTINCT ON (pu2.id_proyecto) pu2.id_proyecto, pu2.id_usuario
    FROM proyecto_usuarios pu2
    JOIN proyectos p2 ON p2.id = pu2.id_proyecto AND p2.id_creador IS NULL
    WHERE pu2.rol = 'responsable' AND pu2.estado = 'aceptada'
    ORDER BY pu2.id_proyecto, pu2.aceptado_en ASC NULLS LAST
  ) elegido
  WHERE pu.id_proyecto = elegido.id_proyecto AND pu.id_usuario = elegido.id_usuario;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'proyecto_usuarios_rol_check') THEN
    ALTER TABLE proyecto_usuarios ADD CONSTRAINT proyecto_usuarios_rol_check
      CHECK (rol IN ('lectura', 'captura', 'responsable', 'administracion_proyecto'));
  END IF;

  SELECT COUNT(*) INTO huerfanos
  FROM proyectos p
  WHERE p.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM proyecto_usuarios pu
      WHERE pu.id_proyecto = p.id AND pu.rol = 'administracion_proyecto'
    );

  IF huerfanos > 0 THEN
    RAISE NOTICE 'Migración 079: % proyecto(s) quedaron sin administrador (id_creador nulo y sin ningún responsable aceptado). Ejecutar la consulta del comentario de cabecera de esta migración para listarlos.', huerfanos;
  END IF;

  -- ─── solicitudes_participacion.funcion: mismo renombrado ───
  -- responder() (solicitudes.queries.js) copia este valor TAL CUAL dentro
  -- de nodo_miembros.rol / proyecto_usuarios.rol al aceptar — si esta
  -- columna se queda con el vocabulario viejo, aceptar una solicitud nueva
  -- (creada después de esta migración) fallaría contra el CHECK ya
  -- renombrado de esas dos tablas. Mismo renombrado, misma migración.
  ALTER TABLE solicitudes_participacion DROP CONSTRAINT IF EXISTS solicitudes_participacion_funcion_check;

  UPDATE solicitudes_participacion SET funcion = 'captura' WHERE funcion = 'colaborador';
  UPDATE solicitudes_participacion SET funcion = 'lectura' WHERE funcion = 'invitado';

  ALTER TABLE solicitudes_participacion ADD CONSTRAINT solicitudes_participacion_funcion_check
    CHECK (
      funcion IN ('responsable', 'captura')
      OR (funcion = 'lectura' AND id_nodo IS NOT NULL)
    );
END$$;

-- ═════════════════════════════════════════════════════════════════
-- DOWN (ejecutar a mano si hace falta revertir esta migración)
-- ═════════════════════════════════════════════════════════════════
-- DO $$
-- BEGIN
--   ALTER TABLE nodo_miembros DROP CONSTRAINT IF EXISTS nodo_miembros_rol_check;
--   UPDATE nodo_miembros SET rol = 'invitado'    WHERE rol = 'lectura';
--   UPDATE nodo_miembros SET rol = 'colaborador' WHERE rol = 'captura';
--   ALTER TABLE nodo_miembros ADD CONSTRAINT nodo_miembros_rol_check
--     CHECK (rol IN ('responsable', 'colaborador', 'invitado'));
--
--   ALTER TABLE proyecto_usuarios DROP CONSTRAINT IF EXISTS proyecto_usuarios_rol_check;
--   UPDATE proyecto_usuarios SET rol = 'colaborador' WHERE rol = 'captura';
--   -- administracion_proyecto y responsable vuelven ambos a 'responsable'
--   -- (el colapso de administradores no es reversible 1:1: la migración
--   -- hacia adelante no guarda quién era 'responsable' extra antes de
--   -- colapsar, así que el down restaura la forma del esquema, no el
--   -- dato exacto previo a la migración — si eso importa, restaurar
--   -- desde el respaldo de antes de aplicar 079 en vez de usar este DOWN).
--   UPDATE proyecto_usuarios SET rol = 'responsable' WHERE rol = 'administracion_proyecto';
--   -- Recién aquí, con 'administracion_proyecto' ya convertido, cabe
--   -- volver a VARCHAR(20) sin que ningún valor restante lo exceda.
--   ALTER TABLE proyecto_usuarios ALTER COLUMN rol TYPE VARCHAR(20);
--   ALTER TABLE proyecto_usuarios ADD CONSTRAINT proyecto_usuarios_rol_check
--     CHECK (rol IN ('responsable', 'colaborador'));
--
--   ALTER TABLE solicitudes_participacion DROP CONSTRAINT IF EXISTS solicitudes_participacion_funcion_check;
--   UPDATE solicitudes_participacion SET funcion = 'colaborador' WHERE funcion = 'captura';
--   UPDATE solicitudes_participacion SET funcion = 'invitado' WHERE funcion = 'lectura';
--   ALTER TABLE solicitudes_participacion ADD CONSTRAINT solicitudes_participacion_funcion_check
--     CHECK (
--       funcion IN ('responsable', 'colaborador')
--       OR (funcion = 'invitado' AND id_nodo IS NOT NULL)
--     );
-- END$$;
