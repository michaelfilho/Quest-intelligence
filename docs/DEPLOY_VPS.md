# Deploy na VPS

Procedimento atual, com preservação dos ajustes locais: [ATUALIZACAO_PRODUCAO.md](ATUALIZACAO_PRODUCAO.md). A publicação no GitHub é separada da atualização manual na VPS. As seções seguintes incluem referência da instalação anterior; não reexecutar criação de role, banco ou configuração de rede da instalação existente.

## Atualização da instalação existente

Produção informada pelo responsável: fonte em `/opt/apps/quest-rinne-web`, execução em `/opt/apps/quest-rinne-web-runtime`, projeto Docker `quest-rinne-web`, frontend na porta 18372 e PostgreSQL na rede `quest-rinne_private`. Estas informações não foram verificadas por acesso remoto nesta tarefa.

1. Publicar o commit local somente após autorização e usar a rotina existente para atualizar a fonte e a cópia de execução. Não executar `git reset`, limpeza ou cópia de diretórios que substitua SQLite, arquivo de ambiente, allowlist, credenciais ou volumes.
2. Antes da atualização, identificar os arquivos Compose/env efetivamente usados pelo projeto existente e fazer backup consistente e verificável do SQLite e configurações. Não assumir que os exemplos abaixo representam a configuração já adaptada na VPS.
3. Preservar a `DATABASE_URL`/role e a rede já existentes. Não criar PostgreSQL, publicar 5432 ou reexecutar criação de role. Preservar a porta 18372, o proxy e os volumes efetivos.
4. Para o frontend usar build arg `VITE_BASE_PATH=/core/`; na API, `APP_BASE_PATH=/core/`. No Compose versionado, `PUBLIC_BASE_PATH=/core/` alimenta ambos. O Traefik remove `/core` antes de encaminhar ao nginx; não adicionar outro strip nem `proxy_cookie_path`.
5. Reconstruir apenas os serviços da aplicação pela configuração existente, preservando dados. Não usar `down -v`, remover volumes ou aplicar scripts SQL analíticos. Os arquivos de teste e o PGlite são dependências de desenvolvimento, sem uso na imagem da API.
6. Validar `/core/`, assets, login/logout, cookie Path `/core/`, downloads, impressão, permissões e `/core/api/metadata/schema`. Consultar os motivos dos mapeamentos indisponíveis e executar o verificador somente leitura da [integração](INTEGRACAO_POSTGRESQL.md).
7. Reconciliar números reais por domínio e registrar evidências antes de declarar homologação. Se falhar, usar o rollback existente com o backup anterior, sem trocar a role ou o PostgreSQL.

Nenhum desses passos de infraestrutura foi executado nesta tarefa. A publicação no GitHub não realiza deploy. As seções seguintes são referência para instalação/configuração, não uma ordem para recriar a infraestrutura em funcionamento.

> **Nada deste documento foi executado.** Docker não existe na máquina de desenvolvimento, então as imagens e os compose **não foram homologados com execução real**. Cada passo que toca produção exige aprovação explícita. O deploy não deve interferir nos demais sistemas da Quest hospedados na VPS.

## 0. Pré-requisitos

- HTTPS ativo no proxy reverso existente da VPS, necessário para o cookie `Secure` e para o HSTS.
- Acesso para descobrir a rede real do Docker. **Não presuma nomes de rede.**
  ```bash
  docker inspect quest-rinne-db-1 --format '{{json .NetworkSettings.Networks}}'   # → POSTGRES_NETWORK
  docker network ls && docker network inspect $(docker network ls -q) | grep Subnet # RINNE_SUBNET livre?
  ```
- O PostgreSQL existente **não** é substituído nem recriado, e sua porta 5432 **não** é publicada.

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
touch deploy/htpasswd && chmod 600 deploy/htpasswd # arquivo exigido pelo bind mount, mesmo com AUTH_BASIC=off
# (opcional) senha única extra do nginx: htpasswd -B -c deploy/htpasswd <usuario> e AUTH_BASIC="QUEST RINNE"
```

Preencha:
- `DATABASE_URL` com `quest_rinne_app_ro`;
- `POSTGRES_NETWORK`, `RINNE_SUBNET` e `RINNE_WEB_IP`;
- `REAL_IP_FROM` com o proxy da VPS, mais as faixas da Cloudflare se ela for usada;
- `IP_ALLOWLIST_BOOTSTRAP` com o IP de emergência.

## 3. Subir

```bash
docker compose -f docker-compose.prod.yml --env-file deploy/.env.production up -d --build
```

O que a configuração garante:
- **API:** sem porta publicada, sistema de arquivos somente leitura, `cap_drop: ALL`, `no-new-privileges`, `REQUIRE_PROXY=true` e `TRUST_PROXY` apontando para o IP fixo do nginx.
- **Web (nginx 1.30):** publicado só em `127.0.0.1:${WEB_PORT}`, que o proxy TLS da VPS encaminha. Também roda somente leitura e com capacidades mínimas.
- **Dados:** o volume `deploy/data` guarda `app.db` (usuários, perfis, sessões, auditoria, configurações) e a allowlist, e sobrevive a novos builds e deploys.
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

[INTEGRACAO_POSTGRESQL.md](INTEGRACAO_POSTGRESQL.md). Os workflows do n8n que sincronizam o iClips com o PostgreSQL **não são tocados**: o RINNE só lê o resultado e monitora as sincronizações na tela Qualidade dos dados.

## 6. Backup e rollback

[BACKUP_ROLLBACK.md](BACKUP_ROLLBACK.md). Rode `bash deploy/backup.sh` **antes** de cada deploy.

## Checklist de deploy

- [ ] HTTPS ativo; HTTP redireciona para HTTPS
- [ ] Rede real descoberta (`POSTGRES_NETWORK`); `RINNE_SUBNET` livre
- [ ] Role `quest_rinne_app_ro` criada (aprovado) e testada (`Somente leitura: Sim` em Configurações → Banco de dados)
- [ ] `deploy/.env.production` com `chmod 600`; `deploy/data` com `chown 1000:1000` e `chmod 700`
- [ ] `REAL_IP_FROM` e `TRUST_PROXY` conferidos ("Seu IP atual" correto)
- [ ] `IP_ALLOWLIST_BOOTSTRAP` definido
- [ ] Porta 5432 não publicada; API sem `ports`; web só em `127.0.0.1`
- [ ] Cabeçalhos conferidos com `curl -I` (CSP, HSTS, `Permissions-Policy` com câmera/microfone/localização bloqueados)
- [ ] Administrador criado; senha trocada; usuários individuais com perfis
- [ ] Bloqueio por IP ativado e testado de fora
- [ ] `npm audit` nos dois pacotes; `npm test` verde no commit do deploy
- [ ] Backup inicial executado; cron diário agendado
- [ ] Logs da API sem senhas, tokens ou URL do banco
