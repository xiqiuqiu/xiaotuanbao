#!/bin/sh
cd /app/apps/api
pnpm exec prisma migrate deploy
exec node dist/main.js
