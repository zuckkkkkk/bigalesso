# BIGALESSO GAMES – immagine completa: compila il client dentro Docker e poi lo serve con il server Node.
# Se il server ha poca RAM per compilare, usa Dockerfile.prebuilt (nessuna build sul server).
# ---------- 1) build del client (three.js + esbuild), con file .br/.gz già pronti ----------
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY scripts ./scripts
COPY src ./src
COPY assets ./assets
RUN node scripts/build.mjs --compress

# ---------- 2) runtime: solo Node + ws + dist ----------
FROM node:22-alpine
ENV NODE_ENV=production PORT=8080 STATIC_DIR=/app/dist NODE_OPTIONS=--max-old-space-size=96
WORKDIR /app
COPY server/package.json server/package-lock.json* ./server/
RUN cd server && npm install --omit=dev --no-audit --no-fund && npm cache clean --force
COPY server/*.mjs ./server/
COPY --from=build /app/dist ./dist
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
CMD ["node", "server/server.mjs"]
