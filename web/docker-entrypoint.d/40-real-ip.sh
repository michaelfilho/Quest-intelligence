#!/bin/sh
# Gera /etc/nginx/conf.d/00-real-ip.conf a partir de REAL_IP_FROM (IPs/CIDRs separados por espaço ou vírgula).
# Só esses proxies podem informar o IP do cliente via X-Forwarded-For. Vazio = o IP da conexão TCP é o cliente.
# Exemplos: "172.30.57.1" (proxy no host da VPS)  ·  faixas oficiais da Cloudflare + IP do proxy da VPS.
set -eu
out=/etc/nginx/conf.d/00-real-ip.conf
: > "$out"
for cidr in $(echo "${REAL_IP_FROM:-}" | tr ',' ' '); do
  case "$cidr" in
    *[!0-9a-fA-F:./]*) echo "REAL_IP_FROM: valor inválido ignorado: $cidr" >&2 ;;
    *) echo "set_real_ip_from $cidr;" >> "$out" ;;
  esac
done
if [ -s "$out" ]; then
  echo "real_ip_header X-Forwarded-For;" >> "$out"
  echo "real_ip_recursive on;" >> "$out"
fi
