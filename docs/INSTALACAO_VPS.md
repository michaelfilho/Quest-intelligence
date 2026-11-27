# Instalação, atualização e recuperação na VPS

Para o responsável pela VPS. **Nada disto foi executado na VPS**: os scripts foram testados com Docker simulado e PostgreSQL real local ([RELATORIO_TESTES.md](RELATORIO_TESTES.md)).

## Primeira instalação

```bash
cd /opt/apps/quest-rinne-web && git fetch origin && git show origin/main:deploy/install.sh | bash
```

Recomendado: rodar antes a verificação, que não altera o banco nem publica:

```bash
cd /opt/apps/quest-rinne-web && git fetch origin && git show origin/main:deploy/install.sh | bash -s -- --check
```

Sessão Bash com permissão de Docker, `/opt/apps` e `/opt/backups`. O instalador:

1. Valida Docker, rede `quest-rinne_private`, container `quest-rinne-db-1`, porta 18372 livre e ausência de containers do projeto.
2. Lê do backup `/opt/backups/quest-intelligence-cleanup-20261127-121400` a inspeção dos containers antigos, **somente** caminhos dos arquivos Compose/ambiente, labels e redes (nenhum valor de ambiente). Nenhum backup é restaurado.
3. Gera credenciais novas em `/opt/apps/quest-rinne-web-runtime/deploy/secrets/` (permissão 600). Os arquivos de ambiente existentes **não são alterados**; as novas variáveis entram por um override.
4. Confere a configuração efetiva: porta 18372, rede, labels do Traefik, `quest-rinne-web-tailscale-only` e credenciais `qi_reader`/`qi_app`.
5. Cria as roles, revoga `CONNECT` de `PUBLIC`, libera `ALLOW_CONNECTIONS` e exige banco vazio (senão bloqueia de novo e aborta).
6. Constrói as imagens, executa as migrations e sobe `api` e `web`.
7. Valida revisão e hashes das imagens, interface em `/core/`, banco e autenticação. **Se falhar, remove os dois containers** e mantém banco e arquivos. Pode ser executado de novo.

### Se o backup não permitir a reconciliação

```bash
export QUEST_COMPOSE_FILES=/caminho/compose.yml,/caminho/override-seguranca.yml
export QUEST_ENV_FILES=/caminho/arquivo.env
export QUEST_WORKDIR=/opt/apps/quest-rinne-web-runtime
```

e repetir o comando. Nesse caso labels e redes não são comparados com o backup; porta, middleware e credenciais continuam conferidos. `QUEST_CONFIG_BACKUP` aponta outra pasta de referência.

Se a mensagem disser que `DATABASE_URL` não usa `qi_reader`, algum arquivo Compose define a variável em `environment:`, que tem precedência: remover essa linha **do arquivo da VPS**.

## Primeiro administrador

```bash
docker exec -it quest-rinne-web-api-1 npm run user:admin -- <usuario> "Nome Completo"
```

A senha temporária aparece **uma única vez** no terminal; não fica em log nem em arquivo. No primeiro acesso a troca é obrigatória. O mesmo comando recupera um administrador (gera nova senha, encerra as sessões dele e zera bloqueios de tentativas).

Depois do primeiro acesso, em *Configurações → Controle de acesso por IP*: confirmar que "Seu IP atual" é o esperado e só então ligar o bloqueio, se desejado. Definir `IP_ALLOWLIST_BOOTSTRAP` antes, como entrada de emergência.

## Atualizações

```bash
cd /opt/apps/quest-rinne-web && git fetch origin && git show origin/main:deploy/update.sh | bash
```

Descobre a configuração pelos containers, faz `pg_dump` verificado em `/opt/backups/quest-rinne/<release>/`, marca as imagens atuais, constrói, aplica migrations, sobe e valida; se falhar, volta às imagens anteriores. `| bash -s -- --prepare-only` só prepara.

## Interromper, voltar e restaurar

| situação | ação |
|---|---|
| interromper a primeira instalação | `git show origin/main:deploy/install.sh \| bash -s -- --stop` (remove `api` e `web`; não apaga dados) |
| voltar a versão depois de atualizar | comando de rollback exibido ao fim do `update.sh` |
| backup avulso | `bash deploy/backup.sh` |
| restaurar dados | **manual e deliberado**: parar `api`, fazer um backup do estado atual, restaurar o `.dump` escolhido com `pg_restore` em um banco vazio. Nenhum script restaura sozinho |

As migrations não são desfeitas no rollback de imagens.

## Conferência após instalar

1. `https://questos.com.br/core/` abre o login pela Tailscale e **não** abre fora dela.
2. Login, troca de senha, logout; cookie `rinne_sid` com `Path=/core/`, `Secure`, `HttpOnly`, `SameSite=Strict`.
3. Todos os menus abrem com estados vazios, sem "Falha na consulta".
4. `docker logs quest-rinne-web-api-1` sem erros.
5. `docker port quest-rinne-db-1` vazio (PostgreSQL não publicado).
