FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
COPY packages/config/package.json ./packages/config/
RUN pnpm install --frozen-lockfile --filter api...

FROM base AS build
COPY --from=deps /app/ ./
COPY apps/api ./apps/api
COPY packages/shared ./packages/shared
COPY packages/config ./packages/config
WORKDIR /app/apps/api
RUN pnpm exec prisma generate && pnpm build

FROM base AS production
WORKDIR /app
ENV NODE_ENV=production

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
COPY packages/config/package.json ./packages/config/
COPY --from=build /app/packages/shared/dist ./packages/shared/dist

# Keep corepack under /root/.cache/node; drop pnpm/prisma download caches after install.
RUN pnpm install --frozen-lockfile --filter api... --prod \
  && rm -rf /root/.cache/pnpm /root/.cache/prisma /root/.cache/prisma-nodejs /root/.local/share/pnpm /tmp/pnpm* /tmp/*

COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY --from=build /app/apps/api/package.json ./apps/api/package.json

WORKDIR /app/apps/api
RUN pnpm exec prisma generate \
  && rm -rf /root/.cache/pnpm /root/.cache/prisma /root/.cache/prisma-nodejs /root/.local/share/pnpm /tmp/pnpm* /tmp/*

EXPOSE 3000
ENTRYPOINT ["sh", "-c", "pnpm exec prisma migrate deploy && exec node dist/main.js"]
