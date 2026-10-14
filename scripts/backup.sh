#!/usr/bin/env bash
# Encrypted dump of the database's data: everything in the public schema, plus the auth users and
# identities profiles point to. The schema itself lives in supabase/migrations. See "Backups" in the README.
#
# Usage: SUPABASE_DB_URL=... BACKUP_PASSPHRASE=... scripts/backup.sh [output dir, default "backups"]
set -euo pipefail

: "${SUPABASE_DB_URL:?Set SUPABASE_DB_URL to the Session pooler connection string}"
: "${BACKUP_PASSPHRASE:?Set BACKUP_PASSPHRASE}"

out_dir="${1:-backups}"
mkdir -p "$out_dir"
file="$out_dir/raidlab-$(date -u +%Y-%m-%dT%H%M%SZ).sql.gz.gpg"
# Don't leave an empty "backup" behind when the dump fails.
trap 'rm -f "$file"' ERR

pg_dump "$SUPABASE_DB_URL" \
  --data-only --no-owner --no-privileges \
  --table='public.*' --table=auth.users --table=auth.identities |
  gzip |
  gpg --batch --yes --pinentry-mode loopback --symmetric --cipher-algo AES256 \
    --passphrase-file <(printf '%s' "$BACKUP_PASSPHRASE") --output "$file"

echo "Wrote $file"
