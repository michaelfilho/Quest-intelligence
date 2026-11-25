# Segurança — QUEST RINNE

Atualizado em 25/11/2026. Escopo: somente este repositório e o ambiente local. VPS, PostgreSQL de produção e outros sistemas da Quest **não** foram acessados. Não há incidente de segurança conhecido.

## 1. Camadas de proteção

```
navegador ─► proxy TLS da VPS ─► nginx (web) ───────────────► API (Express) ─► PostgreSQL quest_rinne (somente leitura)
             [Cloudflare?]       • real_ip só de REAL_IP_FROM   • TRUST_PROXY = IP fixo do nginx
                                 • allowlist de IP (auth_request) • REQUIRE_PROXY: recusa quem não vem do nginx
                                 • rate limit (site/API/login)    • allowlist de IP · sessão · CSRF · permissões
                                 • CSP, HSTS, Permissions-Policy  • SQL parametrizado · Zod · limites
                                                                  └─► app.db (SQLite próprio: usuários, sessões, auditoria, config)
```

## 2. Autenticação individual

| item | implementação |
|---|---|
| Login | usuário + senha individuais (`POST /api/auth/login`); mesma resposta para usuário inexistente, senha errada e conta desativada; usuário inexistente também paga o custo do Argon2 |
| Senhas | **Argon2id** (`node:crypto`, formato PHC, 19 MiB, t=2, p=1, salt de 16 bytes); mínimo de 12 caracteres (configurável), não pode conter o usuário; nunca em texto puro |
| Primeiro acesso | senha temporária gerada pelo sistema, exibida **uma vez** ao administrador; troca obrigatória antes de qualquer outra operação |
| Sessão | token aleatório de 256 bits **só no cookie** `rinne_sid` (`HttpOnly`, `SameSite=Strict`, `Secure` em produção); o banco guarda apenas o SHA-256 |
| Expiração | por inatividade (30 min, deslizante) e absoluta (12 h), ambas configuráveis |
| Encerramento | logout apaga a sessão no servidor; troca de senha encerra as outras sessões; desativar usuário ou redefinir senha encerra todas |
| Revogação | o usuário encerra as próprias sessões em *Minha conta*; o administrador (`sessoes.manage`) encerra qualquer sessão |
| Tentativas | 5 falhas por usuário (de qualquer IP) ou 20 por IP → bloqueio de 15 min (configurável); nginx limita `/api/auth/login` a 10/min por IP |
| CSRF | `SameSite=Strict` + header obrigatório `X-Requested-With: rinne` em métodos de escrita + checagem de `Origin` |
| Frontend | nenhum token no `localStorage`/`sessionStorage`; o cliente HTTP nunca vê o token (cookie `HttpOnly`) |
| Recuperação | `npm run user:admin -- <usuario>` (exige acesso ao terminal do servidor) |

## 3. Controle de acesso por perfil

- **Bloqueio por padrão:** usuário sem perfil não acessa nenhum dado e vê só *Minha conta*.
- **Permissões efetivas** = (perfil ∪ concessões individuais) − remoções individuais.
- **Aplicadas no backend em quatro níveis:**
  1. **módulo:** 403;
  2. **item** (indicador, gráfico ou tabela): `FORBIDDEN`, sem consulta e sem dados;
  3. **coluna:** removida das linhas no servidor (ex.: faturado e recebido para perfis operacionais);
  4. **escopo de departamento:** o filtro é imposto pelo servidor ao gestor.
- O frontend só esconde o que o backend já bloqueia.
- O perfil **Administrador** sempre tem todas as permissões e não pode ser editado.
- Não é possível remover ou desativar o **último administrador ativo**, nem desativar a si mesmo.

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
| RINNE IA (perguntas sobre os indicadores) (`rinne_ia.use`) | ✅ | ✅ | ✅ | ✅ | — | — |
| RINNE Voz (microfone) (`rinne_voz.use`) | ✅ | ✅ | — | ✅ | — | — |
| Modo reunião (microfone) (`reuniao.use`) | ✅ | ✅ | — | ✅ | — | — |
| Ver configurações (banco, integrações, IA) (`config.view`) | ✅ | ✅ | — | — | — | — |
| Alterar configurações gerais, segurança e IA (`config.manage`) | ✅ | — | — | — | — | — |
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

