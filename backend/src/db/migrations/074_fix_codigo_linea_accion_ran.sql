-- Migración 074: corrige un código de línea de acción mal extraído del
-- catálogo institucional SEDATU (lote v1, migración 073 /
-- 00_catalogo_indicadores_v1_sedatu.js).
--
-- Causa raíz: el Excel fuente (Variables_DGPDI_13052026.xlsx) guardó el
-- valor de la columna Resultado de esta única fila como número de Excel
-- (4.51) en vez de texto — el código real de 3 niveles "4.5.1"
-- (objetivo.estrategia.línea) se colapsó al convertirse a número, perdiendo
-- el punto intermedio. El script de conversión original solo reconocía
-- códigos de 2 segmentos como texto y aceptó "4.51" tal cual, inventando
-- una "Estrategia 4.51" que no existe en el PSEDATU 2025-2030 (las 27
-- estrategias reales confirmadas no incluyen ninguna "4.51" — sí existe
-- "4.5", y bajo esa estrategia sí hay una línea de acción "4.5.1", ya usada
-- por la entrada hermana "Número de procesos de inscripción de actos
-- jurídicos agrarios fortalecidos para la certificación de derechos sobre
-- la propiedad social" — mismo producto/área RAN).
--
-- El script de conversión (fuera del repo, no versionado) ya se corrigió
-- para leer las celdas de Excel con raw:true y reconstruir códigos
-- colapsados a número SOLO cuando el prefijo objetivo.estrategia resultante
-- ya es una estrategia confirmada por texto limpio en otras filas —
-- confirmado con una auditoría completa del Excel: cero estrategias fuera
-- de las 27 reales. Este backfill aplica esa misma corrección puntual
-- (referencia y codigo_linea_accion) a la fila que ya haya sido sembrada
-- por el lote v1 en cualquier entorno (dev/producción) antes de este fix.
--
-- Idempotente: solo actualiza filas que todavía tengan el valor corrupto
-- "4.51" — una segunda corrida no encuentra nada que cambiar.
UPDATE catalogo_indicadores
SET codigo_linea_accion = '4.5.1',
    referencia = '4.5.1'
WHERE instrumento = 'PSEDATU 2025-2030'
  AND codigo_linea_accion = '4.51';
