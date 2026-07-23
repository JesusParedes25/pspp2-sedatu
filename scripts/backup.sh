#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# PSPP v2.0 — Backup de PostgreSQL y MinIO (producción)
#
# Este script:
# 1. Vuelca la base de datos completa (pg_dump, formato custom
#    comprimido) desde el contenedor pspp-postgres.
# 2. Empaqueta el volumen de datos de pspp-minio (evidencias,
#    shapefiles, reportes subidos).
# 3. Verifica que el dump de Postgres sea legible (pg_restore --list)
#    para detectar un backup corrupto/vacío en el momento, no meses
#    después cuando se necesite restaurar.
# 4. Conserva solo los últimos RETENTION_COUNT backups (por defecto 2)
#    y borra el resto — no por antigüedad en días, sino "los N más
#    recientes", sin importar cuántos días llevan.
#
# No detiene ningún contenedor ni modifica datos — solo lee.
#
# Uso:
#   chmod +x scripts/backup.sh
#   ./scripts/backup.sh
#
# Cron sugerido (diario a las 3am, ajustar ruta del repo):
#   0 3 * * * /opt/pspp-v2/scripts/backup.sh >> /var/log/pspp-backup.log 2>&1
# ═══════════════════════════════════════════════════════════════

set -e

# ─── Configuración ────────────────────────────────────────────
ENV_FILE="${ENV_FILE:-$(dirname "$0")/../.env.production}"
BACKUP_DIR="${BACKUP_DIR:-/opt/pspp-backups}"
RETENTION_COUNT="${RETENTION_COUNT:-2}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-pspp-postgres}"
MINIO_CONTAINER="${MINIO_CONTAINER:-pspp-minio}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"

if [ -f "$ENV_FILE" ]; then
  set -a
  source "$ENV_FILE"
  set +a
else
  echo "✗ No se encontró $ENV_FILE — exporta DB_USER/DB_NAME/DB_PASSWORD antes de correr este script."
  exit 1
fi

mkdir -p "$BACKUP_DIR/postgres" "$BACKUP_DIR/minio"

# ─── 1. Backup de PostgreSQL ───────────────────────────────────
PG_DUMP_FILE="$BACKUP_DIR/postgres/pspp_${TIMESTAMP}.dump"
echo "► Volcando PostgreSQL ($DB_NAME) desde $POSTGRES_CONTAINER..."
docker exec -e PGPASSWORD="$DB_PASSWORD" "$POSTGRES_CONTAINER" \
  pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc > "$PG_DUMP_FILE"

DUMP_SIZE=$(stat -c%s "$PG_DUMP_FILE" 2>/dev/null || stat -f%z "$PG_DUMP_FILE")
if [ "$DUMP_SIZE" -lt 1000 ]; then
  echo "✗ El dump de Postgres pesa sospechosamente poco ($DUMP_SIZE bytes). Abortando sin borrar backups viejos."
  exit 1
fi

# Verificación: el dump debe ser legible por pg_restore (no descomprime
# ni toca ninguna base de datos, solo lee el índice del archivo).
echo "► Verificando integridad del dump..."
docker exec -i "$POSTGRES_CONTAINER" pg_restore --list < "$PG_DUMP_FILE" > /dev/null
echo "  ✓ Dump válido ($((DUMP_SIZE / 1024 / 1024)) MB): $PG_DUMP_FILE"

# ─── 2. Backup de MinIO (evidencias) ───────────────────────────
MINIO_BACKUP_FILE="$BACKUP_DIR/minio/minio_${TIMESTAMP}.tar.gz"
echo "► Empaquetando datos de MinIO desde $MINIO_CONTAINER..."
docker run --rm \
  --volumes-from "$MINIO_CONTAINER" \
  -v "$BACKUP_DIR/minio:/backup" \
  alpine sh -c "cd / && tar czf /backup/minio_${TIMESTAMP}.tar.gz data"
echo "  ✓ MinIO respaldado: $MINIO_BACKUP_FILE"

# ─── 3. Rotación — conservar solo los últimos RETENTION_COUNT ──
echo "► Limpiando backups — se conservan los últimos $RETENTION_COUNT de cada tipo..."
ls -1t "$BACKUP_DIR/postgres"/*.dump 2>/dev/null | tail -n "+$((RETENTION_COUNT + 1))" | xargs -r rm -v --
ls -1t "$BACKUP_DIR/minio"/*.tar.gz 2>/dev/null | tail -n "+$((RETENTION_COUNT + 1))" | xargs -r rm -v --

echo "═══ Backup completo: $TIMESTAMP ═══"
