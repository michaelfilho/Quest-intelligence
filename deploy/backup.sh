#!/usr/bin/env bash
# Backup do banco quest_rinne (aplicação e dados empresariais) na VPS. Não interrompe o serviço.
# Uso:  bash deploy/backup.sh [/caminho/destino]
set -euo pipefail
umask 077
DEST="${1:-/opt/backups/quest-rinne}"
DB="${QUEST_DB_CONTAINER:-quest-rinne-db-1}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$DEST"
docker exec "$DB" sh -c 'exec pg_dump -U "${POSTGRES_USER:-postgres}" -d quest_rinne -Fc' > "$DEST/quest_rinne-$STAMP.dump.part"
docker exec -i "$DB" pg_restore --list < "$DEST/quest_rinne-$STAMP.dump.part" > /dev/null
mv "$DEST/quest_rinne-$STAMP.dump.part" "$DEST/quest_rinne-$STAMP.dump"
echo "Backup: $DEST/quest_rinne-$STAMP.dump"
# Retenção sugerida: 30 dias (ajuste conforme a política da Quest).
find "$DEST" -maxdepth 1 -name 'quest_rinne-*.dump' -mtime +30 -delete
