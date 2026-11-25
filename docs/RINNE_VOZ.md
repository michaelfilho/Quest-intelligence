# RINNE Voz (modo VOICE)

Tela: **RINNE Voz** (`/rinne/voz`). Permissão: `rinne_voz.use`. É a mesma inteligência e o mesmo histórico de conversas da RINNE IA, em conversas do tipo VOICE.

## Fluxo (contrato preparado)

1. **Consentimento:** caixa de autorização + botão "Ativar microfone". Nada liga automaticamente.
2. **Captura:** "Falar" grava **um segmento independente** (arquivo válido, até 30 s, ~32 kbit/s). É possível pausar e retomar; "Interromper" descarta o segmento sem enviar.
3. **Envio:** "Enviar" manda o **binário** (sem Base64) para `POST /api/rinne/sessions/{id}/audio` com `Content-Type` do áudio e `X-Audio-Duration-Ms`. O backend aceita até 2 MB e 60 s por segmento e não armazena o áudio.
4. **Transcrição, interpretação, consulta e resposta:** o backend encaminha ao n8n como `mode: VOICE`, `operation: TRANSCRIBE`; o n8n transcreve, interpreta, usa as ferramentas e responde.
5. **Retorno:** a resposta pode trazer `transcript`, `text` e `audio` (base64 curto). A tela mostra a transcrição e o texto e reproduz o áudio por `blob:` URL.
6. **Alternativa local:** se o n8n não devolver áudio e a configuração "voz nativa do navegador" estiver ligada (padrão), a resposta é lida pela `speechSynthesis` do navegador. A preferência é por voz **masculina pt-BR** (ex.: Microsoft Daniel), com tom mais grave (pitch 0,75) e ritmo firme (0,95). Isso depende do sistema e do navegador e **pode não ser offline**.

## Indicadores na tela

Estados exibidos: "Pronta", "Ouvindo…", "Gravação pausada", "Processando…" e "Falando…". Há também medidor de nível do microfone, controle de volume, interrupção e entrada por texto como alternativa.

## Microfone e segurança

- `Permissions-Policy` libera `microphone=(self)` **somente** em `/rinne/voz` e `/reuniao`. Câmera e localização ficam sempre bloqueadas.
- O menu recarrega o documento ao entrar ou sair dessas rotas, para que a política do servidor valha. Na navegação SPA a política do documento anterior continuaria ativa.
- As trilhas de áudio são encerradas ao desligar o microfone e ao sair da tela.
- O microfone exige contexto seguro: HTTPS em produção ou `localhost`.

## Limitações atuais

- A transcrição e a voz inteligentes dependem dos workflows do n8n, que ainda não existem. Sem eles, cada envio de áudio gera "indisponível".
- O motor de reconhecimento e síntese será escolhido na construção dos workflows (decisão fora da aplicação).
