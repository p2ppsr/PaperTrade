FROM node:22-bookworm-slim AS build

WORKDIR /app
ENV NPM_CONFIG_LEGACY_PEER_DEPS=true
COPY package*.json ./
COPY patches ./patches
RUN npm ci && npm cache clean --force
COPY . .
RUN npm run build

ARG RUNTIME_BASE_IMAGE=papertrade-runtime-base:local
FROM ${RUNTIME_BASE_IMAGE}

ENV NODE_ENV=production
WORKDIR /app
ENV NPM_CONFIG_LEGACY_PEER_DEPS=true

COPY package*.json ./
COPY patches ./patches
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/build ./build
COPY --from=build /app/dist ./dist
COPY --from=build /app/src/server/public-domain ./dist/server/public-domain
COPY migrations ./migrations
COPY knexfile.cjs ./knexfile.cjs

EXPOSE 8080
CMD ["node", "dist/server/server.js"]
