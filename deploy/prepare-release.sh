#!/usr/bin/env bash
# PREPARAÇÃO MANUAL na VPS: backup + release candidata. NÃO constrói, reinicia ou implanta serviços.
set -euo pipefail
umask 077
SOURCE=/opt/apps/quest-rinne-web
RUNTIME=/opt/apps/quest-rinne-web-runtime
API=quest-rinne-web-api-1
WEB=quest-rinne-web-web-1
SHA="${1:?Informe o SHA publicado e revisado}"
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || { echo 'Informe o SHA completo' >&2; exit 1; }
cd "$SOURCE"
git cat-file -e "$SHA^{commit}"
git merge-base --is-ancestor "$SHA" origin/main
[[ "$(realpath "$RUNTIME")" == "$RUNTIME" ]] || { echo 'Runtime redirecionado; revisar caminhos' >&2; exit 1; }
STAMP="$(date -u +%Y%m%dT%H%M%SZ)-${SHA:0:10}"
STAGE="$RUNTIME/.releases/$STAMP"
BACKUP="/opt/backups/quest-rinne/$STAMP"
[[ ! -e "$STAGE" && ! -e "$BACKUP" ]]
mkdir -p "$STAGE" "$BACKUP"
chmod 700 "$STAGE" "$BACKUP"
git archive "$SHA" | tar -x -C "$STAGE"

# Descobrir a configuração efetiva pelas labels, sem presumir os ajustes da cópia runtime.
WORKDIR="$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project.working_dir"}}' "$API")"
FILES="$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project.config_files"}}' "$API")"
ENVFILES="$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project.environment_file"}}' "$API")"
[[ -d "$WORKDIR" && -n "$FILES" && "$FILES" != '<no value>' ]]
COMPOSE=(docker compose -p quest-rinne-web --project-directory "$WORKDIR")
IFS=',' read -r -a CONFIG_FILES <<< "$FILES"
for f in "${CONFIG_FILES[@]}"; do [[ -f "$f" ]]; COMPOSE+=(-f "$f"); done
ENV_FILES=()
if [[ -n "$ENVFILES" && "$ENVFILES" != '<no value>' ]]; then
  IFS=',' read -r -a ENV_FILES <<< "$ENVFILES"
  for f in "${ENV_FILES[@]}"; do [[ -f "$f" ]]; COMPOSE+=(--env-file "$f"); done
fi
(cd "$WORKDIR"; "${COMPOSE[@]}" config --format json) > "$BACKUP/effective.private.json"
declare -p COMPOSE > "$STAGE/compose-args.private.sh"
INPUT_FILES=("${CONFIG_FILES[@]}" "${ENV_FILES[@]}")
if [[ -f "$WORKDIR/.env" ]]; then INPUT_FILES+=("$WORKDIR/.env"); fi
sha256sum -- "${INPUT_FILES[@]}" > "$BACKUP/input-files.sha256"
docker inspect "$API" "$WEB" > "$BACKUP/containers.private.json"
tar --exclude='./.releases' --exclude='./node_modules' --exclude='./.git' -C "$RUNTIME" -czf "$BACKUP/runtime.private.tar.gz" .
# Comparação privada: identificar hotfixes de código/nginx da cópia runtime antes de substituí-los.
: > "$BACKUP/runtime-to-release.private.diff"
while IFS= read -r f; do
  if [[ -f "$RUNTIME/$f" && -f "$STAGE/$f" ]]; then
    diff -u "$RUNTIME/$f" "$STAGE/$f" >> "$BACKUP/runtime-to-release.private.diff" || [[ "$?" == 1 ]]
  fi
done < <(git ls-tree -r --name-only "$SHA" -- server/src shared web/src web/vite.config.ts web/nginx.conf.template web/security-headers.conf web/docker-entrypoint.d server/Dockerfile web/Dockerfile)

# Backup consistente do SQLite; não abre conexão PostgreSQL.
# A API existente verifica sua própria conexão. Funciona com allowlist ativa:
# loopback direto sem headers de proxy é o healthcheck local já autorizado pelo backend.
docker exec "$API" node -e "$(cat "$STAGE/deploy/check-api.cjs");check().catch(()=>process.exit(1));"
TMPDB="/tmp/rinne-before-$STAMP.db"
docker exec "$API" node -e 'const {DatabaseSync}=require("node:sqlite");const path=require("node:path");const d=new DatabaseSync(path.join(process.env.DATA_DIR||"/app/server/data","app.db"),{readOnly:true}); d.prepare("VACUUM INTO ?").run(process.argv[1]);d.close();const b=new DatabaseSync(process.argv[1],{readOnly:true});if(b.prepare("PRAGMA integrity_check").get().integrity_check!=="ok")process.exit(1);b.close();' "$TMPDB"
# Streaming binário sem TTY também funciona quando /tmp é tmpfs.
docker exec "$API" node -e 'require("node:fs").createReadStream(process.argv[1]).on("error",()=>process.exit(1)).pipe(process.stdout)' "$TMPDB" > "$BACKUP/app.db.part"
[[ -s "$BACKUP/app.db.part" ]]
EXPECTED_DB_SHA="$(docker exec "$API" node -e 'const f=require("node:fs"),c=require("node:crypto");process.stdout.write(c.createHash("sha256").update(f.readFileSync(process.argv[1])).digest("hex"))' "$TMPDB")"
[[ "$EXPECTED_DB_SHA" =~ ^[0-9a-f]{64}$ ]]
printf '%s  %s\n' "$EXPECTED_DB_SHA" "$BACKUP/app.db.part" | sha256sum --check --status
mv -- "$BACKUP/app.db.part" "$BACKUP/app.db"
docker exec "$API" node -e 'require("node:fs").unlinkSync(process.argv[1])' "$TMPDB"
sha256sum "$BACKUP/app.db" > "$BACKUP/app.db.sha256"

PREV_API="quest-rinne-rollback-api:$STAMP"
PREV_WEB="quest-rinne-rollback-web:$STAMP"
docker image tag "$(docker inspect -f '{{.Image}}' "$API")" "$PREV_API"
docker image tag "$(docker inspect -f '{{.Image}}' "$WEB")" "$PREV_WEB"
RENDER="$(cat "$STAGE/deploy/render-release.cjs")"
private_input() {
  printf '{"config":'; cat "$BACKUP/effective.private.json"
  printf ',"containers":'; cat "$BACKUP/containers.private.json"; printf '}'
}
private_input | docker exec -i "$API" node -e "$RENDER" -- --prepare-release "$STAGE" > "$STAGE/compose.override.json"
private_input | docker exec -i "$API" node -e "$RENDER" -- --prepare-release "$STAGE" "{\"api\":\"$PREV_API\",\"web\":\"$PREV_WEB\"}" > "$BACKUP/rollback.private.json"
chmod 600 "$STAGE/compose.override.json" "$STAGE/compose-args.private.sh" "$BACKUP/"*
printf 'PREPARADO, sem deploy.\nRelease: %s\nBackup privado: %s\n' "$STAGE" "$BACKUP"
printf 'Revisar configurações privadas e mounts antes de executar build/up conforme docs/ATUALIZACAO_PRODUCAO.md.\n'
