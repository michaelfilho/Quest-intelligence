# Build a partir da RAIZ do projeto (precisa de ../shared):  docker build -f server/Dockerfile .
FROM node:24-alpine
WORKDIR /app
COPY package.json ./
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3333
COPY server/package.json server/package-lock.json server/
RUN cd server && npm ci --omit=dev && npm cache clean --force
COPY shared shared
COPY server/src server/src
COPY server/tsconfig.json server/
COPY server/migrations server/migrations
# Allowlist de IPs (único arquivo gravável). Em produção é um volume.
RUN mkdir -p /app/server/data && chown node:node /app/server/data
USER node
WORKDIR /app/server
EXPOSE 3333
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:3333/api/health >/dev/null || exit 1
CMD ["node_modules/.bin/tsx", "src/index.ts"]
