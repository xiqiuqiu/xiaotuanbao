FROM node:22-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/
COPY packages/config/package.json ./packages/config/

RUN pnpm install --filter web...

COPY apps/web ./apps/web
COPY packages/config ./packages/config

ARG VITE_API_BASE_URL=/api
ARG VITE_APP_NAME=小团宝
ARG VITE_APP_ENV=production

ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_APP_NAME=$VITE_APP_NAME
ENV VITE_APP_ENV=$VITE_APP_ENV

RUN pnpm --filter web build

FROM scratch AS export
COPY --from=builder /app/apps/web/dist /
