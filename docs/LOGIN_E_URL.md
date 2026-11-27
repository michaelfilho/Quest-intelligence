# Login e limpeza da URL — 26/11/2026

O frontend React/TypeScript chama `sanitizeTrackingUrl` em `web/src/main.tsx`, antes de criar o React Router. A limpeza usa `window.history.replaceState`, mantém o estado existente e não recarrega nem adiciona entrada ao histórico.

São removidas chaves iniciadas por `utm_` e as chaves exatas `fbclid`, `gclid`, `dclid`, `msclkid`, `ttclid`, `igshid`, `mc_cid` e `mc_eid`. A identificação ignora diferenças entre maiúsculas/minúsculas e reconhece chaves codificadas. Somente os componentes de rastreamento são descartados: filtros legítimos conservam ordem, duplicatas, valores vazios e codificação. Caminho, `/core/` e fragmento são mantidos. URLs já limpas não provocam escrita no histórico.

Exemplo: `https://questos.com.br/core/?utm_source=chatgpt.com` resulta em `https://questos.com.br/core/`.

A tela de login segue a referência QUEST CORE com decoração vetorial local, cores preta/laranja, campos acessíveis, responsividade e alternância explícita da visibilidade da senha. Continua usando o mesmo POST de autenticação e tratamento de sessão/erros; troca obrigatória de senha permanece no fluxo existente. Sem dependências novas, imagens externas ou alterações no backend, cookies, permissões, allowlist, Tailscale e Traefik.

## Validação

- `npm --prefix web test`: 27 testes aprovados, incluindo oito casos novos de URL.
- `npm run typecheck` e builds de produção na raiz e em `/core/`.
- Homologação Playwright/Edge: 44 verificações aprovadas na raiz e 44 em `/core/`, sem erros inesperados de console. As capturas desktop/mobile foram inspecionadas.
- `e2e/homologacao.mjs`: verifica o exemplo, limpeza antes do primeiro `replaceState` do Router, uma única navegação de documento, histórico sem entrada adicional, preservação de filtros/rota/fragmento e login desktop/mobile.
- O cenário de login cobre senha inicialmente oculta, alternância sem modificar o valor, credenciais inválidas, troca obrigatória, sessão, navegação, logout e cookie/prefixo.

Capturas desktop em 1672 × 941 e mobile em 390 × 844 são inspecionadas localmente; evidências e SQLite temporário de homologação ficam fora do Git. Nenhuma validação acessa produção. Publicação/deploy e conferência na VPS não fazem parte desta alteração.
