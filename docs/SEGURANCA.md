# Segurança — QUEST RINNE 1.0

Escopo: este repositório e o ambiente local. VPS, PostgreSQL de produção e outros sistemas da Quest **não** foram acessados. Não há incidente de segurança conhecido.

## 1. Camadas de proteção

```
navegador ─► proxy TLS da VPS ─► nginx (web) ───────────────► API (Express) ─► PostgreSQL quest_rinne (somente leitura)
             [Cloudflare?]       • real_ip só de REAL_IP_FROM   • TRUST_PROXY = IP fixo do nginx
                                 • allowlist de IP (auth_request) • REQUIRE_PROXY: recusa quem não vem do nginx
                                 • rate limit (site/API/login)    • allowlist de IP · sessão · CSRF · permissões
                                 • CSP, HSTS, Permissions-Policy  • SQL parametrizado · Zod · limites
                                                                  └─► app.db (SQLite: usuários, sessões, auditoria, config)
```

## 2. Autenticação individual

| item | implementação |
|---|---|
| Login | usuário + senha individuais (`POST /api/auth/login`); mesma resposta para usuário inexistente, senha errada e conta desativada; usuário inexistente também paga o custo do Argon2 |
| Senhas | **Argon2id** (`node:crypto`, formato PHC, 19 MiB, t=2, p=1, salt de 16 bytes); mínimo de 12 caracteres (configurável), não pode conter o usuário; nunca em texto puro |
| Primeiro acesso | senha temporária gerada pelo sistema, exibida **uma vez** ao administrador; troca obrigatória antes de qualquer outra operação |
| Sessão | token aleatório de 256 bits **só no cookie** `rinne_sid` (`HttpOnly`, `SameSite=Strict`, `Secure` em produção); o banco guarda apenas o SHA-256 |
| Expiração | por inatividade (30 min, deslizante) e absoluta (12 h), ambas configuráveis |
| Encerramento | logout apaga a sessão no servidor e volta à tela de login; troca de senha encerra as outras sessões; desativar usuário ou redefinir senha encerra todas |
| Revogação | o usuário encerra as próprias sessões em *Minha conta*; o administrador (`sessoes.manage`) encerra qualquer sessão |
| Tentativas | **por IP:** 3 falhas bloqueiam por 15 min (configurável) e cada repetição triplica (45, 135...), persistido no SQLite; acertar zera. **Por usuário:** 5 falhas de qualquer IP (configurável). Painel ou `npm run user:admin` zeram o bloqueio; nginx limita `/api/auth/login` a 10/min por IP |
| CSRF | `SameSite=Strict` + header obrigatório `X-Requested-With: rinne` em métodos de escrita + checagem de `Origin` (em desenvolvimento, aceita os servidores locais do Vite; em produção, só `Origin = Host` e `ALLOWED_ORIGINS`) |
| Frontend | nenhum token no `localStorage`/`sessionStorage`; o token nunca é visível ao JavaScript (cookie `HttpOnly`) |
| Recuperação | `npm run user:admin -- <usuario>` (exige acesso ao terminal do servidor) |

Com o **controle de acesso por IP ativo** (Configurações; desligado por padrão), IP fora da lista recebe **404** no site e na API e aparece em *Aguardando autorização*, onde pode ser autorizado ou ter a notificação excluída. Em emergência, use `IP_ALLOWLIST_BOOTSTRAP`.

## 3. Controle de acesso por perfil

- **Bloqueio por padrão:** usuário sem perfil não acessa nenhum dado e vê só *Minha conta*.
- **Permissões efetivas** = (perfil ∪ concessões individuais) − remoções individuais.
- **Aplicadas no backend em quatro níveis:** módulo (403); item, que é indicador, gráfico ou tabela (`FORBIDDEN`, sem consulta e sem dados); coluna (removida das linhas no servidor); e escopo de departamento (imposto ao gestor).
- O frontend só esconde o que o backend já bloqueia.
- O perfil **Administrador** sempre tem todas as permissões e não pode ser editado. Não é possível remover ou desativar o **último administrador ativo**, nem desativar a si mesmo.

### Matriz padrão (editável em Configurações → Perfis e permissões)

