# Modo reunião (modo MEETING)

Tela: **Modo reunião** (`/reuniao`). Permissão: `reuniao.use`. A inteligência é a mesma da RINNE; não existe um agente separado na aplicação.

## Máquina de estados (determinística, no backend)

Implementada em [server/src/meetings/state.ts](../server/src/meetings/state.ts), por regras e sem IA.

```
IDLE ─START→ CONSENT ─CONSENT→ DEPARTMENT_SELECTION ─SELECT_DEPARTMENT→ PERIOD_SELECTION ─SELECT_PERIOD→ ANALYSIS
ANALYSIS ─RECORD_ITEM / ASK / AUDIO_SEGMENT / SELECT_PERIOD→ ANALYSIS
ANALYSIS ─COMPLETE_DEPARTMENT→ DEPARTMENT_COMPLETED ─NEXT_DEPARTMENT→ NEXT_DEPARTMENT ─SELECT_DEPARTMENT→ PERIOD_SELECTION …
ANALYSIS | DEPARTMENT_SELECTION | DEPARTMENT_COMPLETED | NEXT_DEPARTMENT ─COMPLETE_MEETING→ MEETING_COMPLETED
qualquer ativo ─PAUSE→ PAUSED ─RESUME→ (estado anterior)
qualquer ativo ─FAIL→ ERROR ─RECOVER→ (estado anterior)
qualquer não terminal ─CANCEL→ CANCELLED          (MEETING_COMPLETED e CANCELLED são terminais)
```

Transição inválida → 409. A tela mostra só os botões das ações permitidas no estado (`allowedEvents`).

## Fluxo

1. "**RINNE, iniciar modo reunião**" (botão ou `POST /api/rinne/meetings`): a reunião é criada e vai para CONSENT.
2. **Consentimento:** microfone (transcrição) e aviso de registro aos participantes. É possível seguir só com texto.
3. "**Qual departamento você deseja analisar?**" Aceita qualquer nome, inclusive com acento. Usuário com escopo só pode escolher o próprio departamento (403).
4. "**Qual período deseja analisar?**" Aceita: Hoje, Ontem, Esta semana, Este mês, Mês anterior, Últimos 30 dias, Últimos três meses, Este ano ou `dd/mm/aaaa a dd/mm/aaaa`.
5. **Análise:** um snapshot determinístico dos indicadores do departamento é gravado, respeitando permissões. Durante a análise é possível:
   - registrar **observações, decisões, problemas, oportunidades e encaminhamentos**, com responsável e prazo **somente quando informados**;
   - fazer perguntas (`DEPARTMENT_ANALYSIS` via n8n);
   - capturar áudio em segmentos.
6. "**Departamento finalizado**": o backend consolida a parte determinística (contagens, itens, indicadores analisados) e pede a consolidação inteligente ao n8n (`DEPARTMENT_SUMMARY`). Depois pergunta "**Qual é o próximo departamento?**"
7. "**Encerrar reunião**": a captura é encerrada, o departamento ativo é consolidado, o relatório é gerado (`MEETING_REPORT` via n8n, se disponível) e tudo é persistido. A consulta e a exportação ficam disponíveis.

### Comandos por texto (ou transcrição)

Interpretados por regra em `parseCommand`, sem IA:
- controle da reunião: "iniciar modo reunião", "departamento finalizado", "próximo departamento", "encerrar reunião", "pausar", "retomar", "cancelar reunião", "recuperar";
- registros: `observação:` · `decisão:` · `problema:` · `oportunidade:` · `encaminhamento: … ; responsável: Nome ; prazo: dd/mm/aaaa`;
- na análise, qualquer outro texto vira pergunta à RINNE.

## Reuniões longas (até 5 horas)

- **Persistência incremental:** cada departamento, item e segmento é gravado na hora. A reunião pode ser retomada após recarregar a página ou reiniciar o servidor (há teste para isso).
- **Segmentos:** captura contínua em segmentos de até 30 s, numerados (`X-Segment-Seq`). Um reenvio do mesmo número **não** é reprocessado. O checkpoint (`lastSeq`) indica de onde continuar.
- **Limite:** após 5 horas só é possível pausar, finalizar o departamento, encerrar ou cancelar.
- O gerenciamento de contexto dos modelos, resumos e tokens fica no n8n. A reunião **nunca** é enviada inteira numa única requisição: são segmentos e consolidações por departamento.
- Áudio bruto **não é armazenado**; só a duração, o tamanho, o estado e a transcrição (quando houver).

## Relatório

- Disponível em JSON, Markdown e PDF (impressão do navegador com identidade Quest), **mesmo sem IA**.
- Nesse caso traz o aviso "Análise inteligente indisponível" e os registros feitos na reunião.
- Responsáveis e prazos aparecem só quando informados.
- Retenção: configurável em Configurações → Retenção de reuniões (padrão 365 dias).

## Limitações atuais

Sem os workflows do n8n, as consolidações e o relatório final contêm apenas a parte determinística, e as perguntas durante a análise respondem "indisponível". Sem o PostgreSQL, os indicadores do snapshot ficam indisponíveis.
