# Homologação local — 25/11/2026

Resultado: **36 verificações Playwright aprovadas na raiz e outras 36 em `/core/`, zero falhas e zero erros inesperados de console**, usando Microsoft Edge headless e o build de produção via Vite preview. Quatro mensagens HTTP 401/403 são esperadas em cada execução nos cenários de autenticação e acesso negado. A homologação visual local não acessa PostgreSQL externo; a integração SQL é coberta separadamente pelas fixtures PostgreSQL e API real em [TESTES.md](TESTES.md).

## Reproduzir

```bash
npm run setup
npm run homologacao
```

O comando recompila o frontend, verifica portas livres e inicia API e preview isolados em `127.0.0.1:3334` e `127.0.0.1:4174`. Cria SQLite temporário, ignora `.env`, desabilita PostgreSQL e encerra seus processos ao terminar. Não altera `server/data`. Portas alternativas: `HOMOLOG_API_PORT` e `HOMOLOG_WEB_PORT`; navegador alternativo instalado: `EDGE`.

Evidências locais em `e2e/output/resultado.json` e capturas PNG em `e2e/output/`, ignoradas pelo Git. Logs e SQLite de teste ficam no diretório temporário informado pelo comando. Credenciais usadas são fixtures descartáveis.

## Checklist executado

- [x] Login, erro genérico, troca obrigatória de senha e logout.
- [x] Visão geral, Clientes e detalhe, Projetos e detalhe, Rentabilidade e Financeiro.
- [x] Timesheet, Departamentos, Colaboradores, Produtividade e Produção.
- [x] Contratos, Contratado × executado, Capacidade operacional e Eficiência.
- [x] Qualidade dos dados, Relatórios, Configurações e Minha conta.
- [x] Ausência de IA, voz e reunião no menu e rotas removidas.
- [x] PostgreSQL indisponível sem exibir números inventados.
- [x] Gaveta de rastreabilidade, ordenação e filtros de período/comparação na URL.
- [x] Prévia e downloads XLSX, CSV e Markdown; página de impressão para PDF.
- [x] Nove seções de configurações; criação de usuário Analista.
- [x] Analista: troca de senha, menu filtrado, URLs proibidas e colunas financeiras ocultas.
- [x] Desktop 1440×900, notebook 1280×720 e celular 390×844; ausência de overflow nos cenários cobertos.

As capturas de visão geral desktop e celular foram inspecionadas visualmente. PDF foi validado como página de impressão; a gravação interativa pelo diálogo do navegador não é automatizada.

## Limites

PostgreSQL real, cálculos financeiros com dados reais, monitoramento real do n8n, containers, nginx em execução, TLS e bloqueio por IP no proxy da VPS continuam pendentes. Testes de API validam as regras de IP e permissões localmente.

O SQLite local já estava marcado com a 003 aplicada e sem as tabelas históricas antes desta execução. A revisão preserva históricos em próximos upgrades, mas não recupera dados previamente excluídos.