| Permissão | Administrador | Diretoria | Financeiro | Gestor de departamento | Analista | Consulta restrita |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| Visão executiva (indicadores estratégicos) (`estrategicos.view`) | ✅ | ✅ | ✅ | — | — | — |
| Financeiro (receitas, despesas, lançamentos, notas) (`financeiro.view`) | ✅ | ✅ | ✅ | — | — | — |
| Rentabilidade (resultados e margens) (`rentabilidade.view`) | ✅ | ✅ | ✅ | — | — | — |
| Custos de pessoal (`custos_pessoal.view`) | ✅ | ✅ | ✅ | — | — | — |
| Clientes (`clientes.view`) | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Contratos (contratado × executado) (`contratos.view`) | ✅ | ✅ | ✅ | — | — | — |
| Projetos / jobs (`projetos.view`) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Produção e timesheet (`producao.view`) | ✅ | ✅ | — | ✅ | ✅ | ✅ |
| Departamentos e colaboradores (`departamentos.view`) | ✅ | ✅ | — | ✅ | ✅ | — |
| Capacidade e produtividade (`capacidade.view`) | ✅ | ✅ | — | ✅ | ✅ | — |
| Qualidade dos dados (`qualidade.view`) | ✅ | ✅ | — | — | ✅ | — |
| Relatórios (`relatorios.view`) | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Exportar relatórios (CSV) (`relatorios.export`) | ✅ | ✅ | ✅ | — | — | — |
| Ver configurações (banco e integrações) (`config.view`) | ✅ | ✅ | — | — | — | — |
| Alterar configurações gerais, segurança (`config.manage`) | ✅ | — | — | — | — | — |
| Gerenciar usuários (`usuarios.manage`) | ✅ | — | — | — | — | — |
| Gerenciar perfis e permissões (`perfis.manage`) | ✅ | — | — | — | — | — |
| Gerenciar controle de acesso por IP (`ip.manage`) | ✅ | — | — | — | — | — |
| Ver e revogar sessões de todos os usuários (`sessoes.manage`) | ✅ | — | — | — | — | — |
| Histórico de acessos e auditoria (`auditoria.view`) | ✅ | — | — | — | — | — |

Itens com dado sensível próprio, além da permissão do módulo:
- **Financeiro:** indicadores com base faturamento, caixa ou competência, além de lançamentos, notas e colunas de valores.
- **Rentabilidade:** margens, resultados e custo direto.
- **Contratos:** escopo e desvio.
- **Custos de pessoal:** custo de mão de obra.
- **Qualidade dos dados:** indicadores de ingestão.

## 4. Persistência da aplicação

- `server/data/app.db` (SQLite, `node:sqlite`) guarda usuários, perfis, sessões, auditoria e configurações. Fica **isolado** do PostgreSQL analítico: o RINNE não tem nenhuma permissão de escrita em `core`, `ingest` ou `audit`.
- **Migrations versionadas** em `server/migrations/*.sql`, aplicadas uma única vez na inicialização e dentro de transação. A `001` cria a autenticação; a `002` foi aplicada em ambiente local por uma versão anterior (IA/reunião) e **não é alterada**; a `003` limpa apenas permissões descontinuadas e preserva tabelas e configurações históricas, sem acesso pelo código ativo. A revisão evita exclusão em novos upgrades; não recupera dados de bancos onde a revisão destrutiva anterior foi aplicada.
- **Volume persistente:** em produção, `./deploy/data`. Rebuilds e novos deploys não apagam usuários nem configurações.

## 5. Auditoria

Registrados: login (sucesso, falha e bloqueio) e logout; troca e redefinição de senha; criação, alteração e permissões de usuários; criação, alteração e exclusão de perfis; revogação de sessões; alterações na lista de IPs; acessos bloqueados por IP (no máximo 1 por IP por minuto); acessos negados por permissão; exportação de relatórios; alterações de configurações.

Nunca são registrados senhas, tokens, cookies, hashes nem credenciais de banco: chaves com esses nomes são removidas automaticamente, e há teste. Retenção de 365 dias (`AUDIT_RETENTION_DAYS`).

## 6. Proxy e IP real do cliente

- **API:** `TRUST_PROXY` tem padrão `loopback`. Em produção, é o **IP fixo do nginx** (`172.30.57.2`, rede `172.30.57.0/29`). Só desse IP o `X-Forwarded-For` é aceito; `X-Real-IP` e `CF-Connecting-IP` são ignorados.
- **`REQUIRE_PROXY=true`** (produção e compose local): a API recusa conexões que não venham do nginx, como outro container na rede do PostgreSQL. O healthcheck interno (loopback direto) continua funcionando.
- **nginx:** aceita `X-Forwarded-For` somente dos proxies em `REAL_IP_FROM` (padrão: gateway da rede = proxy no host da VPS) e repassa à API **um único valor limpo**.
- **Cloudflare (se adotada):** acrescentar as faixas oficiais publicadas pela Cloudflare em `REAL_IP_FROM`. Depois do deploy, conferir em Configurações → Controle de acesso por IP se "Seu IP atual" mostra o IP público real.

## 7. Cabeçalhos, XSS, CORS e permissões do navegador

