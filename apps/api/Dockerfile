FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
ENV CI=true

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
COPY packages/ai-contracts/package.json ./packages/ai-contracts/
COPY packages/config/package.json ./packages/config/
RUN pnpm install --frozen-lockfile --filter api...

FROM base AS build
COPY --from=deps /app/ ./
COPY apps/api ./apps/api
COPY packages/shared ./packages/shared
COPY packages/ai-contracts ./packages/ai-contracts
COPY packages/config ./packages/config
WORKDIR /app/apps/api
RUN pnpm exec prisma generate && pnpm build

# Portable prod package without a second network install.
# (A second `pnpm install --prod` under QEMU arm64 hung CI for 15+ min.)
FROM build AS deploy
WORKDIR /app
RUN pnpm --filter api deploy --prod --legacy /out \
  && cd /out \
  && ./node_modules/.bin/prisma generate \
  && rm -rf /out/src /out/test /out/scripts /out/*.ts /out/tsconfig*.json /out/jest*.js /out/nest-cli.json /out/Dockerfile \
  && rm -rf /root/.cache/pnpm /root/.cache/prisma /root/.cache/prisma-nodejs /root/.local/share/pnpm /tmp/pnpm* /tmp/*

FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

COPY --from=deploy /out/ ./

EXPOSE 3000
# Call prisma binary directly — `pnpm exec` re-resolves and can hit the network.
ENTRYPOINT ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && exec node dist/main.js"]
