FROM node:22-bookworm-slim AS build

WORKDIR /app
ENV NPM_CONFIG_LEGACY_PEER_DEPS=true
COPY package*.json ./
RUN npm ci && npm cache clean --force
COPY . .
RUN npm run build

ARG RUNTIME_BASE_IMAGE=registry.cars-operator-system.svc.cluster.local:5000/p2ppsr/papertrade-runtime-base:node22-bookworm-docs-2026-06-11
FROM ${RUNTIME_BASE_IMAGE}

ENV NODE_ENV=production
WORKDIR /app
ENV NPM_CONFIG_LEGACY_PEER_DEPS=true

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/build ./build
COPY --from=build /app/dist ./dist
COPY migrations ./migrations
COPY knexfile.cjs ./knexfile.cjs

EXPOSE 8080
CMD ["node", "dist/server/server.js"]
