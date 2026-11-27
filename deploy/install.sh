#!/usr/bin/env bash
# PRIMEIRA INSTALAÇÃO do QUEST INTELLIGENCE (ambiente vazio), em um comando:
#   cd /opt/apps/quest-rinne-web && git fetch origin && git show origin/main:deploy/install.sh | bash
# Opções (| bash -s -- ...):
#   --check        só valida infraestrutura e configuração; não altera banco, não constrói, não sobe
#   --stop         interrompe a aplicação (remove os containers api/web; nenhum dado é apagado)
#   <SHA>          instala um commit específico
# Não depende de containers, imagens, releases, usuários ou SQLite anteriores. Reexecutável após falha.
# Nunca apaga banco, volume ou arquivo de configuração; não altera Traefik, Tailscale nem outros sistemas.
set -euo pipefail

SOURCE=/opt/apps/quest-rinne-web
RUNTIME=/opt/apps/quest-rinne-web-runtime
REFERENCE="${QUEST_CONFIG_BACKUP:-/opt/backups/quest-intelligence-cleanup-20261127-121400}"
PROJECT=quest-rinne-web
DB_CONTAINER=quest-rinne-db-1
DB_NAME=quest_rinne
NETWORK=quest-rinne_private
PORT=18372
NODE_IMAGE=node:24-alpine

fail() { echo "ERRO: $*" >&2; exit 1; }
step() { echo; echo "==> $*"; }
# Superusuário somente dentro do container do PostgreSQL, apenas para preparar o banco.
db_admin() { docker exec -i "$DB_CONTAINER" sh -c 'exec psql -X -q -t -A -v ON_ERROR_STOP=1 -U "${POSTGRES_USER:-postgres}" -d "$0"' "$1"; }
# O container enxerga somente a pasta do backup, em leitura.
reconcile() { docker run --rm -i -v "$REFERENCE:/reference:ro" "$NODE_IMAGE" node -e "$(cat "$STAGE/deploy/reconcile.cjs")" -- "$@"; }

stop_app() {
  local ids
  ids="$(docker ps -aq --filter "label=com.docker.compose.project=$PROJECT" --filter 'label=com.docker.compose.service=api')
$(docker ps -aq --filter "label=com.docker.compose.project=$PROJECT" --filter 'label=com.docker.compose.service=web')"
  for id in $ids; do docker rm -f "$id" > /dev/null; done
  echo 'Aplicação interrompida. Banco, volumes, redes e arquivos foram mantidos.'
}

