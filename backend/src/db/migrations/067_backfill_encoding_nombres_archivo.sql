-- Migración 067: reparar nombres de archivo con acentos corrompidos por
-- una carga que no forzaba UTF-8 (I·03) — evidencias.nombre_original,
-- evidencias.titulo y actividad.archivo_nombre (adjuntos de tarea).
--
-- Causa: el navegador manda el nombre de archivo como UTF-8, pero busboy
-- (usado por multer) lo decodificaba como latin1 — "ó" (2 bytes UTF-8:
-- 0xC3 0xB3) quedaba guardado como dos caracteres sueltos "Ã³". Ya
-- corregido hacia adelante en middleware/corregirCodificacionArchivo —
-- esta migración repara lo que ya quedó mal guardado.
--
-- Reparación: reinterpretar el texto guardado como bytes latin1 (recupera
-- los bytes UTF-8 originales que mandó el navegador) y decodificarlos
-- como UTF-8. Solo se actualiza una fila si esa conversión (a) tiene
-- éxito — un texto que YA estaba bien casi nunca produce bytes latin1
-- que a su vez formen UTF-8 válido, así que Postgres lanza una excepción
-- de "invalid byte sequence" que se atrapa sin tocar la fila — y (b) el
-- resultado es distinto del original. No toca evidencias.nombre_archivo
-- ni ruta_minio: son la ruta real del objeto en MinIO, corregirlas
-- rompería la descarga; solo se corrige el nombre que se MUESTRA.
-- Idempotente: una fila ya reparada no vuelve a coincidir con el patrón
-- de corrupción, así que una segunda pasada no le hace nada.
DO $$
DECLARE
  fila RECORD;
  reparado TEXT;
BEGIN
  FOR fila IN SELECT id, nombre_original FROM evidencias WHERE nombre_original IS NOT NULL LOOP
    BEGIN
      reparado := convert_from(convert_to(fila.nombre_original, 'LATIN1'), 'UTF8');
      IF reparado IS DISTINCT FROM fila.nombre_original THEN
        UPDATE evidencias SET nombre_original = reparado WHERE id = fila.id;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL; -- no era el patrón de corrupción esperado (o ya estaba bien) — no tocar
    END;
  END LOOP;

  FOR fila IN SELECT id, titulo FROM evidencias WHERE titulo IS NOT NULL LOOP
    BEGIN
      reparado := convert_from(convert_to(fila.titulo, 'LATIN1'), 'UTF8');
      IF reparado IS DISTINCT FROM fila.titulo THEN
        UPDATE evidencias SET titulo = reparado WHERE id = fila.id;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;

  FOR fila IN SELECT id, archivo_nombre FROM actividad WHERE archivo_nombre IS NOT NULL LOOP
    BEGIN
      reparado := convert_from(convert_to(fila.archivo_nombre, 'LATIN1'), 'UTF8');
      IF reparado IS DISTINCT FROM fila.archivo_nombre THEN
        UPDATE actividad SET archivo_nombre = reparado WHERE id = fila.id;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;
END $$;
