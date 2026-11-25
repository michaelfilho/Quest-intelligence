# Atualização da instalação existente — execução manual posterior

Este procedimento foi preparado e testado localmente quanto à transformação de configuração, proteções de volumes/ambiente e backup SQLite. **Não foi executado na VPS nem em Docker real nesta tarefa.** A publicação no GitHub não executa deploy.

A fonte informada fica em `/opt/apps/quest-rinne-web`; o runtime com ajustes locais fica em `/opt/apps/quest-rinne-web-runtime`. Não copiar o repositório por cima do runtime nem substituir seu `.env`, Compose, volumes, nginx customizado ou SQLite.

## 1. Buscar o commit e preparar, sem implantar

Usar uma sessão Bash na VPS, com permissão para Docker, `/opt/apps` e `/opt/backups`. O operador executará somente quando decidir atualizar:

```bash
set -euo pipefail
umask 077
cd /opt/apps/quest-rinne-web
git fetch origin
SHA=$(git rev-parse origin/main)
printf 'Commit candidato: %s\n' "$SHA"
# Conferir que corresponde ao hash remoto informado na entrega.
PREP=$(mktemp /tmp/rinne-prepare.XXXXXX)
git show "$SHA:deploy/prepare-release.sh" > "$PREP"
bash "$PREP" "$SHA"
rm -f "$PREP"
```

Esse passo não faz checkout/reset da fonte, não reinicia containers e não abre conexão direta ao PostgreSQL. O health interno utiliza o backend já configurado para verificar sua própria conexão. O script:

- Descobre pelas labels do container API os arquivos Compose, diretório de trabalho e arquivos de ambiente efetivamente usados; não presume que os exemplos do Git sejam iguais aos ajustes do runtime.
- Captura configurações e inspeções em backup privado, arquiva o runtime e cria uma cópia **consistente** do SQLite da API por `VACUUM INTO`, com checagem de integridade e SHA-256. O arquivo principal lido não é substituído.
  A cópia sai do container por streaming binário `docker exec`, sem TTY e sem `docker cp`, inclusive quando `/tmp` está em tmpfs. O hash é comparado com o arquivo de origem antes da conclusão. Antes disso, a API existente é verificada internamente: health com PostgreSQL conectado e sessão anônima recusada.
- Salva `runtime-to-release.private.diff` para revisar diferenças de código, Vite e nginx em relação ao runtime. Mudanças próprias da integração são esperadas; hotfixes locais adicionais precisam ser conciliados antes de atualizar. O script não consegue decidir sozinho quais ajustes locais de código devem ser transportados.
- Preserva as imagens correntes sob tags de rollback; não remove imagens/volumes nem altera a role ou o banco analítico.
- Extrai o commit em `runtime/.releases/<identificador>` e produz **um override mínimo**: contexto de build da nova fonte, Dockerfiles versionados, `VITE_BASE_PATH=/core/` e `APP_BASE_PATH=/core/`.
- Mantém os arquivos Compose/env originais como base. O override não contém credenciais, portas, redes, volumes ou labels do Traefik, nem duplica os valores dos segredos. A origem da configuração permanece nos arquivos existentes.
- Compara ambiente, labels, mounts e redes com o container atual. Divergência, command/entrypoint local ou mount que substitua código/nginx interrompem a preparação; precisam de revisão manual. O htpasswd montado permanece preservado.

**Se o script interromper, não pular a validação.** Conferir os arquivos efetivamente usados, reconciliar os ajustes locais e repetir. Não substituir configurações por exemplos para “fazer passar”. Montagens locais de nginx precisam de merge explícito da configuração nova: remover somente transformações duplicadas do cookie/prefixo, mantendo controles de acesso e cabeçalhos. O script não faz esse merge automaticamente.

Os arquivos de backup e configuração efetiva contêm segredos e dados internos: permissões privadas, fora do Git. Não copiar seu conteúdo para chat, logs públicos ou documentação. Arquivos `*.private.*` e `.releases/` estão ignorados pelo repositório e pelo contexto Docker.

### Retomar uma release completa

