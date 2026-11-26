# BIGALESSO GAMES – immagine completa: compila il client dentro Docker e poi lo serve con il server Node.
# Se il server ha poca RAM per compilare, usa Dockerfile.prebuilt (nessuna build sul server).
# ---------- 1) build del client (three.js + esbuild), con file .br/.gz già pronti ----------
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY scripts ./scripts
COPY shared ./shared
COPY src ./src
COPY assets ./assets
RUN node scripts/build.mjs --compress

# ---------- 2) runtime: solo Node + ws + regole condivise + dist ----------
# Salvataggi e classifiche in /data (SQLite): su Easypanel monta un Volume su /data, così restano dopo ogni deploy.
FROM node:22-alpine
ENV NODE_ENV=production PORT=8080 STATIC_DIR=/app/dist DATA_DIR=/data NODE_OPTIONS=--max-old-space-size=256
WORKDIR /app
COPY server/package.json server/package-lock.json* ./server/
RUN cd server && npm install --omit=dev --no-audit --no-fund && npm cache clean --force
COPY server/*.mjs ./server/
COPY shared ./shared
COPY --from=build /app/dist ./dist
RUN mkdir -p /data && chown node:node /data
VOLUME /data
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
CMD ["node", "server/server.mjs"]
