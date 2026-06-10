FROM node:20-bookworm-slim AS build

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    poppler-utils \
    libreoffice-writer \
    calibre \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/build ./build
COPY --from=build /app/dist ./dist
COPY migrations ./migrations
COPY knexfile.cjs ./knexfile.cjs

EXPOSE 8080
CMD ["node", "dist/server/server.js"]
