-- ═══════════════════════════════════════════════════════════════
-- PSPP v2.0 — Migración 038: Extensión pg_trgm
--
-- Las funciones de búsqueda difusa (buscarEstadosFuzzy, buscarMunicipiosFuzzy,
-- buscarMunicipiosGeoFuzzy) usan similarity()/% de pg_trgm, pero ninguna
-- migración la habilitaba — la extensión nunca llegó a instalarse.
-- IDEMPOTENTE: seguro de ejecutar múltiples veces.
-- ═══════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pg_trgm;
