# Deploy na VPS

> **Nada deste documento foi executado.** Docker não existe na máquina de desenvolvimento, então as imagens e os compose **não foram homologados com execução real**. Cada passo que toca produção exige aprovação explícita.

## 0. Pré-requisitos

- HTTPS ativo no proxy reverso existente da VPS, necessário para o cookie `Secure` e para o microfone.
- Acesso para descobrir as redes reais do Docker. **Não presuma nomes de rede.**
  ```bash
  docker inspect quest-rinne-db-1 --format '{{json .NetworkSettings.Networks}}'   # → POSTGRES_NETWORK
  docker inspect <container-do-n8n> --format '{{json .NetworkSettings.Networks}}' # → N8N_NETWORK
  docker network ls && docker network inspect $(docker network ls -q) | grep Subnet # RINNE_SUBNET livre?
  ```

## 1. Role somente leitura

Produção; requer aprovação. Revise [sql/001_create_readonly_role.sql](../sql/001_create_readonly_role.sql), que só cria a role e concede CONNECT, USAGE e SELECT.

```bash
docker cp sql/001_create_readonly_role.sql quest-rinne-db-1:/tmp/
docker exec -it quest-rinne-db-1 psql -U postgres -d quest_rinne -v pwd="'<senha-forte>'" -f /tmp/001_create_readonly_role.sql
```

## 2. Configuração

```bash
cp deploy/.env.production.example deploy/.env.production && chmod 600 deploy/.env.production
mkdir -p deploy/data && chown 1000:1000 deploy/data && chmod 700 deploy/data
# (opcional) senha única extra do nginx: htpasswd -B -c deploy/htpasswd <usuario> e AUTH_BASIC="QUEST RINNE"
```

Preencha:
- `DATABASE_URL` com `quest_rinne_app_ro`;
- `POSTGRES_NETWORK`, `RINNE_SUBNET` e `RINNE_WEB_IP`;
- `REAL_IP_FROM` com o proxy da VPS, mais as faixas da Cloudflare se ela for usada;
- `IP_ALLOWLIST_BOOTSTRAP` com o IP de emergência;
- as variáveis `RINNE_N8N_*`. Mantenha `RINNE_N8N_ENABLED=false` até o workflow existir.

## 3. Subir

```bash
# sem integração de rede com o n8n:
docker compose -f docker-compose.prod.yml --env-file deploy/.env.production up -d --build
# com a API na rede do n8n (recomendado para webhooks/ferramentas privados):
docker compose -f docker-compose.prod.yml -f docker-compose.n8n.yml --env-file deploy/.env.production up -d --build
```

O que a configuração garante:
- **API:** sem porta publicada, sistema de arquivos somente leitura, `cap_drop: ALL`, `no-new-privileges`, `REQUIRE_PROXY=true` e `TRUST_PROXY` apontando para o IP fixo do nginx.
- **Web (nginx 1.30):** publicado só em `127.0.0.1:${WEB_PORT}`, que o proxy TLS da VPS encaminha. Também roda somente leitura e com capacidades mínimas.
- **Rotas internas:** `/api/internal/` é negado no nginx, e o n8n alcança a API pela rede Docker em `http://api:3333`.
- **Dados:** os volumes `deploy/data` guardam `app.db` e a allowlist, e sobrevivem a novos builds e deploys.
- **Healthcheck:** a API é verificada em `/api/health` (loopback). O encerramento é gracioso: SIGTERM fecha o servidor HTTP, o pool do PostgreSQL e o SQLite.

## 4. Primeiro acesso

```bash
docker compose -f docker-compose.prod.yml exec api npm run user:admin -- <usuario> "Nome"
```

A senha temporária é exibida uma única vez, e a troca é obrigatória no primeiro login. Depois:

1. Crie os usuários e perfis em Configurações.
2. Em Configurações → Controle de acesso por IP, confira se "Seu IP atual" é o seu IP público. Se não for, revise `REAL_IP_FROM`.
3. Adicione os IPs, ative o bloqueio e teste de uma rede fora da lista.

## 5. Conectar o banco real

[INTEGRACAO_POSTGRESQL.md](INTEGRACAO_POSTGRESQL.md).

## 6. Conectar o n8n

1. Construa o workflow conforme [CONTRATOS_WEBHOOKS.md](CONTRATOS_WEBHOOKS.md). Toda a IA fica nele.
2. Defina o mesmo `RINNE_N8N_WEBHOOK_SECRET` nos dois lados, além de `RINNE_N8N_WEBHOOK_URL`, `RINNE_TOOLS_BASE_URL=http://api:3333/api/internal/tools` e, opcionalmente, `RINNE_N8N_ALLOWED_IPS` com o IP do container do n8n.
3. Configure `RINNE_N8N_ENABLED=true` e recrie a API.
4. Em Configurações → Inteligência RINNE, clique em **Testar conectividade**. O teste é um PING, que o workflow deve responder sem acionar modelos.

## 7. Backup e rollback

[BACKUP_ROLLBACK.md](BACKUP_ROLLBACK.md). Rode `bash deploy/backup.sh` **antes** de cada deploy.

## Checklist de deploy

- [ ] HTTPS ativo; HTTP redireciona para HTTPS
- [ ] Redes reais descobertas (`POSTGRES_NETWORK`, `N8N_NETWORK`); `RINNE_SUBNET` livre
- [ ] Role `quest_rinne_app_ro` criada (aprovado) e testada (`Somente leitura: Sim` em Configurações → Banco de dados)
- [ ] `deploy/.env.production` com `chmod 600`; `deploy/data` com `chown 1000:1000` e `chmod 700`
- [ ] `REAL_IP_FROM` e `TRUST_PROXY` conferidos ("Seu IP atual" correto)
- [ ] `IP_ALLOWLIST_BOOTSTRAP` definido
- [ ] Porta 5432 não publicada; API sem `ports`; web só em `127.0.0.1`
- [ ] `/api/internal/` responde 403 pela internet
- [ ] Administrador criado; senha trocada; usuários individuais com perfis
- [ ] Bloqueio por IP ativado e testado de fora
- [ ] `npm audit` nos dois pacotes; `npm test` verde no commit do deploy
- [ ] Backup inicial executado; cron diário agendado
- [ ] n8n: assinatura validada no workflow; PING ok; ferramentas testadas com usuário restrito
- [ ] Logs da API sem senhas, tokens ou URL do banco
