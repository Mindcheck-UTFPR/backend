# Mindcheck API — primeira imagem (v0.1.0)
FROM node:22-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@10.34.5 --activate
WORKDIR /app

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN pnpm install --frozen-lockfile
COPY tsconfig.json ./
COPY src ./src
RUN pnpm build

FROM node:22-bookworm-slim AS runner
RUN corepack enable && corepack prepare pnpm@10.34.5 --activate
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
LABEL org.opencontainers.image.title="mindcheck-backend"
LABEL org.opencontainers.image.version="0.1.0"
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
