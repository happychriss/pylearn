# ============================================================
# PyLearn — Fly.io production image
# Single-stage: build and run in the same image
# ============================================================

FROM node:24-slim

# Install Python 3 for PTY execution + build tools for node-pty
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 build-essential && \
    rm -rf /var/lib/apt/lists/*

RUN corepack enable pnpm

WORKDIR /app

# Copy workspace config first for cache-friendly installs
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json tsconfig.json ./

# Copy all package.json files so pnpm can resolve the workspace
COPY artifacts/api-server/package.json artifacts/api-server/
COPY artifacts/pylearn/package.json artifacts/pylearn/
COPY lib/api-spec/package.json lib/api-spec/
COPY lib/api-client-react/package.json lib/api-client-react/
COPY lib/api-zod/package.json lib/api-zod/
COPY lib/db/package.json lib/db/
COPY lib/integrations-openai-ai-server/package.json lib/integrations-openai-ai-server/
COPY lib/auth-web/package.json lib/auth-web/
COPY scripts/package.json scripts/

# Install all deps
RUN pnpm install --frozen-lockfile

# Copy full source
COPY . .

# Build frontend (Vite)
ENV BASE_PATH="/"
ENV PORT=8080
RUN pnpm --filter @workspace/pylearn run build

# Build API server (esbuild bundle)
RUN pnpm --filter @workspace/api-server run build

# Ensure upload directory exists on the persistent volume mount point
RUN mkdir -p /data/uploads

ENV NODE_ENV=production

EXPOSE 8080

CMD ["node", "artifacts/api-server/dist/index.cjs"]