- `server/data/app.db` (SQLite, `node:sqlite`) guarda usuários, perfis, sessões, auditoria e configurações. Fica **isolado** do PostgreSQL analítico: o RINNE continua sem nenhuma permissão de escrita em `core`, `ingest` ou `audit`.
- **Migrations:** `server/migrations/*.sql`, versionadas na tabela `schema_migrations` e aplicadas uma única vez na inicialização, dentro de uma transação. Hoje existe a `001_auth.sql`, aplicada só localmente.
- **Volume persistente:** em produção, `./deploy/data`. Rebuilds e novos deploys não apagam usuários nem configurações. A allowlist de IPs fica na mesma pasta (`ip-allowlist.json`).
- **Backup:** copiar `deploy/data/` com a API parada, ou usar `sqlite3 app.db ".backup"`.

## 5. Auditoria

São registrados:
- login (sucesso, falha e bloqueio) e logout;
- troca e redefinição de senha;
- criação, alteração e permissões de usuários;
- criação, alteração e exclusão de perfis;
- revogação de sessões;
- alterações na lista de IPs;
- acessos bloqueados por IP (no máximo 1 registro por IP por minuto);
- acessos negados por permissão;
- alterações de configurações.

Nunca são registrados senhas, tokens, cookies, hashes nem credenciais de banco. Chaves com esses nomes são removidas automaticamente, e há teste que confere isso. A retenção é de 365 dias (`AUDIT_RETENTION_DAYS`).

## 6. Proxy e IP real do cliente

- **API:** `TRUST_PROXY` tem padrão `loopback`. Em produção, é o **IP fixo do nginx** (`172.30.57.2`, rede `172.30.57.0/29`). Só desse IP o `X-Forwarded-For` é aceito; `X-Real-IP` e `CF-Connecting-IP` são ignorados.
- **`REQUIRE_PROXY=true`** (produção e compose local): a API recusa conexões que não venham do nginx, como outro container na rede do PostgreSQL. O healthcheck interno (loopback direto) continua funcionando.
- **nginx:** aceita `X-Forwarded-For` somente dos proxies em `REAL_IP_FROM` (padrão: gateway da rede = proxy no host da VPS). Repassa à API **um único valor limpo** e descarta `X-Real-IP` e `CF-Connecting-IP`.
- **Cloudflare (se adotada):** acrescentar as faixas oficiais publicadas pela Cloudflare em `REAL_IP_FROM`. Depois do deploy, conferir em Configurações → Controle de acesso por IP se "Seu IP atual" mostra o IP público real.

## 7. Microfone (RINNE Voz e Modo reunião)

- `Permissions-Policy` com `microphone=()` em todas as páginas, **exceto** `/rinne/voz` e `/reuniao` (`microphone=(self)`). Câmera, localização, pagamento, USB e captura de tela ficam sempre bloqueados.
- No SPA, entrar ou sair dessas rotas **recarrega o documento**, para que a política certa valha.
- O microfone só liga depois de marcar o consentimento e clicar em *Ativar microfone*. A página exige contexto seguro (HTTPS ou localhost). O indicador de "Microfone ativo" fica visível e o microfone desliga ao sair da página.
- Nesta versão **nada é gravado nem enviado**: o áudio só passa por um medidor de nível local. A transcrição foi planejada para o servidor da Quest (fase 5), para o áudio não ir a terceiros; a Web Speech API do navegador, que envia o áudio ao Google no Chrome, não é usada.

## 8. Resultados dos testes (local, sem banco e sem serviços externos)

