-- SCRIPT: catalogo-entradas-sospechosas.sql
-- PROPÓSITO: Bloque 3.7 del encargo "Versión final de Indicadores" — ayudar
-- a un superadmin a encontrar, a mano, entradas de catalogo_indicadores que
-- parezcan de prueba o de ejemplo (capturadas al probar el formulario,
-- nunca pensadas para vivir en el catálogo real).
--
-- Es de SOLO LECTURA. No borra ni desactiva nada — eso lo decide una
-- persona, entrada por entrada, desde Administración > Indicadores
-- (desactivar ahí no borra: ver activo=false en migración 049). No forma
-- parte de migrate.js ni corre sola; se ejecuta a mano con psql cuando
-- alguien quiera revisar el catálogo:
--   psql -U <usuario> -d <base> -f backend/src/db/scripts/catalogo-entradas-sospechosas.sql
--
-- El patrón cubre nombre/descripcion/definicion/fuente/area_sugerida/
-- producto/referencia (todos los campos de texto libre de la tabla,
-- migraciones 049/073/074/075/076/080) contra palabras que casi nunca
-- aparecen en un indicador institucional real, más la nota interna "⚠
-- Revisar:" que el panel usa para marcar un registro a medio llenar
-- (ver también Bloque B3 de este mismo encargo, que la filtra de la API
-- pública en vez de borrarla).

SELECT
  id, clave, nombre, instrumento, activo, created_at,
  CASE
    WHEN nombre ILIKE '%prueba%' OR descripcion ILIKE '%prueba%' THEN 'contiene "prueba"'
    WHEN nombre ILIKE '%ejemplo%' OR descripcion ILIKE '%ejemplo%' THEN 'contiene "ejemplo"'
    WHEN nombre ILIKE '%test%' OR descripcion ILIKE '%test%' THEN 'contiene "test"'
    WHEN nombre ILIKE '%xxx%' OR nombre ILIKE '%borrar%' THEN 'nombre tipo marcador ("xxx"/"borrar")'
    WHEN definicion ILIKE '⚠ Revisar:%' THEN 'nota interna "⚠ Revisar:" sin resolver'
    ELSE 'otro campo coincide (ver abajo)'
  END AS por_que
FROM catalogo_indicadores
WHERE nombre ILIKE ANY (ARRAY['%prueba%', '%ejemplo%', '%test%', '%xxx%', '%borrar%'])
   OR descripcion ILIKE ANY (ARRAY['%prueba%', '%ejemplo%', '%test%'])
   OR definicion ILIKE ANY (ARRAY['%prueba%', '%ejemplo%', '%test%', '⚠ Revisar:%'])
   OR fuente ILIKE ANY (ARRAY['%prueba%', '%ejemplo%'])
   OR area_sugerida ILIKE ANY (ARRAY['%prueba%', '%ejemplo%'])
   OR producto ILIKE ANY (ARRAY['%prueba%', '%ejemplo%'])
   OR referencia ILIKE ANY (ARRAY['%prueba%', '%ejemplo%'])
ORDER BY created_at;
