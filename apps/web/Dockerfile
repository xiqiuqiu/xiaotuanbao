FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
COPY packages/ai-contracts/package.json ./packages/ai-contracts/
COPY packages/config/package.json ./packages/config/
RUN pnpm install --frozen-lockfile --filter web...

FROM base AS build
COPY --from=deps /app/ ./
COPY apps/web ./apps/web
COPY packages/shared ./packages/shared
COPY packages/ai-contracts ./packages/ai-contracts
COPY packages/config ./packages/config

ARG VITE_APP_NAME=小团宝
ARG VITE_API_BASE_URL=/api
ARG VITE_APP_ENV=production
ENV VITE_APP_NAME=$VITE_APP_NAME
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_APP_ENV=$VITE_APP_ENV

WORKDIR /app/apps/web
RUN pnpm build

FROM alpine:3.20 AS export
COPY --from=build /app/apps/web/dist /dist
CMD ["sh", "-c", "cp -r /dist/. /output/"]
