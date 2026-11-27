#!/usr/bin/env bash
# ATUALIZAÇÃO de uma instalação existente, em um comando (docs/INSTALACAO_VPS.md):
#   cd /opt/apps/quest-rinne-web && git fetch origin && git show origin/main:deploy/update.sh | bash
# Opções: | bash -s -- [SHA] [--prepare-only]
# Faz backup do PostgreSQL, preserva as imagens atuais, constrói, aplica migrations, sobe somente api e
# web e valida. Se falhar, volta sozinho para as imagens anteriores. Não altera n8n, volumes, arquivos
# de ambiente, Traefik ou Tailscale. A primeira instalação é feita por deploy/install.sh.
set -euo pipefail

main() {
  umask 077
  local source=/opt/apps/quest-rinne-web runtime=/opt/apps/quest-rinne-web-runtime sha="" prepare_only=0 arg
  for arg in "$@"; do
    case "$arg" in
      --prepare-only) prepare_only=1 ;;
      *) sha="$arg" ;;
    esac
  done
  exec 9> /tmp/quest-rinne-update.lock
  flock -n 9 || { echo 'Já existe uma instalação ou atualização em andamento.' >&2; exit 1; }
  if ! docker inspect quest-rinne-web-api-1 quest-rinne-web-web-1 > /dev/null 2>&1; then
    echo 'Aplicação não instalada: use deploy/install.sh.' >&2
    exit 1
  fi

  cd "$source"
  git fetch --quiet origin
  sha="${sha:-$(git rev-parse origin/main)}"
  echo "Commit: $sha"

  local prep output stage backup
  prep="$(mktemp /tmp/rinne-prepare.XXXXXX)"
  git show "$sha:deploy/prepare-release.sh" > "$prep"
  output="$(bash "$prep" "$sha")"
  rm -f "$prep"
  printf '%s\n' "$output"
  stage="$(printf '%s\n' "$output" | sed -n 's/^Release: //p')"
  backup="$(printf '%s\n' "$output" | sed -n 's/^Backup privado: //p')"
  [[ -d "$stage" && -d "$backup" ]] || { echo 'Preparação sem release ou backup.' >&2; exit 1; }
  if [[ "$prepare_only" == 1 ]]; then
    echo 'Preparado. Nada foi construído, migrado nem reiniciado.'
    return 0
  fi

  # shellcheck disable=SC1091
  source "$stage/compose-args.private.sh" # define o array COMPOSE descoberto nos containers
  sha256sum --check --status "$backup/input-files.sha256"
  sha256sum --check --status "$backup/db.dump.sha256"
  "${COMPOSE[@]}" -f "$stage/compose.override.json" config --quiet
  "${COMPOSE[@]}" -f "$stage/compose.override.json" build api web
  sha256sum --check --status "$backup/input-files.sha256"
  MIGRATION_DATABASE_URL="$(sed -n 's/^MIGRATION_DATABASE_URL=//p' "$runtime/deploy/secrets/migrate.env")" \
    "${COMPOSE[@]}" -f "$stage/compose.override.json" run --rm --no-deps -T -e MIGRATION_DATABASE_URL api node_modules/.bin/tsx src/migrate.ts

  local ok=0 attempt
  if "${COMPOSE[@]}" -f "$stage/compose.override.json" up -d --no-deps --no-build api web; then
    for attempt in $(seq 1 30); do
      if bash "$stage/deploy/check-release.sh" "$stage" > "$backup/check.log" 2>&1; then ok=1; break; fi
      sleep 3
    done
  fi

  if [[ "$ok" != 1 ]]; then
    echo "Validação falhou (tentativa ${attempt:-0}). Detalhes: $backup/check.log" >&2
    echo 'Voltando para as imagens anteriores; o banco atual é mantido (migrations não são desfeitas).' >&2
    "${COMPOSE[@]}" -f "$backup/rollback.private.json" up -d --no-deps --no-build api web
    exit 1
  fi
  cat "$backup/check.log"
  printf '%s %s\n' "$sha" "$stage" > "$runtime/deploy/installed"
  echo 'Atualização concluída.'
  echo "Rollback manual, se necessário:"
  echo "  source '$stage/compose-args.private.sh' && \"\${COMPOSE[@]}\" -f '$backup/rollback.private.json' up -d --no-deps --no-build api web"
}

# Tudo dentro de uma função e sem stdin: o script chega por pipe e nenhum comando pode consumi-lo.
main "$@" < /dev/null
