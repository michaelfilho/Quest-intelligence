#!/usr/bin/env bash
# Compatibilidade com Git Bash/Linux; o executor isolado ? multiplataforma.
set -euo pipefail
cd "$(dirname "$0")/.."
npm run homologacao