| suíte | resultado | cobre |
|---|---|---|
| `server/test/auth.test.ts` | ✅ 12/12 | Argon2id; bloqueio sem sessão; cookie `HttpOnly`/`SameSite`; hash do token no banco; respostas uniformes; bloqueio por tentativas; CSRF (sem header, `Origin` de outro site e `Origin: null`); troca obrigatória e política de senha; expiração por inatividade e absoluta; revogação própria e de terceiros; gestão de usuários (último admin protegido, edição parcial sem perder permissões); auditoria sem segredos; persistência após reabrir |
| `server/test/authz.test.ts` | ✅ 10/10 | matriz completa (6 perfis × 12 módulos); bloqueio por padrão; vazamento de item e coluna financeira; custos de pessoal e contratos; concessão e remoção individual; escopo de departamento imposto; exportação e dimensões; tentativa de autopromoção; alteração de perfil com efeito imediato; RINNE só com itens permitidos |
| `server/test/access.test.ts` | ✅ 8/8 | CIDR; gestão só com `ip.manage`; anti-lockout; allowlist + bootstrap; auditoria; **X-Forwarded-For forjado, X-Real-IP e CF-Connecting-IP ignorados**; `REQUIRE_PROXY`; falha fechada |
| `server/test/api.test.ts` | ✅ 9/9 | endpoints, filtros, paginação, estados sem banco, `DATABASE_URL` alheia recusada |
| `web/src/*.test.ts` | ✅ 11/11 | menu por perfil, colunas sensíveis, rotas de microfone = regra do nginx, formatação |
| E2E (processo real, porta 3334, dados temporários) | ✅ 14/14 | login, CSRF, troca obrigatória, módulos, configurações, criação de usuário, logout, auditoria; nenhuma senha no `app.db` nem no log |
| Typecheck, build, `npm audit` | ✅ | 0 vulnerabilidades conhecidas (`npm audit` não garante ausência de falhas) |

**Bugs encontrados e corrigidos pelos testes:**
- a edição parcial de usuário apagava as permissões individuais;
- o `.env` sobrescrevia variáveis passadas explicitamente na linha de comando;
- o nginx enviaria `Host: api:3333` e bloquearia todos os POSTs pela checagem de `Origin`.

## 9. Pendências que dependem da infraestrutura (não verificadas)

| item | como validar no deploy |
|---|---|
| HTTPS no proxy da VPS (necessário para o cookie `Secure` e o microfone) | `curl -I https://<dominio>` → `strict-transport-security` presente |
| `REAL_IP_FROM` × cadeia real de proxies (e Cloudflare, se houver) | "Seu IP atual" em Configurações = seu IP público |
| Sub-rede `172.30.57.0/29` livre na VPS | `docker network inspect $(docker network ls -q) \| grep Subnet` |
| Porta 5432 não publicada; API sem porta publicada | `docker port quest-rinne-db-1` vazio |
| Firewall e SSH da VPS | `ufw status`; SSH só por chave |
| Permissões do volume `deploy/data` | `chown 1000:1000 deploy/data`; `chmod 700` |
| Rotina de backup de `deploy/data` | agendar cópia diária (cron) para fora da VPS |
| Docker (build das imagens) | não testado localmente (Docker indisponível nesta máquina) |

## 10. Checklist de deploy

- [ ] HTTPS ativo no proxy da VPS (redirecionamento HTTP → HTTPS)
- [ ] `deploy/.env.production` preenchido, `chmod 600`, fora do git; `DATABASE_URL` com `quest_rinne_app_ro`
- [ ] `RINNE_SUBNET` / `RINNE_WEB_IP` livres; `REAL_IP_FROM` = IP do proxy da VPS (+ faixas da Cloudflare, se houver)
- [ ] `IP_ALLOWLIST_BOOTSTRAP` com o IP fixo do escritório (acesso de emergência)
- [ ] `mkdir -p deploy/data && chown 1000:1000 deploy/data && chmod 700 deploy/data`
- [ ] `docker compose -f docker-compose.prod.yml --env-file deploy/.env.production up -d --build`
- [ ] Criar o administrador: `docker compose -f docker-compose.prod.yml exec api npm run user:admin -- <usuario>` e trocar a senha no primeiro acesso
- [ ] Criar os usuários individuais com seus perfis (Configurações → Usuários)
- [ ] Conferir "Seu IP atual" → adicionar IPs → ativar o bloqueio → testar de uma rede fora da lista
- [ ] Conferir `docker logs` da API: sem senha, token ou URL de banco
- [ ] Agendar backup de `deploy/data/`
- [ ] `npm audit` nos dois pacotes antes de cada deploy

