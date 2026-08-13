FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
ENV CI=true

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/agent/package.json ./apps/agent/
COPY packages/ai-contracts/package.json ./packages/ai-contracts/
COPY packages/config/package.json ./packages/config/
RUN pnpm install --frozen-lockfile --filter agent...

FROM base AS build
COPY --from=deps /app/ ./
COPY apps/agent ./apps/agent
COPY packages/ai-contracts ./packages/ai-contracts
COPY packages/config ./packages/config
WORKDIR /app/apps/agent
RUN pnpm --filter @xiaotuanbao/ai-contracts build && pnpm build

FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/apps/agent/dist ./dist
COPY --from=build /app/apps/agent/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/ai-contracts ./packages/ai-contracts
EXPOSE 4111
CMD ["node", "dist/main.js"]
