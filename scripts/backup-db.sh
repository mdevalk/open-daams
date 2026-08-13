#!/bin/sh
set -eu

DATABASE_URL=$(grep -m1 '^DATABASE_URL=' .env | cut -d= -f2- | tr -d '"')
if [ -z "$DATABASE_URL" ]; then
  echo "DATABASE_URL not found in .env" >&2
  exit 1
fi
DB_USER=$(echo "$DATABASE_URL" | sed -E 's#postgresql://([^:]+):.*#\1#')
DB_NAME=$(echo "$DATABASE_URL" | sed -E 's#.*/([^/?]+)(\?.*)?$#\1#')
DB_PORT=$(echo "$DATABASE_URL" | sed -E 's#.*:([0-9]+)/.*#\1#')

CONTAINER=$(docker ps --filter "publish=$DB_PORT" --format '{{.Names}}' | head -n1)
if [ -z "$CONTAINER" ]; then
  echo "No container publishing port $DB_PORT found — is the database running (docker compose up -d)?" >&2
  exit 1
fi

mkdir -p backups
OUT="backups/${DB_NAME}_$(date -u +%Y%m%dT%H%M%SZ).sql"
docker exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" --clean --if-exists > "$OUT"
echo "Backup written to $OUT"