Se esta versão do preparador já concluiu a release, repetir sem reconstruir os backups:

```bash
bash "$PREP" "$SHA" --resume /opt/apps/quest-rinne-web-runtime/.releases/IDENTIFICADOR_INFORMADO
```

Executar enquanto o arquivo temporário `PREP` ainda existe, ou extraí-lo novamente do mesmo commit como no passo 1. A retomada exige `prepared.sha` igual ao SHA, hashes dos arquivos de configuração/SQLite e manifesto `source.sha256` íntegros, além de health interno. Não faz build, up, novo backup ou confirmação textual; não depende de resposta em maiúsculas. Release incompleta/antiga sem esses manifestos exige revisão e nova preparação, sem apagar os arquivos anteriores. O runtime em execução pode usar um override de release anterior: os arquivos efetivos continuam sendo descobertos pelas labels do container, não por um Compose presumido.

O hotfix informado de `RINNE_PUBLISH` é tratado estritamente: só o valor efetivo da **API** pode ser preservado num override privado, inclusive no rollback. Não altera o ambiente do frontend ou os arquivos compartilhados. Divergências de outras variáveis, credenciais, proxy, labels, portas ou volumes continuam interrompendo a preparação; não há reconciliação genérica de configurações.

## 2. Revisar a candidata

O preparador informa os caminhos `Release` e `Backup privado`. Definir exatamente esses caminhos, sem alterar os arquivos de ambiente:

```bash
RELEASE=/opt/apps/quest-rinne-web-runtime/.releases/IDENTIFICADOR_INFORMADO
BACKUP=/opt/backups/quest-rinne/IDENTIFICADOR_INFORMADO
source "$RELEASE/compose-args.private.sh"
sha256sum --check "$BACKUP/input-files.sha256"
sha256sum --check "$BACKUP/app.db.sha256"
"${COMPOSE[@]}" -f "$RELEASE/compose.override.json" config --quiet
(cd "$RELEASE"; sha256sum --check --status source.sha256)
```

Revisar localmente o override, que não contém os segredos, e o diff privado de código/nginx. Confirmar a manutenção do projeto `quest-rinne-web`, da porta 18372 conforme configuração efetiva, dos mounts do SQLite/allowlist/htpasswd, da rede `quest-rinne_private`, da `DATABASE_URL` e role existentes e das labels/regras atuais do Traefik. Os snapshots privados não devem ser exibidos integralmente no terminal compartilhado. Não avançar se houver hotfix local relevante ainda não incorporado ao código revisado.

O navegador usa `/core/api`; o Traefik remove `/core`; nginx e backend recebem `/api`. O novo nginx da imagem **não** usa `proxy_cookie_path`. O Path `/core/` é configurado somente pelo backend. Não adicionar um segundo strip ou uma segunda transformação de cookie.

## 3. Construir e atualizar somente a aplicação

Somente após revisar a candidata e confirmar os backups, na mesma sessão:

```bash
"${COMPOSE[@]}" -f "$RELEASE/compose.override.json" build api web
sha256sum --check "$BACKUP/input-files.sha256"
"${COMPOSE[@]}" -f "$RELEASE/compose.override.json" up -d --no-deps --no-build api web
"${COMPOSE[@]}" -f "$RELEASE/compose.override.json" ps api web
bash "$RELEASE/deploy/check-release.sh" "$RELEASE"
```

Esses comandos preservam as referências originais de ambiente e volumes. Não executar `down -v`, `git clean`, `git reset --hard`, substituição de banco, criação de role, migrations analíticas ou comandos de n8n. A versão não adiciona migration SQLite.

O override passa `RINNE_COMMIT_SHA` aos dois builds. A verificação posterior exige revisão das imagens igual ao SHA, SHA-256 dos arquivos instalados da API/shared igual a `code.sha256`, integridade dos assets web contra o manifesto gerado no build e health interno com PostgreSQL conectado. Falha de hash não deve ser ignorada. Docker real, labels e arquivos instalados só serão comprovados quando o operador executar esse passo; não foram acessados nesta tarefa.

## 4. Validar e acompanhar

