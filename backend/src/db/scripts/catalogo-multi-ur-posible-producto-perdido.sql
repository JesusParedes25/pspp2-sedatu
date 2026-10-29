-- SCRIPT: catalogo-multi-ur-posible-producto-perdido.sql
-- PROPÓSITO: Bloque F2 del encargo "API pública de indicadores para el
-- tablero de la Secretaría".
--
-- LIMITACIÓN IMPORTANTE, por la que este script NO puede simplemente
-- "listar las 23 entradas": las 23 que la Secretaría ya identificó a
-- mano contra el Excel fuente (Variables_DGPDI, hoja "Variables") son
-- nombres de Variable que tenían VARIAS filas en el Excel, cada una con
-- su propio "Producto". Esa agrupación por nombre no ocurrió en este
-- repositorio: según el comentario de cabecera de
-- backend/src/db/seeders/00_catalogo_indicadores_v1_sedatu.js (líneas
-- 9-16), un script externo de conversión, que nunca se subió al
-- control de versiones, ya agrupó las 1987 filas del Excel por nombre
-- antes de generar ese archivo — lo confirmado en vivo: el arreglo
-- CATALOGO_V1_SEDATU que sí está en el repo trae 1387 entradas, todas
-- con nombre distinto entre sí (1987 - 1387 = 600, cuadra con lo que
-- reportó la Secretaría), así que el valor de "Producto" de las filas
-- que NO sobrevivieron ya no existe en ningún lado: ni en la base, ni
-- en este repositorio. No hay archivo+línea que lo recupere.
--
-- Lo que SÍ se puede reconstruir desde el catálogo es el universo
-- CANDIDATO: toda entrada cuyo `area_sugerida` tenga más de una UR
-- separada por ";" viene necesariamente de más de una fila del Excel
-- (esa agregación de URs sí se conservó completa — confirmado: hay
-- exactamente 423 entradas así, el mismo número que area_responsable
-- expone sin pérdida en el Bloque A). De esas 423, algunas comparten el
-- mismo Producto entre sus filas de origen (sin problema) y otras no
-- (el caso que preocupa, donde solo un Producto sobrevivió y una DG que
-- reportaba bajo un Producto distinto queda contada bajo el que no es
-- suyo) — pero cuál es cuál ya no se puede saber desde la base. Este
-- script entrega las 423 para cruzarlas a mano contra el Excel (ahí SÍ
-- sigue existiendo el Producto por fila) y ver cuáles de las 23 ya
-- conocidas están aquí (deberían estarlo todas, al ser un subconjunto).
--
-- Es de SOLO LECTURA. No modifica nada. No forma parte de migrate.js ni
-- corre sola; se ejecuta a mano con psql:
--   psql -U <usuario> -d <base> -f backend/src/db/scripts/catalogo-multi-ur-posible-producto-perdido.sql

SELECT
  c.id,
  c.clave,
  c.nombre,
  c.instrumento,
  c.area_sugerida                                       AS urs_que_reportan,
  c.producto                                             AS producto_que_sobrevivio,
  COUNT(i.id) FILTER (WHERE i.activo = true)             AS indicadores_activos_vinculados,
  COUNT(DISTINCT i.id_proyecto) FILTER (WHERE i.activo = true) AS proyectos_capturando
FROM catalogo_indicadores c
LEFT JOIN indicadores i ON i.id_catalogo = c.id
WHERE c.area_sugerida LIKE '%;%'
GROUP BY c.id, c.clave, c.nombre, c.instrumento, c.area_sugerida, c.producto
ORDER BY proyectos_capturando DESC, c.nombre;
