#!/usr/bin/env bash
# Homologação visual local: sobe API + frontend (build de produção via vite preview) com banco da aplicação
# TEMPORÁRIO, sem PostgreSQL e sem n8n, cria um administrador de teste e roda e2e/homologacao.mjs.
# Não toca no server/data local nem em nenhum serviço externo.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
export DATA_DIR="$(cygpath -w "$TMP" 2>/dev/null || echo "$TMP")" PORT=3333 HOST=127.0.0.1 COOKIE_SECURE=false RINNE_N8N_ENABLED=false
cd "$ROOT/server"
PW="$(npx tsx src/cli.ts homolog.admin "Administrador de Homologação" | sed -n 's/^Senha temporária (exibida só agora): //p')"
npx tsx src/index.ts > "$TMP/api.log" 2>&1 &
cd "$ROOT/web" && npm run build >/dev/null 2>&1 && (npx vite preview --port 4173 --strictPort > "$TMP/web.log" 2>&1 &)
for i in $(seq 1 60); do curl -s -m 1 http://localhost:4173/api/health >/dev/null && break; sleep 0.5; done
cd "$ROOT/e2e" && BASE=http://localhost:4173 ADMIN_USER=homolog.admin ADMIN_TEMP_PASSWORD="$PW" node homologacao.mjs
CODE=$?
echo "logs da API e do frontend: $TMP"
exit $CODE