- **Câmera, microfone e localização bloqueados em todas as páginas:** `Permissions-Policy: camera=(), microphone=(), geolocation=()` (e também pagamento, USB, captura de tela, sensores, MIDI, serial e Bluetooth). Não há exceção por rota. A CSP usa `media-src 'none'`. Há teste que impede qualquer liberação.
- **CSP:** `default-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'…`, além de HSTS, `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy` e `COOP`.
- **XSS:** React escapa todo conteúdo. Não há `dangerouslySetInnerHTML`, `innerHTML` nem `eval` (verificado por busca no código).
- **CORS:** a API não emite cabeçalhos CORS; o header obrigatório `X-Requested-With` força um preflight que falha para outras origens.
- **CSV/XLSX:** células de texto nunca viram fórmula (prefixo `'` no CSV; `inlineStr` no XLSX).
- **SQL Injection:** todo SQL é parametrizado; filtros e ordenação são validados (Zod; a coluna de ordenação deve estar entre as colunas permitidas da tabela).

## 8. Resultados dos testes (local, sem PostgreSQL e sem serviços externos)

| suíte | resultado | cobre |
|---|---|---|
| `server/test/auth.test.ts` | ✅ 12/12 | Argon2id; bloqueio sem sessão; cookie `HttpOnly`/`SameSite`; hash do token no banco; respostas uniformes; bloqueio por tentativas; CSRF (sem header, `Origin` de outro site, `null`, origem do Vite só fora de produção); troca obrigatória e política de senha; expiração por inatividade e absoluta; revogação; gestão de usuários; auditoria sem segredos; persistência |
| `server/test/authz.test.ts` | ✅ 9/9 | matriz completa (6 perfis × todos os módulos principais); bloqueio por padrão; vazamento de item e coluna financeira; custos de pessoal e contratos; concessão e remoção individual; escopo de departamento; relatórios e dimensões; tentativa de autopromoção; perfis com efeito imediato |
| `server/test/access.test.ts` | ✅ 8/8 | CIDR; gestão só com `ip.manage`; anti-lockout; allowlist + bootstrap; auditoria; **X-Forwarded-For forjado, X-Real-IP e CF-Connecting-IP ignorados**; `REQUIRE_PROXY`; falha fechada |
| `server/test/api.test.ts` | ✅ 9/9 | catálogo, endpoints, filtros, paginação, estados sem banco, `DATABASE_URL` alheia recusada, PostgreSQL inacessível sem derrubar a API |
| `server/test/reports.test.ts` | ✅ 5/5 | permissões por relatório; CSV/XLSX/Markdown; relatório sem banco marcado "DADOS INDISPONÍVEIS"; escopo e colunas; ordenação validada; XLSX sem fórmulas |
| `server/test/migrations.test.ts` | ✅ 2/2 | migration 003 sobre banco já migrado, com dados |
| `web/src/*.test.ts` | ✅ 12/12 | menu por perfil, colunas sensíveis, bloqueio de câmera/microfone/localização no nginx, formatação |
| Homologação visual (Playwright + Edge, build de produção local) | ver [HOMOLOGACAO_LOCAL.md](HOMOLOGACAO_LOCAL.md) | login, troca de senha, logout, todas as telas, perfil restrito, relatórios, responsividade |
| `npm audit` | ✅ 0 vulnerabilidades conhecidas | não garante ausência de falhas |

## 9. Pendências que dependem da infraestrutura (não verificadas)

| item | como validar no deploy |
|---|---|
| HTTPS no proxy da VPS (cookie `Secure`, HSTS) | `curl -I https://<dominio>` → `strict-transport-security` presente |
| `REAL_IP_FROM` × cadeia real de proxies (e Cloudflare, se houver) | "Seu IP atual" em Configurações = seu IP público |
| Cabeçalhos efetivos atrás do nginx (incluindo `Permissions-Policy`) | `curl -I` e conferir; só os arquivos de configuração foram testados |
| Sub-rede `172.30.57.0/29` livre na VPS | `docker network inspect $(docker network ls -q) \| grep Subnet` |
| Porta 5432 não publicada | `docker port quest-rinne-db-1` vazio |
| Firewall e SSH da VPS | `ufw status`; SSH só por chave |
| Permissões do volume `deploy/data` | `chown 1000:1000 deploy/data`; `chmod 700` |
| Backup de `deploy/data` | agendar cópia diária para fora da VPS |
| Docker (build das imagens) | **não testado**: Docker indisponível nesta máquina |

## 10. Checklist de deploy

Ver [DEPLOY_VPS.md](DEPLOY_VPS.md#checklist-de-deploy).
