#!/bin/sh
set -eu

FILE="${1:-}"
if [ -z "$FILE" ]; then
  echo "Usage: npm run db:restore -- <backup-file>" >&2
  exit 1
fi
if [ ! -f "$FILE" ]; then
  echo "No such file: $FILE" >&2
  exit 1
fi

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

docker exec -i "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" < "$FILE"
echo "Restored from $FILE"
