# syntax=docker/dockerfile:1

# Build from repo root:
#   docker build -f Backend/Dockerfile -t krishecarbon-backend .
#
# Run:
#   docker run --rm -p 3001:3001 --env-file Backend/.env krishecarbon-backend

FROM node:22-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
COPY Backend/package.json Backend/
COPY packages/shared/package.json packages/shared/
RUN npm ci

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY Backend Backend
RUN rm -rf packages/shared/dist packages/shared/tsconfig.tsbuildinfo \
  && npm run build --workspace=@krishecarbon/shared \
  && npm run build --workspace=@krishecarbon/backend

FROM base AS production
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
COPY Backend/package.json Backend/
COPY packages/shared/package.json packages/shared/

RUN npm ci --omit=dev --workspace=@krishecarbon/backend

COPY --from=build /app/Backend/dist ./Backend/dist
COPY --from=build /app/packages/shared/dist ./packages/shared/dist

WORKDIR /app/Backend

USER node
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3001) + '/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "dist/main.js"]
