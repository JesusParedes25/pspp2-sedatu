#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# PSPP v2.0 — Restaurar un backup de PostgreSQL
#
# Por defecto restaura a una base de datos NUEVA (pspp_restore_test)
# para verificar que el backup sirve, SIN tocar la base de datos real
# en uso. Así se puede probar el proceso de restauración sin ningún
# riesgo para los datos de producción.
#
# Uso:
#   ./scripts/restore-postgres.sh /opt/pspp-backups/postgres/pspp_20260723_030000.dump
#
# Para un desastre real (reemplazar la base de datos en uso), agregar
# --force-produccion y confirmar el nombre real de la BD:
#   ./scripts/restore-postgres.sh <archivo.dump> --force-produccion
# ═══════════════════════════════════════════════════════════════

set -e

DUMP_FILE="$1"
MODO="${2:-test}"
ENV_FILE="${ENV_FILE:-$(dirname "$0")/../.env.production}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-pspp-postgres}"

if [ -z "$DUMP_FILE" ] || [ ! -f "$DUMP_FILE" ]; then
  echo "Uso: $0 <archivo.dump> [--force-produccion]"
  exit 1
fi

if [ -f "$ENV_FILE" ]; then
  set -a
  source "$ENV_FILE"
  set +a
else
  echo "✗ No se encontró $ENV_FILE"
  exit 1
fi

DUMP_BASENAME="$(basename "$DUMP_FILE")"
docker cp "$DUMP_FILE" "$POSTGRES_CONTAINER:/tmp/$DUMP_BASENAME"

if [ "$MODO" = "--force-produccion" ]; then
  echo "⚠️  MODO PRODUCCIÓN — esto reemplaza el contenido de \"$DB_NAME\"."
  read -p "Escribe el nombre exacto de la base de datos ($DB_NAME) para confirmar: " CONFIRM
  if [ "$CONFIRM" != "$DB_NAME" ]; then
    echo "✗ No coincide. Abortando, no se tocó nada."
    exit 1
  fi
  echo "► Restaurando sobre $DB_NAME (--clean --if-exists)..."
  docker exec -e PGPASSWORD="$DB_PASSWORD" "$POSTGRES_CONTAINER" \
    pg_restore -U "$DB_USER" -d "$DB_NAME" --clean --if-exists "/tmp/$DUMP_BASENAME"
  echo "✓ Restauración de producción completa."
else
  TEST_DB="pspp_restore_test"
  echo "► Modo verificación: restaurando a base de datos temporal \"$TEST_DB\" (no toca $DB_NAME)..."
  docker exec -e PGPASSWORD="$DB_PASSWORD" "$POSTGRES_CONTAINER" \
    psql -U "$DB_USER" -d postgres -c "DROP DATABASE IF EXISTS $TEST_DB;"
  docker exec -e PGPASSWORD="$DB_PASSWORD" "$POSTGRES_CONTAINER" \
    psql -U "$DB_USER" -d postgres -c "CREATE DATABASE $TEST_DB;"
  docker exec -e PGPASSWORD="$DB_PASSWORD" "$POSTGRES_CONTAINER" \
    pg_restore -U "$DB_USER" -d "$TEST_DB" "/tmp/$DUMP_BASENAME"

  CONTEO=$(docker exec -e PGPASSWORD="$DB_PASSWORD" "$POSTGRES_CONTAINER" \
    psql -U "$DB_USER" -d "$TEST_DB" -tAc "SELECT count(*) FROM proyectos;" 2>/dev/null || echo "error")
  echo "  ✓ Restaurado. Proyectos encontrados en el backup: $CONTEO"

  docker exec -e PGPASSWORD="$DB_PASSWORD" "$POSTGRES_CONTAINER" \
    psql -U "$DB_USER" -d postgres -c "DROP DATABASE $TEST_DB;"
  echo "  ✓ Base de datos temporal eliminada. El backup es válido y restaurable."
fi

docker exec "$POSTGRES_CONTAINER" rm -f "/tmp/$DUMP_BASENAME"
