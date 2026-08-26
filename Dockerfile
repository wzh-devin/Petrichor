# pnpm monorepo -> Next.js standalone server, packaged for Vercel Functions
# (Vercel auto-detects Dockerfile.vercel at the project root and routes all
# traffic to it; see https://vercel.com/docs/functions/container-images)
#
# Build context MUST be the repository root (Vercel Project Root Directory),
# because the pnpm lockfile / workspace file live there, not in apps/web.

FROM node:22-bookworm-slim AS base
RUN corepack enable
WORKDIR /app

# ---- deps: install with the lockfile only, so this layer caches across
# source-only changes -------------------------------------------------------
FROM base AS deps
# native modules (better-sqlite3, sharp, msgpackr-extract, unrs-resolver) may
# need to compile from source if no prebuilt binary matches the base image.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile

# ---- builder: bring in the rest of the source and build ------------------
FROM base AS builder
COPY --from=deps /app /app
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_REGISTER_ENABLED=false
ENV NEXT_PUBLIC_REGISTER_ENABLED=$NEXT_PUBLIC_REGISTER_ENABLED
# Next.js 收集路由数据时会校验服务端配置；这里只使用不会连接的构建占位值，
# 运行时由 Compose 的 env_file 覆盖为真实生产配置。
RUN DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/petrichor-build \
    SESSION_SECRET=petrichor-build-only-session-secret \
    pnpm --filter @petrichor/web build

# ---- runner: minimal runtime image ----------------------------------------
FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Vercel Functions route to port 80 by default; keep in sync with any
# PORT override you set in the Vercel project's Environment Variables.
ENV PORT=80
ENV HOSTNAME=0.0.0.0

COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/docs/migrations ./docs/migrations
RUN mkdir -p /app/apps/web/.next/cache && chown -R node:node /app/apps/web/.next/cache

USER node
EXPOSE 80
CMD ["node", "apps/web/server.js"]