main() {
  umask 077
  local sha="" check_only=0 arg
  for arg in "$@"; do
    case "$arg" in
      --check) check_only=1 ;;
      --stop) stop_app; return 0 ;;
      -*) fail "Opção desconhecida: $arg" ;;
      *) sha="$arg" ;;
    esac
  done
  exec 9> /tmp/quest-rinne-update.lock
  flock -n 9 || fail 'Já existe uma instalação ou atualização em andamento.'

  step 'Validando a infraestrutura'
  docker info > /dev/null || fail 'Docker indisponível.'
  docker compose version > /dev/null || fail 'Docker Compose indisponível.'
  command -v openssl > /dev/null || fail 'openssl não encontrado.'
  docker network inspect "$NETWORK" > /dev/null || fail "Rede $NETWORK não existe."
  [[ "$(docker inspect -f '{{.State.Running}}' "$DB_CONTAINER")" == true ]] || fail "Container $DB_CONTAINER parado."
  docker inspect -f '{{json .NetworkSettings.Networks}}' "$DB_CONTAINER" | grep -q "\"$NETWORK\"" || fail "$DB_CONTAINER fora da rede $NETWORK."
  [[ -z "$(docker ps -aq --filter "label=com.docker.compose.project=$PROJECT")" ]] || fail 'Já existem containers do projeto. Para atualizar use deploy/update.sh (ou install.sh --stop para reinstalar).'
  if command -v ss > /dev/null && ss -ltnH | awk '{print $4}' | grep -qE "[:.]$PORT\$"; then fail "Porta $PORT já está em uso."; fi
  [[ -d "$RUNTIME" ]] || fail "Diretório de runtime ausente: $RUNTIME"

  cd "$SOURCE"
  git fetch --quiet origin
  sha="${sha:-$(git rev-parse origin/main)}"
  git merge-base --is-ancestor "$sha" origin/main || fail 'O commit não pertence a origin/main.'
  echo "Commit: $sha"

  STAGE="$RUNTIME/.releases/$(date -u +%Y%m%dT%H%M%SZ)-${sha:0:10}"
  mkdir -p "$STAGE"
  chmod 700 "$STAGE"
  git archive "$sha" | tar -x -C "$STAGE"
  (cd "$STAGE"; while IFS= read -r f; do sha256sum -- "$f"; done < <(git -C "$SOURCE" ls-tree -r --name-only "$sha" -- server shared frontend deploy package.json)) > "$STAGE/source.sha256"
  (cd "$STAGE"; while IFS= read -r f; do sha256sum -- "$f"; done < <(git -C "$SOURCE" ls-tree -r --name-only "$sha" -- server/src server/db shared)) > "$STAGE/code.sha256"
  printf '%s\n' "$sha" > "$STAGE/prepared.sha"

  step 'Reconciliando a configuração (referência: backup privado)'
  local workdir
  local -a config_files env_files
  if [[ -n "${QUEST_COMPOSE_FILES:-}" ]]; then
    IFS=',' read -r -a config_files <<< "$QUEST_COMPOSE_FILES"
    IFS=',' read -r -a env_files <<< "${QUEST_ENV_FILES:-}"
    workdir="${QUEST_WORKDIR:-$RUNTIME}"
    echo '{}' > "$STAGE/reference.private.json"
    echo 'Aviso: arquivos informados manualmente; labels e redes não serão comparados com o backup.'
  else
    [[ -d "$REFERENCE" ]] || fail "Backup de configuração ausente: $REFERENCE (ou informe QUEST_COMPOSE_FILES, QUEST_ENV_FILES e QUEST_WORKDIR)."
    reconcile discover > "$STAGE/reference.private.json" || fail 'Não foi possível reconciliar pelo backup. Informe QUEST_COMPOSE_FILES, QUEST_ENV_FILES e QUEST_WORKDIR.'
    local fields
    fields="$(docker run --rm -i "$NODE_IMAGE" node -e 'const r=JSON.parse(require("node:fs").readFileSync(0,"utf8"));console.log(r.workdir);console.log(r.configFiles.join(","));console.log(r.envFiles.join(","))' < "$STAGE/reference.private.json")"
    workdir="$(sed -n 1p <<< "$fields")"
    IFS=',' read -r -a config_files <<< "$(sed -n 2p <<< "$fields")"
    IFS=',' read -r -a env_files <<< "$(sed -n 3p <<< "$fields")"
  fi

  COMPOSE=(docker compose -p "$PROJECT" --project-directory "$workdir")
  local f
  for f in "${config_files[@]}"; do [[ -f "$f" ]] || fail "Compose ausente: $f"; COMPOSE+=(-f "$f"); echo "  compose: $f"; done
  for f in "${env_files[@]}"; do [[ -z "$f" ]] && continue; [[ -f "$f" ]] || fail "Arquivo de ambiente ausente: $f"; COMPOSE+=(--env-file "$f"); echo "  ambiente: $f"; done
  declare -p COMPOSE > "$STAGE/compose-args.private.sh"

  step 'Preparando credenciais novas (privilégio mínimo)'
  local secrets="$RUNTIME/deploy/secrets"
  mkdir -p "$secrets"
  chmod 700 "$secrets"
  if [[ ! -s "$secrets/db.env" || ! -s "$secrets/migrate.env" ]]; then
    local migrator app reader
    migrator="$(openssl rand -hex 24)"; app="$(openssl rand -hex 24)"; reader="$(openssl rand -hex 24)"
    printf 'DATABASE_NAME=%s\nDATABASE_URL=postgres://qi_reader:%s@%s:5432/%s\nAPP_DATABASE_URL=postgres://qi_app:%s@%s:5432/%s\n' \
      "$DB_NAME" "$reader" "$DB_CONTAINER" "$DB_NAME" "$app" "$DB_CONTAINER" "$DB_NAME" > "$secrets/db.env"
    printf 'MIGRATION_DATABASE_URL=postgres://qi_migrator:%s@%s:5432/%s\n' "$migrator" "$DB_CONTAINER" "$DB_NAME" > "$secrets/migrate.env"
    chmod 600 "$secrets/db.env" "$secrets/migrate.env"
    echo "  geradas em $secrets (fora do Git; os arquivos de ambiente existentes não foram alterados)"
  else
    echo "  reutilizando $secrets"
  fi
  password_of() { sed -n "s#^$1=postgres://[^:]*:\([0-9a-f]*\)@.*#\1#p" "$2"; }

  # Override da release: imagens próprias, build do commit e o arquivo de segredos novo.
  (cd "$workdir"; "${COMPOSE[@]}" config --format json) > "$STAGE/base.private.json"
  docker run --rm -i "$NODE_IMAGE" node -e "$(cat "$STAGE/deploy/render-release.cjs")" -- --install "$STAGE" "$secrets/db.env" "$sha" < "$STAGE/base.private.json" > "$STAGE/compose.override.json"
  (cd "$workdir"; "${COMPOSE[@]}" -f "$STAGE/compose.override.json" config --format json) > "$STAGE/effective.private.json"
  { printf '{"config":'; cat "$STAGE/effective.private.json"; printf ',"reference":'; cat "$STAGE/reference.private.json"; printf '}'; } | docker run --rm -i "$NODE_IMAGE" node -e "$(cat "$STAGE/deploy/reconcile.cjs")" -- verify > /dev/null || fail 'A configuração efetiva não preserva a infraestrutura esperada.'
  echo '  porta, rede, labels do Traefik, middleware Tailscale e credenciais conferidos'

  if [[ "$check_only" == 1 ]]; then
    echo; echo 'Verificação concluída. Nada foi alterado no banco nem publicado.'
    return 0
  fi

  step 'Isolando integrações antigas e liberando o PostgreSQL'
  [[ "$(echo "SELECT count(*) FROM pg_database WHERE datname='$DB_NAME'" | db_admin postgres)" == 1 ]] || fail "Banco $DB_NAME não existe."
  { printf '\\set db %s\n\\set migrator_password %s\n\\set app_password %s\n\\set reader_password %s\n' \
      "$DB_NAME" "$(password_of MIGRATION_DATABASE_URL "$secrets/migrate.env")" "$(password_of APP_DATABASE_URL "$secrets/db.env")" "$(password_of DATABASE_URL "$secrets/db.env")"
    cat "$STAGE/server/db/bootstrap.sql"; } | db_admin postgres > /dev/null
  # Só instala sobre banco vazio (ou sobre uma instalação interrompida desta própria aplicação).
  local foreign
  foreign="$(echo "SELECT CASE WHEN to_regclass('app_meta.migrations') IS NOT NULL THEN 0 ELSE
      (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema','pg_toast') AND c.relkind IN ('r','v','m','p','S'))
    + (SELECT count(*) FROM pg_namespace WHERE nspname NOT LIKE 'pg\\_%' AND nspname NOT IN ('information_schema','public')) END" | db_admin "$DB_NAME")"
  if [[ "$foreign" != 0 ]]; then
    echo "ALTER DATABASE $DB_NAME ALLOW_CONNECTIONS false" | db_admin postgres
    fail "O banco $DB_NAME não está vazio ($foreign objetos). Conexões bloqueadas novamente; nada foi apagado."
  fi
  # Encerra sessões abertas por quaisquer credenciais que não sejam as novas.
  echo "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$DB_NAME' AND usename NOT LIKE 'qi\\_%' AND pid <> pg_backend_pid()" | db_admin postgres > /dev/null
  local superusers
  superusers="$(echo "SELECT string_agg(rolname, ', ') FROM pg_roles WHERE rolsuper AND rolcanlogin" | db_admin postgres)"
  echo "  somente as roles qi_* têm CONNECT. Atenção: superusuários ($superusers) continuam podendo conectar;"
  echo '  confirme que nenhum workflow antigo usa essas credenciais (docs/CONTRATOS_N8N.md).'

  step 'Construindo as imagens'
  "${COMPOSE[@]}" -f "$STAGE/compose.override.json" build api web

  step 'Executando as migrations'
  MIGRATION_DATABASE_URL="$(sed -n 's/^MIGRATION_DATABASE_URL=//p' "$secrets/migrate.env")" \
    "${COMPOSE[@]}" -f "$STAGE/compose.override.json" run --rm --no-deps -T -e MIGRATION_DATABASE_URL api node_modules/.bin/tsx src/migrate.ts

  step 'Publicando os containers'
  local ok=0 attempt
  if "${COMPOSE[@]}" -f "$STAGE/compose.override.json" up -d --no-deps --no-build api web; then
    for attempt in $(seq 1 40); do
      if bash "$STAGE/deploy/check-release.sh" "$STAGE" > "$STAGE/check.log" 2>&1; then ok=1; break; fi
      sleep 3
    done
  fi
  if [[ "$ok" != 1 ]]; then
    "${COMPOSE[@]}" -f "$STAGE/compose.override.json" logs --tail 40 api web > "$STAGE/containers.private.log" 2>&1 || true
    "${COMPOSE[@]}" -f "$STAGE/compose.override.json" rm -sf api web || true
    fail "Validação falhou. A aplicação foi interrompida; banco e dados mantidos. Detalhes: $STAGE/check.log e $STAGE/containers.private.log"
  fi
  cat "$STAGE/check.log"
  printf '%s %s\n' "$sha" "$STAGE" > "$RUNTIME/deploy/installed"

  step 'Instalação concluída'
  echo 'Crie o primeiro administrador (a senha temporária aparece uma única vez neste terminal):'
  echo '  docker exec -it quest-rinne-web-api-1 npm run user:admin -- <usuario> "Nome Completo"'
  echo 'Depois acesse https://questos.com.br/core/ pela Tailscale.'
}

# O script chega por pipe: tudo em função e sem stdin, para nenhum comando consumi-lo.
main "$@" < /dev/null
