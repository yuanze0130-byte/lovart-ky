#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${DOODLEVERSE_APP_DIR:-/www/wwwroot/lovart-ky}"
ASSET_DIR="${CANVAS_ASSET_DIR:-/www/storage/doodleverse/canvas}"
BACKUP_ROOT="${DOODLEVERSE_BACKUP_DIR:-/www/backup/doodleverse}"
RETENTION_DAYS="${DOODLEVERSE_BACKUP_RETENTION_DAYS:-7}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"

install -d -m 700 "$BACKUP_ROOT/database" "$BACKUP_ROOT/assets"

cd "$APP_DIR"
DOODLEVERSE_ENV_FILE="$APP_DIR/.env.production" \
  node scripts/backup-supabase.mjs "$BACKUP_ROOT/database"

if [[ -d "$ASSET_DIR" ]]; then
  tar --create --gzip --file "$BACKUP_ROOT/assets/canvas-$TIMESTAMP.tar.gz" \
    --directory "$(dirname "$ASSET_DIR")" "$(basename "$ASSET_DIR")"
  chmod 600 "$BACKUP_ROOT/assets/canvas-$TIMESTAMP.tar.gz"
fi

find "$BACKUP_ROOT/database" -type f -name 'supabase-*.json.gz' -mtime "+$RETENTION_DAYS" -delete
find "$BACKUP_ROOT/assets" -type f -name 'canvas-*.tar.gz' -mtime "+$RETENTION_DAYS" -delete
