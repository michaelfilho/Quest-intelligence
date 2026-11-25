# RINNE IA (modo CHAT)

Tela: **RINNE IA** (`/rinne`). Permissão: `rinne_ia.use`.

## Funcionalidades implementadas

- **Conversas:** criar, listar (as 100 mais recentes), renomear, exportar em Markdown e excluir. Só o dono acessa; a conversa de outro usuário retorna 404.
- **Envio de mensagens** com período e filtros globais da tela.
- **Cancelamento real da espera:** o navegador aborta a requisição e o backend aborta a chamada ao n8n.
- **Idempotência:** cada envio leva um `Idempotency-Key`, então um clique duplicado não gera segundo processamento.
- **Estados da resposta:** concluída, processando (assíncrona, consultada com intervalo crescente de 3 s a 15 s), indisponível, falha e cancelada.
- **Exibição validada:**
  - texto puro;
  - indicadores consultados com valores **recalculados pelo sistema**, base temporal, confiabilidade e origem;
  - fontes, avisos e sugestões gerenciais;
  - tabelas e gráficos estruturados, identificados como "gerado pela RINNE";
  - áudio, quando houver;
  - identificador de rastreamento `#requestId`.
- **Exemplos:** as 7 perguntas estratégicas aparecem como atalhos numa conversa vazia.

## Sem n8n

A mensagem aparece como **"Inteligência da RINNE indisponível"**, junto com os indicadores relacionados à pergunta, calculados de forma determinística. Exemplo: "Quanto recebemos?" mostra Receita recebida. Nenhuma resposta é inventada; sem banco, os valores aparecem como "Sem conexão com o banco".

## Modo determinístico

O backend identifica os indicadores citados pela pergunta por palavras-chave e sinônimos (ex.: recebemos → receita recebida; gargalos → atraso, retrabalho, ocupação). É um apoio, não interpretação por IA. A rota antiga `POST /api/rinne/ask` continua disponível.

## API

Ver [API.md](API.md#rinne). Contrato com o n8n: [CONTRATOS_WEBHOOKS.md](CONTRATOS_WEBHOOKS.md).
