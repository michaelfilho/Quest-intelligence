#!/usr/bin/env bash
# Backup do QUEST RINNE na VPS (dados da APLICAÇÃO: usuários, perfis, sessões, auditoria, conversas, reuniões,
# configurações e allowlist de IPs). O banco analítico PostgreSQL NÃO é tocado aqui.
# Uso (na pasta do projeto, na VPS):  bash deploy/backup.sh [/caminho/destino]
# Requer a API em execução (cópia consistente a quente via SQLite "VACUUM INTO").
set -euo pipefail
DEST="${1:-./backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
COMPOSE="docker compose -f docker-compose.prod.yml --env-file deploy/.env.production"
mkdir -p "$DEST"

# 1) Cópia consistente do SQLite dentro do container (não interrompe o serviço).
$COMPOSE exec -T api node -e "
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync('/app/server/data/app.db');
  db.exec(\"VACUUM INTO '/app/server/data/backup-$STAMP.db'\");
  db.close();
"
# 2) Empacota a cópia + allowlist e remove a cópia temporária do volume.
tar -C deploy/data -czf "$DEST/rinne-app-$STAMP.tar.gz" "backup-$STAMP.db" $( [ -f deploy/data/ip-allowlist.json ] && echo ip-allowlist.json )
rm -f "deploy/data/backup-$STAMP.db"
chmod 600 "$DEST/rinne-app-$STAMP.tar.gz"
echo "Backup: $DEST/rinne-app-$STAMP.tar.gz"
# Retenção sugerida: manter 30 dias (ajuste conforme a política da Quest).
find "$DEST" -name 'rinne-app-*.tar.gz' -mtime +30 -delete
