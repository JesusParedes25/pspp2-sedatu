#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# PSPP v2.0 — Carga de shapefiles geográficos a PostGIS
#
# Este script:
# 1. Carga los shapefiles de estados y municipios a PostGIS
# 2. Habilita la extensión pg_trgm (para fuzzy matching)
# 3. Crea vistas optimizadas para GeoServer
# 4. Puebla las tablas de catálogo normalizadas
#
# Prerequisitos:
#   - PostGIS container corriendo (docker-compose up -d db)
#   - shp2pgsql disponible (viene con postgis-clients)
#   - Shapefiles en catalogos/geograficos/
#
# Uso:
#   chmod +x scripts/cargar-geo.sh
#   ./scripts/cargar-geo.sh
# ═══════════════════════════════════════════════════════════════

set -e

# ─── Configuración ────────────────────────────────────────────
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-pspp}"
DB_USER="${DB_USER:-pspp_user}"
DB_PASSWORD="${DB_PASSWORD:-pspp_pass}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ESTADOS_SHP="$PROJECT_ROOT/catalogos/geograficos/estados/estados.shp"
MUNICIPIOS_SHP="$PROJECT_ROOT/catalogos/geograficos/municipios_mexico/mun21gw.shp"

export PGPASSWORD="$DB_PASSWORD"
PSQL="psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME"

echo "══════════════════════════════════════════════════"
echo "  PSPP — Carga de datos geográficos"
echo "══════════════════════════════════════════════════"

# ─── 1. Habilitar extensiones ─────────────────────────────────
echo ""
echo "► Habilitando extensiones PostGIS y pg_trgm..."
$PSQL -c "CREATE EXTENSION IF NOT EXISTS postgis;"
$PSQL -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;"
echo "  ✓ Extensiones habilitadas"

# ─── 2. Cargar shapefile de estados ──────────────────────────
echo ""
echo "► Cargando shapefile de estados..."
if [ -f "$ESTADOS_SHP" ]; then
  shp2pgsql -d -s 4326 -W "UTF-8" "$ESTADOS_SHP" geo_estados | $PSQL > /dev/null 2>&1
  echo "  ✓ geo_estados cargada"
else
  echo "  ⚠ No se encontró $ESTADOS_SHP — omitiendo"
fi

# ─── 3. Cargar shapefile de municipios ───────────────────────
echo ""
echo "► Cargando shapefile de municipios..."
if [ -f "$MUNICIPIOS_SHP" ]; then
  shp2pgsql -d -s 4326 -W "UTF-8" "$MUNICIPIOS_SHP" geo_municipios | $PSQL > /dev/null 2>&1
  echo "  ✓ geo_municipios cargada"
else
  echo "  ⚠ No se encontró $MUNICIPIOS_SHP — omitiendo"
fi

# ─── 4. Crear vistas para GeoServer ──────────────────────────
echo ""
echo "► Creando vistas para GeoServer..."
$PSQL -c "
  DROP VIEW IF EXISTS vw_geo_estados;
  CREATE VIEW vw_geo_estados AS
    SELECT gid, cve_ent, nom_ent, geom FROM geo_estados;

  DROP VIEW IF EXISTS vw_geo_municipios;
  CREATE VIEW vw_geo_municipios AS
    SELECT gid, cvegeo, cve_ent, cve_mun, nom_ent, nom_mun, geom FROM geo_municipios;
" > /dev/null 2>&1
echo "  ✓ Vistas creadas"

# ─── 5. Poblar catálogo normalizado ──────────────────────────
echo ""
echo "► Poblando catálogo de entidades federativas..."
$PSQL -c "
  INSERT INTO cat_entidades_federativas (clave, nombre)
    SELECT DISTINCT cve_ent, nom_ent FROM geo_estados
  ON CONFLICT (clave) DO UPDATE SET nombre = EXCLUDED.nombre;
" > /dev/null 2>&1
echo "  ✓ cat_entidades_federativas poblada"

echo ""
echo "► Poblando catálogo de municipios..."
$PSQL -c "
  INSERT INTO cat_municipios (clave, clave_mun, nombre, id_entidad)
    SELECT DISTINCT g.cvegeo, g.cve_mun, g.nom_mun, e.id
    FROM geo_municipios g
    JOIN cat_entidades_federativas e ON g.cve_ent = e.clave
  ON CONFLICT (clave) DO UPDATE SET nombre = EXCLUDED.nombre;
" > /dev/null 2>&1
echo "  ✓ cat_municipios poblada"

# ─── 6. Verificar ────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════"
echo "  Resumen:"
ESTADOS_COUNT=$($PSQL -t -c "SELECT COUNT(*) FROM cat_entidades_federativas;")
MUNICIPIOS_COUNT=$($PSQL -t -c "SELECT COUNT(*) FROM cat_municipios;")
echo "  • Entidades federativas: $ESTADOS_COUNT"
echo "  • Municipios:            $MUNICIPIOS_COUNT"
echo "══════════════════════════════════════════════════"
echo ""
echo "✓ Carga geográfica completada exitosamente"
