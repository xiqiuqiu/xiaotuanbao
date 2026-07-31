#!/bin/sh
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 <backup.sql>"
  exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "${BACKUP_FILE}" ]; then
  echo "Backup file not found: ${BACKUP_FILE}"
  exit 1
fi

cat "${BACKUP_FILE}" | docker compose exec -T postgres psql \
  -U "${POSTGRES_USER:-xiaotuanbao}" \
  -d "${POSTGRES_DB:-xiaotuanbao}"

echo "Restore completed from ${BACKUP_FILE}"
