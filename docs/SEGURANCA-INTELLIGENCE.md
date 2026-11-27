# Segurança — QUEST INTELLIGENCE (backend/ + frontend/)

## Como funciona

| camada | comportamento |
|---|---|
| IP | IP não autorizado recebe **404** em todas as rotas (site, arquivos e API) e aparece em *Administração → Controle de Acesso* |
| Painel | **Autorizar** libera a tela de login · **Excluir notificação / Revogar acesso** mantém o 404 sem nova notificação · **Zerar tentativas** remove o bloqueio de login |
| Tentativas | 3 senhas erradas bloqueiam o IP por 15 min; mais 3, 45 min; depois 135, 405... (sempre ×3). Login correto zera. Persiste ao reiniciar |
| Senha | scrypt (N=2^17, r=8, p=1) com salt; nunca em texto puro; nenhuma senha padrão |
| Sessão | token aleatório de 256 bits, cookie `HttpOnly`, `SameSite=Strict`, `Secure` em produção; 30 min de inatividade, 12 h no máximo; reiniciar a API encerra as sessões |
| CSRF | escrita só com `Content-Type: application/json`, sem CORS |
| Cabeçalhos | CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, COOP |

Todo usuário cadastrado é **administrador** (pode autorizar IPs).

## Usuários

```powershell
npm run user -- admin    # cria ou redefine; a senha é exibida uma vez e redefinir encerra as sessões
```

## Variáveis de ambiente (definidas no sistema; a aplicação não lê .env)

| variável | padrão | uso |
|---|---|---|
| `QUEST_ADMIN_IPS` | `127.0.0.1,::1` fora de produção; **vazio em produção** | IPs sempre autorizados, separados por vírgula (sem CIDR) |
| `NODE_ENV=production` | — | cookie `Secure` e sem IPs liberados por padrão |
| `TRUST_PROXY` | `loopback` | proxies autorizados a informar `X-Forwarded-For` |
| `HOST` / `QUEST_DEMO_PORT` | `127.0.0.1` / `4310` | endereço da API |
| `QUEST_DATA_DIR` | `backend/data` | `users.json` e `access.json` (fora do Git; manter em volume persistente) |
| `COOKIE_SECURE` | segue `NODE_ENV` | `false` apenas para teste local sem HTTPS |

## Publicação

Em produção a API serve o frontend compilado, atrás do mesmo bloqueio:

```powershell
npm run setup
npm run build
$env:NODE_ENV="production"; $env:QUEST_ADMIN_IPS="<seu IP público>"
npm run user -- admin
npm start
```

- **HTTPS é obrigatório** (proxy reverso na frente); sem ele o cookie `Secure` não funciona.
- O proxy deve enviar `X-Forwarded-For`. Se estiver em outra máquina ou container, ajuste `TRUST_PROXY`. Depois de publicar, confira em *Controle de Acesso* se "Seu IP" é o seu IP público.
- Não publique o servidor de desenvolvimento do Vite (porta 5175): o bloqueio por IP vale na API, não nele.
- **Perdeu o acesso?** Inclua seu IP em `QUEST_ADMIN_IPS` e reinicie. Para zerar um bloqueio de tentativas sem o painel: pare a API, apague `access.json` (perde também as autorizações) e inicie.
- Os arquivos Docker deste repositório publicam o sistema **anterior** (`server/` + `web/`), não este.

## Limites conhecidos

- Uma única instância (sessões em memória, estado em arquivo JSON).
- Sem limite geral de requisições nem proteção contra DDoS: usar o proxy/firewall.
- IP não identifica pessoa: quem divide a mesma rede (NAT) divide autorização e bloqueio; IP dinâmico precisa de nova autorização.