Validar primeiro a API internamente, na mesma sessão com `COMPOSE` e `RELEASE` definidos:

```bash
"${COMPOSE[@]}" -f "$RELEASE/compose.override.json" exec -T api node -e "$(cat "$RELEASE/deploy/check-api.cjs");check().catch(()=>process.exit(1));"
```

Esse teste usa loopback dentro da API, sem `X-Forwarded-For`, conforme a exceção local já existente para healthchecks. Não desabilita IPs, proxy obrigatório ou autenticação. Exige `database=CONNECTED`, health válido e `/api/auth/me` anônimo retornando 401.

Um HTTP 403 externo isolado **não determina rollback**. Conferir se a allowlist está habilitada e se o bloqueio correspondente consta na auditoria `access.blocked` com motivo `IP fora da allowlist`; validar pelo navegador de um IP autorizado. Somente nessa situação, com a verificação interna aprovada, tratar o 403 daquele IP como bloqueio esperado. Não ignorar outros 403, falhas de sessão, proxy, health, conexão ou assets. Não cadastrar IP automaticamente nem contornar controles para validar a release. Não há rollback automático nesse procedimento.

1. Abrir `https://questos.com.br/core/` e fazer login com conta existente; conferir assets, navegação, filtros, exportações, impressão e logout.
2. No navegador, confirmar cookie `rinne_sid` com `Path=/core/`, `Secure`, `HttpOnly` e `SameSite=Strict`. Conferir usuário restrito e escopo departamental, incluindo tentativa de URL manipulada.
3. Com `config.view`, consultar `/core/api/metadata/schema`. “Perfil completo indisponível” não invalida consultas que usam apenas um subconjunto de campos; verificar o motivo individual.
4. Conferir mapeamento financeiro de `parent_entry_source_id`: namespace de origem validado por dados, sem exigir FK. Ambiguidades, órfãos, duplicidades e autorreferências permanecem bloqueados. Somente após validação da origem, se necessário, configurar `FINANCIAL_PARENT_FIELD`/`FINANCIAL_PARENT_TARGET` no ambiente existente; essas opções não dispensam os testes de integridade.
5. Rodar o verificador na API já configurada, para um período conhecido:

```bash
"${COMPOSE[@]}" -f "$RELEASE/compose.override.json" exec -T api npm run verify:analytics -- --start AAAA-MM-DD --end AAAA-MM-DD
```

O verificador usa somente SELECTs pela role existente e não registra valores financeiros. Reconciliar também os outros indicadores com seus registros de origem e cobertura. Não declarar rentabilidade validada a partir de movimentação preliminar. Após nova publicação do n8n, verificar atualização das telas analíticas ativas no ciclo de 60 segundos.

O verificador ampliado testa nomes/relacionamentos, horas, faturamento, caixa, estimativas e qualidade pontual. Saída 0: verificações executadas aprovadas; 1: erro/divergência; 2: verificação parcial porque uma fonte/critério permaneceu indisponível. Saída parcial requer revisão dos itens, sem liberar indicadores ausentes nem provocar rollback automático. Se houver publicação concorrente durante a reconciliação, repetir e investigar a divergência antes de concluir. Ver perfis semânticos e limitações em [CORRECOES_RELACIONAMENTOS.md](CORRECOES_RELACIONAMENTOS.md).

## 5. Rollback de imagens, preservando dados

Se a atualização falhar, sem recompilar ou apagar volumes:

```bash
sha256sum --check "$BACKUP/input-files.sha256"
"${COMPOSE[@]}" -f "$BACKUP/rollback.private.json" up -d --no-deps --no-build api web
```

Esse rollback aponta para as imagens anteriores e para a configuração original, mantendo o SQLite corrente. Não restaurar automaticamente o banco antigo: isso apagaria alterações feitas após a atualização. Se houver necessidade comprovada de restauração de dados, parar a API, fazer novo backup do estado atual e restaurar a cópia consistente `BACKUP/app.db` no mount efetivo identificado, com os donos/permissões corretos. O SQLite contido no tar a quente do runtime não substitui a cópia consistente separada.
