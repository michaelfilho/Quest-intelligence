#!/usr/bin/env bash
# Verificação manual posterior à atualização; nunca implanta nem dispara rollback.
set -euo pipefail
STAGE="${1:?Informe o diretório preparado}"
[[ "$(realpath "$STAGE")" == "$STAGE" && "$(dirname "$STAGE")" == '/opt/apps/quest-rinne-web-runtime/.releases' ]]
SHA="$(cat "$STAGE/prepared.sha")"
[[ "$SHA" =~ ^[a-f0-9]{40}$ ]]
API=quest-rinne-web-api-1
WEB=quest-rinne-web-web-1
(cd "$STAGE"; sha256sum --check --status source.sha256)
for c in "$API" "$WEB"; do
  [[ "$(docker inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$c")" == "$SHA" ]]
done
docker exec -i -w /app "$API" sha256sum -c - < "$STAGE/code.sha256" > /dev/null
docker exec -w /usr/share/nginx/html "$WEB" sha256sum -c /etc/rinne/web-assets.sha256 > /dev/null
# A imagem web precisa ser a interface consolidada, publicada em /core/ e sem dados demonstrativos.
docker exec -w /usr/share/nginx/html "$WEB" sh -c 'grep -q "QUEST INTELLIGENCE" index.html && grep -q "/core/assets/" index.html'
docker exec -w /usr/share/nginx/html "$WEB" sh -c '! grep -rqE "Omni Retail|Ambiente de Demonstração|api/v1/bootstrap" .'
docker exec "$WEB" wget -qO /dev/null http://127.0.0.1/_health
docker exec "$API" node -e "$(cat "$STAGE/deploy/check-api.cjs");check().catch(()=>process.exit(1));"
printf 'Hash de código, assets, revisão e API interna verificados: %s\n' "$SHA"
