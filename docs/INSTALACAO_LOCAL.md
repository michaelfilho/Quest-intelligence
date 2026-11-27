# Instalação local (Windows 11)

## Requisitos

- **Node.js 24.7 ou superior**: Argon2id e SQLite vêm da biblioteca padrão. Testado nesta execução com 24.19.0.
- Microsoft Edge ou Chrome (a homologação visual usa o Edge instalado).
- Docker é opcional e não existe nesta máquina.

## Instalação

```bash
npm run setup              # instala server/, frontend/ e e2e/ com os lockfiles
cp .env.example .env       # opcional; sem .env a API sobe sem banco
```

O `.env` do projeto prevalece sobre a `DATABASE_URL` herdada do Windows (que existe nesta máquina e pertence a outro projeto). Para as demais variáveis, valem as da linha de comando.

## Executar

```bash
npm run dev:api            # terminal 1 → API em http://127.0.0.1:3333
npm run dev:web            # terminal 2 → http://localhost:5173
npm --prefix server run user:admin -- <usuario> "Nome"   # 1º acesso (senha temporária exibida uma vez)
```

Abra **http://localhost:5173**, entre com a senha temporária e defina a sua. Os dados internos (usuários, sessões e configurações) ficam em `server/data/app.db`, que é ignorado pelo git.

Sem o PostgreSQL, a aplicação funciona e mostra os estados de indisponibilidade:
- todas as telas, a autenticação, as permissões e as configurações funcionam;
- os indicadores aparecem como "Sem conexão com o banco", nunca como zero;
- os relatórios saem marcados como "DADOS INDISPONÍVEIS".

## Verificações

```bash
npm run typecheck          # server + web
npm test                   # 45 testes da API (node:test) + 12 da interface (vitest)
npm run build              # build de produção do web
npm --prefix server audit && npm --prefix web audit
npm run homologacao  # homologação visual (Playwright + Edge, build de produção, banco temporário)
```

## Problemas comuns

| sintoma | causa / solução |
|---|---|
| `Node.js sem crypto.argon2` | atualize para Node 24.7+ |
| porta 3333 ocupada | outra API em execução; encerre-a ou use `PORT=…` |
| "Seu IP atual" = 127.0.0.1 | normal no dev (o Vite repassa do loopback) |
