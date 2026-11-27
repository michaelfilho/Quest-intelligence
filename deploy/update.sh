#!/usr/bin/env bash
# ATUALIZAÇÃO NA VPS em um comando (docs/ATUALIZACAO_PRODUCAO.md):
#   cd /opt/apps/quest-rinne-web && git fetch origin && git show origin/main:deploy/update.sh | bash
# Opções: | bash -s -- [SHA] [--prepare-only]
# Faz backup, preserva as imagens atuais, constrói, sobe somente api e web e valida.
# Se a subida ou a validação falhar, volta sozinho para as imagens anteriores. Não toca no PostgreSQL,
# no n8n, nos volumes, nos arquivos de ambiente nem no Traefik.
set -euo pipefail

main() {
  umask 077
  local source=/opt/apps/quest-rinne-web sha="" prepare_only=0 arg
  for arg in "$@"; do
    case "$arg" in
      --prepare-only) prepare_only=1 ;;
      *) sha="$arg" ;;
    esac
  done
  exec 9> /tmp/quest-rinne-update.lock
  flock -n 9 || { echo 'Já existe uma atualização em andamento.' >&2; exit 1; }

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
  if [[ -s "$backup/runtime-to-release.private.diff" ]]; then
    echo "Atenção: a cópia runtime difere do código publicado. Revisar: $backup/runtime-to-release.private.diff"
  fi
  if [[ "$prepare_only" == 1 ]]; then
    echo 'Preparado. Nada foi construído nem reiniciado.'
    return 0
  fi

  # shellcheck disable=SC1091
  source "$stage/compose-args.private.sh" # define o array COMPOSE descoberto nos containers
  sha256sum --check --status "$backup/input-files.sha256"
  sha256sum --check --status "$backup/app.db.sha256"
  "${COMPOSE[@]}" -f "$stage/compose.override.json" config --quiet
  "${COMPOSE[@]}" -f "$stage/compose.override.json" build api web
  sha256sum --check --status "$backup/input-files.sha256"

  local ok=0 attempt
  if "${COMPOSE[@]}" -f "$stage/compose.override.json" up -d --no-deps --no-build api web; then
    for attempt in $(seq 1 30); do
      if bash "$stage/deploy/check-release.sh" "$stage" > "$backup/check.log" 2>&1; then ok=1; break; fi
      sleep 3
    done
  fi

  if [[ "$ok" != 1 ]]; then
    echo "Validação falhou (tentativa ${attempt:-0}). Detalhes: $backup/check.log" >&2
    echo 'Voltando para as imagens anteriores; o SQLite atual é mantido.' >&2
    "${COMPOSE[@]}" -f "$backup/rollback.private.json" up -d --no-deps --no-build api web
    exit 1
  fi
  cat "$backup/check.log"
  echo 'Atualização concluída.'
  echo "Rollback manual, se necessário:"
  echo "  source '$stage/compose-args.private.sh' && \"\${COMPOSE[@]}\" -f '$backup/rollback.private.json' up -d --no-deps --no-build api web"
}

# Tudo dentro de uma função e sem stdin: o script chega por pipe e nenhum comando pode consumi-lo.
main "$@" < /dev/null
