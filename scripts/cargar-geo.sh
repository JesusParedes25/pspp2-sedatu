#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# PSPP v2.0 — Carga de shapefiles geográficos a PostGIS
#
# Este script:
# 1. Carga shapefile de estados (cols: ent, entidad)
# 2. Carga shapefile de municipios (cols: CVEGEO, CVE_ENT, CVE_MUN, NOM_MUN)
# 3. Carga GeoJSON de zonas metropolitanas (props: CVE_MET, NOM_MET, TIPO_MET)
# 4. Puebla las tablas normalizadas geo_estados, geo_municipios, geo_zm
# 5. Sincroniza cat_entidades_federativas y cat_municipios
#
# Prerequisitos:
#   - PostGIS container corriendo (docker-compose up -d postgres)
#   - ogr2ogr disponible (GDAL) o shp2pgsql (postgis-clients)
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
DB_NAME="${DB_NAME:-pspp_db}"
DB_USER="${DB_USER:-pspp_user}"
DB_PASSWORD="${DB_PASSWORD:-cambiar_en_produccion}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ESTADOS_SHP="$PROJECT_ROOT/catalogos/geograficos/estados/estados.shp"
MUNICIPIOS_SHP="$PROJECT_ROOT/catalogos/geograficos/municipios_mexico/mun21gw.shp"
ZM_GEOJSON="$PROJECT_ROOT/catalogos/geograficos/zm/zm.geojson"

export PGPASSWORD="$DB_PASSWORD"
PSQL="psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME"
PG_CONN="PG:host=$DB_HOST port=$DB_PORT dbname=$DB_NAME user=$DB_USER password=$DB_PASSWORD"

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
# Columnas reales del .dbf: fid, entidad, capital, rasgo_geog, ent, pob_tot, pob_pih, por_pob_pi
# ent = clave INEGI (2 dígitos), entidad = nombre del estado
echo ""
echo "► Cargando shapefile de estados..."
if [ -f "$ESTADOS_SHP" ]; then
  # Cargar a tabla temporal
  shp2pgsql -d -s 4326 -W "UTF-8" "$ESTADOS_SHP" _tmp_estados | $PSQL > /dev/null 2>&1

  # Insertar en geo_estados con columnas correctas
  $PSQL -c "
    TRUNCATE geo_estados CASCADE;
    INSERT INTO geo_estados (cve_ent, nombre, geom)
      SELECT LPAD(TRIM(ent)::text, 2, '0'), TRIM(entidad), geom
      FROM _tmp_estados
      WHERE ent IS NOT NULL AND TRIM(ent) <> ''
    ON CONFLICT (cve_ent) DO UPDATE SET nombre = EXCLUDED.nombre, geom = EXCLUDED.geom;
    DROP TABLE IF EXISTS _tmp_estados;
  " > /dev/null 2>&1
  echo "  ✓ geo_estados cargada"
else
  echo "  ⚠ No se encontró $ESTADOS_SHP — omitiendo"
fi

# ─── 3. Cargar shapefile de municipios ───────────────────────
# Columnas reales del .dbf: CVEGEO, CVE_ENT, CVE_MUN, NOM_ENT, COV_, COV_ID, AREA, PERIMETER, NOM_MUN
echo ""
echo "► Cargando shapefile de municipios..."
if [ -f "$MUNICIPIOS_SHP" ]; then
  shp2pgsql -d -s 4326 -W "UTF-8" "$MUNICIPIOS_SHP" _tmp_municipios | $PSQL > /dev/null 2>&1

  $PSQL -c "
    TRUNCATE geo_municipios CASCADE;
    INSERT INTO geo_municipios (cvegeo, cve_ent, cve_mun, nombre, geom)
      SELECT TRIM(cvegeo), TRIM(cve_ent), TRIM(cve_mun), TRIM(nom_mun), geom
      FROM _tmp_municipios
      WHERE cvegeo IS NOT NULL AND TRIM(cvegeo) <> ''
    ON CONFLICT (cvegeo) DO UPDATE SET nombre = EXCLUDED.nombre, geom = EXCLUDED.geom;
    DROP TABLE IF EXISTS _tmp_municipios;
  " > /dev/null 2>&1
  echo "  ✓ geo_municipios cargada"
else
  echo "  ⚠ No se encontró $MUNICIPIOS_SHP — omitiendo"
fi

