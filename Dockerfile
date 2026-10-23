ARG NODE_IMAGE=node:24.22.1-trixie-slim@sha256:43b9ba1142b8dcf33fa8f922ca1be85714adc444e0586c7cf7726daaeabc1bea
ARG RUNTIME_BASE_IMAGE=papertrade-runtime-base:local
FROM ${NODE_IMAGE} AS build

ARG VITE_APP_VERSION=browser
ENV VITE_APP_VERSION=${VITE_APP_VERSION}

WORKDIR /app
RUN apt-get update \
  && apt-get upgrade -y \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
RUN npm install --global npm@11.12.1
COPY package*.json ./
RUN npm ci && npm cache clean --force
COPY . .
RUN npm run build && npm prune --omit=dev

FROM ${RUNTIME_BASE_IMAGE}

ENV NODE_ENV=production
WORKDIR /app

COPY package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/dist ./dist
COPY --from=build /app/src/server/public-domain ./dist/server/public-domain
COPY migrations ./migrations
COPY knexfile.cjs ./knexfile.cjs

EXPOSE 8080
CMD ["node", "dist/server/server.js"]
