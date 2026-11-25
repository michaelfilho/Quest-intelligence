# Backup e rollback

## O que precisa de backup

| dado | onde | responsável |
|---|---|---|
| Banco analítico `quest_rinne` | PostgreSQL existente | **fora do RINNE** (rotina atual da infraestrutura). O RINNE só lê |
| Banco da aplicação (usuários, perfis, sessões, auditoria, conversas, reuniões, configurações) | `deploy/data/app.db` (volume) | `deploy/backup.sh` |
| Allowlist de IPs | `deploy/data/ip-allowlist.json` | `deploy/backup.sh` |
| Configuração | `deploy/.env.production`, `deploy/htpasswd` | cópia manual segura (contêm segredos; nunca no git) |

## Backup

```bash
bash deploy/backup.sh /caminho/seguro/backups      # cópia a quente via SQLite VACUUM INTO; arquivo chmod 600
```

- Agende diariamente (cron) e envie para **fora da VPS**.
- Teste a restauração periodicamente.
- O script mantém 30 dias de histórico no destino.

## Restauração

```bash
docker compose -f docker-compose.prod.yml --env-file deploy/.env.production stop api
tar -xzf rinne-app-AAAAMMDD-HHMMSS.tar.gz -C /tmp/restauro
cp /tmp/restauro/backup-*.db deploy/data/app.db && rm -f deploy/data/app.db-wal deploy/data/app.db-shm
cp /tmp/restauro/ip-allowlist.json deploy/data/ 2>/dev/null || true
chown 1000:1000 deploy/data/* && chmod 600 deploy/data/*
docker compose -f docker-compose.prod.yml --env-file deploy/.env.production start api
```

## Rollback de versão

1. **Antes de cada deploy:** rode o backup, anote o commit em produção (`git rev-parse HEAD`) e marque as imagens:

   ```bash
   docker tag $(docker compose -f docker-compose.prod.yml images -q api) rinne-api:anterior
   docker tag $(docker compose -f docker-compose.prod.yml images -q web) rinne-web:anterior
   ```

2. **Para voltar:** `git checkout <commit-anterior>` e `docker compose … up -d --build`.

3. **Migrations:** as migrations do SQLite (`server/migrations`) são **aditivas**. Uma versão anterior do código ignora tabelas novas. Se uma migration futura alterar estrutura existente, restaure o backup feito **antes** do deploy.

4. **O banco analítico não é afetado** por rollback do RINNE.

## Recuperação de acesso

Se todos os administradores perderem o acesso:

```bash
docker compose -f docker-compose.prod.yml exec api npm run user:admin -- <usuario>
```

O comando cria ou recupera o administrador, revoga as sessões e exige troca de senha. A allowlist de IP tem o acesso de emergência `IP_ALLOWLIST_BOOTSTRAP`.
