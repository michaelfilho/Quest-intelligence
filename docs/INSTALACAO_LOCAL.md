# Instalação local (Windows 11)

## Requisitos

- **Node.js 24.7 ou superior**: Argon2id e SQLite vêm da biblioteca padrão. Testado com 24.19; a última versão 24.x é a 24.22.3.
- Microsoft Edge ou Chrome (a homologação visual usa o Edge instalado).
- Docker é opcional e não existe nesta máquina.

## Instalação

```bash
npm run setup              # instala server/ e web/
cp .env.example .env       # opcional; sem .env a API sobe sem banco e sem n8n
```

- O `.env` do projeto prevalece sobre a `DATABASE_URL` herdada do Windows (que existe nesta máquina e pertence a outro projeto).
- Para as demais variáveis, valem as da linha de comando.
- Não coloque chaves de provedores de IA: toda a IA fica no n8n.

## Executar

```bash
npm run dev:api            # terminal 1 → API em http://127.0.0.1:3333
npm run dev:web            # terminal 2 → http://localhost:5173
npm --prefix server run user:admin -- <usuario> "Nome"   # 1º acesso (senha temporária exibida uma vez)
```

Abra **http://localhost:5173**, entre com a senha temporária e defina a sua. Os dados internos (usuários, sessões, conversas e reuniões) ficam em `server/data/app.db`, que é ignorado pelo git.

Sem PostgreSQL e sem n8n, a aplicação funciona e mostra os estados de indisponibilidade:
- todas as telas, a autenticação, as permissões, as configurações e o Modo reunião (estados e registros) funcionam;
- os relatórios saem marcados como "DADOS INDISPONÍVEIS";
- a RINNE responde "indisponível", com apoio determinístico.

## Verificações

```bash
npm run typecheck          # server + web
npm test                   # 69 testes da API (node:test) + 16 da interface (vitest)
npm run build              # build de produção do web
npm --prefix server audit && npm --prefix web audit
bash scripts/homologar.sh  # homologação visual com Playwright + Edge (banco temporário; ver HOMOLOGACAO_LOCAL.md)
```

## Problemas comuns

| sintoma | causa / solução |
|---|---|
| `Node.js sem crypto.argon2` | atualize para Node 24.7+ |
| porta 3333 ocupada | outra API em execução; encerre-a ou use `PORT=…` (a linha de comando prevalece sobre o `.env`) |
| microfone não liga | a página precisa ser `localhost` ou HTTPS; permita o microfone no navegador |
| "Seu IP atual" = 127.0.0.1 | normal no dev (Vite repassa do loopback) |