# ─── 4. Cargar GeoJSON de zonas metropolitanas ──────────────
# Props: CVEGEO, CVE_ENT, CVE_MUN, NOMGEO, CVE_MET, NOM_MET, TIPO_MET
echo ""
echo "► Cargando GeoJSON de zonas metropolitanas..."
if [ -f "$ZM_GEOJSON" ]; then
  # Usar ogr2ogr si está disponible, sino usar SQL directo
  if command -v ogr2ogr &> /dev/null; then
    ogr2ogr -f "PostgreSQL" "$PG_CONN" "$ZM_GEOJSON" \
      -nln _tmp_zm -overwrite -lco GEOMETRY_NAME=geom -t_srs EPSG:4326 > /dev/null 2>&1
  else
    # Cargar via psql con ST_GeomFromGeoJSON (fallback)
    echo "  ℹ ogr2ogr no disponible, usando método Node.js..."
    node "$SCRIPT_DIR/cargar-zm.js" "$ZM_GEOJSON"
  fi

  # Agregar ZMs agrupadas por CVE_MET (cada ZM puede tener varios municipios)
  $PSQL -c "
    TRUNCATE geo_zm CASCADE;
    INSERT INTO geo_zm (cve_met, nombre, tipo, geom)
      SELECT cve_met, MAX(nom_met), MAX(tipo_met), ST_Multi(ST_Union(geom))
      FROM _tmp_zm
      WHERE cve_met IS NOT NULL AND cve_met <> ''
      GROUP BY cve_met
    ON CONFLICT (cve_met) DO UPDATE SET nombre = EXCLUDED.nombre, tipo = EXCLUDED.tipo, geom = EXCLUDED.geom;
    DROP TABLE IF EXISTS _tmp_zm;
  " > /dev/null 2>&1
  echo "  ✓ geo_zm cargada"
else
  echo "  ⚠ No se encontró $ZM_GEOJSON — omitiendo"
fi

# ─── 5. Sincronizar catálogos normalizados ───────────────────
echo ""
echo "► Sincronizando cat_entidades_federativas..."
$PSQL -c "
  INSERT INTO cat_entidades_federativas (clave, nombre)
    SELECT cve_ent, nombre FROM geo_estados
  ON CONFLICT (clave) DO UPDATE SET nombre = EXCLUDED.nombre;
  -- Copiar geometría
  UPDATE cat_entidades_federativas e SET geom = g.geom
    FROM geo_estados g WHERE e.clave = g.cve_ent;
" > /dev/null 2>&1
echo "  ✓ cat_entidades_federativas sincronizada"

echo ""
echo "► Sincronizando cat_municipios..."
$PSQL -c "
  INSERT INTO cat_municipios (clave, clave_mun, nombre, id_entidad)
    SELECT g.cvegeo, g.cve_mun, g.nombre, e.id
    FROM geo_municipios g
    JOIN cat_entidades_federativas e ON g.cve_ent = e.clave
  ON CONFLICT (clave) DO UPDATE SET nombre = EXCLUDED.nombre;
  -- Copiar geometría
  UPDATE cat_municipios m SET geom = g.geom
    FROM geo_municipios g WHERE m.clave = g.cvegeo;
" > /dev/null 2>&1
echo "  ✓ cat_municipios sincronizada"

# ─── 6. Crear vistas para GeoServer ──────────────────────────
echo ""
echo "► Creando vistas para GeoServer..."
$PSQL -c "
  DROP VIEW IF EXISTS vw_geo_estados;
  CREATE VIEW vw_geo_estados AS
    SELECT gid, cve_ent, nombre, geom FROM geo_estados;

  DROP VIEW IF EXISTS vw_geo_municipios;
  CREATE VIEW vw_geo_municipios AS
    SELECT gid, cvegeo, cve_ent, cve_mun, nombre, geom FROM geo_municipios;

  DROP VIEW IF EXISTS vw_geo_zm;
  CREATE VIEW vw_geo_zm AS
    SELECT gid, cve_met, nombre, tipo, geom FROM geo_zm;
" > /dev/null 2>&1
echo "  ✓ Vistas creadas"

# ─── 7. Verificar ────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════"
echo "  Resumen:"
ESTADOS_COUNT=$($PSQL -t -c "SELECT COUNT(*) FROM geo_estados;")
MUNICIPIOS_COUNT=$($PSQL -t -c "SELECT COUNT(*) FROM geo_municipios;")
ZM_COUNT=$($PSQL -t -c "SELECT COUNT(*) FROM geo_zm;" 2>/dev/null || echo "0")
echo "  • Estados:              $ESTADOS_COUNT"
echo "  • Municipios:           $MUNICIPIOS_COUNT"
echo "  • Zonas metropolitanas: $ZM_COUNT"
echo "══════════════════════════════════════════════════"
echo ""
echo "✓ Carga geográfica completada exitosamente"