## 11. Integração com o n8n (webhooks e ferramentas)

| controle | implementação |
|---|---|
| Sem IA na aplicação | nenhum SDK, chave, modelo, prompt ou controle de tokens no código; configurações `ai.*` antigas removidas pela migration 002 |
| Transporte | URL somente por variável de ambiente; aceita HTTPS ou HTTP **apenas** para rede privada ou nome interno do Docker; credenciais na URL são recusadas; `redirect: "error"`. O navegador nunca envia URLs de webhook |
| Autenticação | HMAC-SHA256 sobre `timestamp.nonce.sha256(corpo).sha256(envelope)`, com segredo de no mínimo 32 caracteres e comparação em tempo constante |
| Replay | janela de ±300 s + nonce de uso único (`webhook_nonces`) |
| Idempotência | `Idempotency-Key` no envio; segmentos de reunião por número; callback de solicitação já concluída → 409 |
| Sem reenvio automático | timeout ou falha viram erro visível; o usuário decide |
| Limites | corpo interno de até 512 KB; áudio de até 2 MB/60 s; resposta validada por Zod (tamanhos, tipos, MIME de áudio); concorrência global e 1 solicitação por conversa |
| Ferramentas | HMAC + **contexto de execução** (token aleatório de 256 bits, só o SHA-256 no banco, 10 min, 50 chamadas). Permissões e escopo recalculados do banco **a cada chamada**; usuário desativado → 403. O segredo do webhook **não** substitui a autorização do usuário |
| Conteúdo não confiável | texto da IA exibido como texto puro; indicadores citados pela IA são recalculados pelo backend (valores da IA descartados); nenhuma resposta aciona ações administrativas; não há SQL livre |
| Exposição | `/api/internal/` com `deny all` no nginx; opcionalmente `RINNE_N8N_ALLOWED_IPS`; URL e segredo nunca vão ao navegador nem aos logs |
| Rastreabilidade | `n8n_requests` (requestId, correlationId, operação, situação, latência) + auditoria `rinne.tool` |

## 12. XSS, CORS e conteúdo externo

- **XSS:** React escapa todo conteúdo; não há `dangerouslySetInnerHTML`, `innerHTML` nem `eval` (verificado por busca no código). A CSP `script-src 'self'` bloqueia scripts injetados. O áudio usa `blob:` (`media-src 'self' blob:`), sem `data:`.
- **CORS:** a API não emite cabeçalhos CORS. Navegadores de outras origens não leem respostas, e o header obrigatório `X-Requested-With` força o preflight, que falha.
- **CSV/XLSX:** células de texto nunca viram fórmula (prefixo `'` no CSV; `inlineStr` no XLSX).

## 13. Microfone na SPA

- A política `Permissions-Policy` vale por **documento**. Por isso, entrar ou sair de `/rinne/voz` e `/reuniao` pelo menu **recarrega a página**, e a política correta do servidor passa a valer.
- Câmera, localização, pagamento, USB e captura de tela: sempre bloqueados.
- As trilhas de áudio são encerradas ao desligar o microfone e ao desmontar as telas.
- **Testado localmente:** a regra do nginx cobre exatamente as rotas da aplicação (teste automatizado). A aplicação efetiva do cabeçalho só pode ser verificada atrás do nginx, o que é pendência de infraestrutura.
