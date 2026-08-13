#!/usr/bin/env bash
set -euo pipefail

OCR_SMOKE_ENDPOINT="${OCR_BASE_URL:-http://127.0.0.1:8089}"
OCR_SMOKE_FILE="${1:-apps/web/public/xiaotuanbao-brand-lockup-transparent-v2.png}"

if [[ ! -f "${OCR_SMOKE_FILE}" ]]; then
  echo "OCR 冒烟文件不存在: ${OCR_SMOKE_FILE}" >&2
  exit 1
fi

curl --fail --silent --show-error "${OCR_SMOKE_ENDPOINT}/health"
echo
curl --fail --silent --show-error --form "file=@${OCR_SMOKE_FILE}" "${OCR_SMOKE_ENDPOINT}/v1/ocr"
echo
