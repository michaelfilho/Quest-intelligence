# Build a partir da RAIZ do projeto (precisa de ../shared):  docker build -f web/Dockerfile .
FROM node:24-alpine AS build
WORKDIR /app
COPY web/package.json web/package-lock.json web/
RUN cd web && npm ci
COPY shared shared
COPY web web
RUN cd web && npm run build

# nginx 1.30 = linha estável suportada (nginx.org, nov/2026). Imagem inclui os módulos auth_request e realip.
FROM nginx:1.30-alpine
COPY web/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY web/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --chmod=755 web/docker-entrypoint.d/40-real-ip.sh /docker-entrypoint.d/40-real-ip.sh
COPY --from=build /app/web/dist /usr/share/nginx/html
# Sem htpasswd montado, cria um arquivo vazio (AUTH_BASIC=off por padrão: o login individual da aplicação é o controle principal).
RUN touch /etc/nginx/htpasswd
ENV API_UPSTREAM=api:3333 AUTH_BASIC=off REAL_IP_FROM=""
EXPOSE 80
