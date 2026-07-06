#!/bin/sh
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./postgres/backup}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_FILE="${BACKUP_DIR}/xiaotuanbao_${TIMESTAMP}.sql"

mkdir -p "${BACKUP_DIR}"

docker compose exec -T postgres pg_dump \
  -U "${POSTGRES_USER:-xiaotuanbao}" \
  "${POSTGRES_DB:-xiaotuanbao}" > "${BACKUP_FILE}"

echo "Backup saved to ${BACKUP_FILE}"
