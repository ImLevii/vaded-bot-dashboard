# syntax=docker/dockerfile:1
# Standalone image for vg-music-bot (ByteBlaze) — a separate Discord
# application from the dashboard's own `bot` service, deployed as its own
# container. See ../docker-compose.yml.
ARG NODE_VERSION=24-alpine

FROM node:${NODE_VERSION} AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:${NODE_VERSION} AS production
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -g 1001 -S nodejs && adduser -S vgmusicbot -u 1001 -G nodejs
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY languages ./languages
RUN chown -R vgmusicbot:nodejs /app
USER vgmusicbot

EXPOSE 8080

CMD ["node", "--no-deprecation", "./dist/index.js"]
