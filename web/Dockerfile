# Build a partir da RAIZ do projeto (precisa de ../shared):  docker build -f web/Dockerfile .
FROM node:24-alpine AS build
ARG VITE_BASE_PATH=/
ENV VITE_BASE_PATH=$VITE_BASE_PATH
WORKDIR /app
COPY package.json ./
COPY web/package.json web/package-lock.json web/
RUN cd web && npm ci
COPY shared shared
COPY web web
RUN cd web && npm run build
RUN cd web/dist && find . -type f -exec sha256sum {} \; > /app/web-assets.sha256

# nginx 1.30 = linha estável suportada (nginx.org, nov/2026). Imagem inclui os módulos auth_request e realip.
FROM nginx:1.30-alpine
ARG RINNE_COMMIT_SHA=unknown
LABEL org.opencontainers.image.revision=$RINNE_COMMIT_SHA
COPY web/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY web/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --chmod=755 web/docker-entrypoint.d/40-real-ip.sh /docker-entrypoint.d/40-real-ip.sh
COPY --from=build /app/web/dist /usr/share/nginx/html
COPY --from=build /app/web-assets.sha256 /etc/rinne/web-assets.sha256
# Sem htpasswd montado, cria um arquivo vazio (AUTH_BASIC=off por padrão: o login individual da aplicação é o controle principal).
RUN touch /etc/nginx/htpasswd
ENV API_UPSTREAM=api:3333 AUTH_BASIC=off REAL_IP_FROM=""
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1/_health >/dev/null || exit 1
