#!/usr/bin/env bash
# Deploy prebuilt GHCR images on the home server (armbian).
# Intended to be invoked over SSH from GitHub Actions.
#
# Usage:
#   IMAGE_TAG=v0.1.0 ./scripts/remote-deploy-home.sh
#   IMAGE_TAG=v0.1.0 GIT_REF=v0.1.0 ./scripts/remote-deploy-home.sh
#
# Env:
#   IMAGE_TAG  required — image tag to pull (e.g. v0.1.0, sha-abc1234)
#   GIT_REF    optional — git ref to checkout before compose (default: IMAGE_TAG)
#   DEPLOY_DIR optional — app root (default: /mnt/mydata/xiaotuanbao)

set -euo pipefail

IMAGE_TAG="${IMAGE_TAG:?IMAGE_TAG is required}"
GIT_REF="${GIT_REF:-$IMAGE_TAG}"
DEPLOY_DIR="${DEPLOY_DIR:-/mnt/mydata/xiaotuanbao}"
COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.home.yml)
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:8088/api/health}"
HEALTH_RETRIES="${HEALTH_RETRIES:-30}"
HEALTH_SLEEP_SEC="${HEALTH_SLEEP_SEC:-2}"

cd "$DEPLOY_DIR"

if [[ ! -f .env ]]; then
  echo "error: missing $DEPLOY_DIR/.env — copy from .env.example and set production secrets" >&2
  exit 1
fi

if [[ ! -f docker-compose.home.yml ]]; then
  echo "error: missing docker-compose.home.yml in $DEPLOY_DIR" >&2
  exit 1
fi

echo "==> deploy dir: $DEPLOY_DIR"
echo "==> IMAGE_TAG=$IMAGE_TAG GIT_REF=$GIT_REF"

if [[ -d .git ]]; then
  echo "==> syncing git ref $GIT_REF"
  git fetch --tags --prune origin
  if git rev-parse --verify --quiet "$GIT_REF^{commit}" >/dev/null; then
    git checkout --force --detach "$GIT_REF"
  elif git rev-parse --verify --quiet "origin/$GIT_REF" >/dev/null; then
    git checkout --force --detach "origin/$GIT_REF"
  else
    echo "error: cannot resolve git ref: $GIT_REF" >&2
    exit 1
  fi
else
  echo "warn: $DEPLOY_DIR is not a git checkout; skipping git sync" >&2
fi

export IMAGE_TAG

echo "==> pulling images"
"${COMPOSE[@]}" pull

echo "==> starting stack"
"${COMPOSE[@]}" up -d --remove-orphans

echo "==> waiting for health: $HEALTH_URL"
ok=0
for ((i = 1; i <= HEALTH_RETRIES; i++)); do
  if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
    ok=1
    break
  fi
  sleep "$HEALTH_SLEEP_SEC"
done

echo "==> containers"
"${COMPOSE[@]}" ps

if [[ "$ok" -ne 1 ]]; then
  echo "error: health check failed after $HEALTH_RETRIES attempts" >&2
  "${COMPOSE[@]}" logs --tail=80 api caddy || true
  exit 1
fi

echo "==> health OK"
curl -fsS "$HEALTH_URL"
echo
echo "==> deploy complete (IMAGE_TAG=$IMAGE_TAG)"
