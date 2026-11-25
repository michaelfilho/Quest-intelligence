import { Mic, MicOff, Pause, Play, Send, ShieldAlert, Square, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { base64ToBlob, recordSegment, SEGMENT_MAX_BYTES, SEGMENT_MAX_MS, speak, useMicrophone } from "../../audio";
import { PageHeader } from "../../components/ui";
import { useCan } from "../../lib";
import { NoAccess } from "../ModulePage";
import { Conversation, useSender } from "./ChatPage";
import { SessionList, UnavailableBanner, useMessages, useRinneStatus } from "./common";

type Phase = "pronta" | "ouvindo" | "pausada" | "processando" | "falando";
const PHASE_LABEL: Record<Phase, string> = { pronta: "Pronta", ouvindo: "Ouvindo…", pausada: "Gravação pausada", processando: "Processando…", falando: "Falando…" };

export function VoicePanel({ sessionId, sender }: { sessionId: string; sender: ReturnType<typeof useSender> }) {
  const status = useRinneStatus().data;
  const mic = useMicrophone();
  const msgs = useMessages(sessionId);
  const [consent, setConsent] = useState(false);
  const [phase, setPhase] = useState<Phase>("pronta");
  const [volume, setVolume] = useState(0.9);
  const [warn, setWarn] = useState<string | null>(null);
  const rec = useRef<ReturnType<typeof recordSegment> | null>(null);
  const player = useRef<HTMLAudioElement | null>(null);
  const lastPlayed = useRef<string | null>(null);

  // Reproduz a resposta mais recente da RINNE (áudio do n8n ou, se permitido, voz nativa do navegador).
  useEffect(() => {
    const last = [...(msgs.data ?? [])].reverse().find((m) => m.role === "assistant" && m.status !== "pending");
    if (!last || last.id === lastPlayed.current) return;
    const first = lastPlayed.current === null;
    lastPlayed.current = last.id;
    if (first) return; // não fala o histórico ao abrir a conversa
    if (last.payload.audio) {
      const url = URL.createObjectURL(base64ToBlob(last.payload.audio.data, last.payload.audio.mimeType));
      const a = new Audio(url);
      a.volume = volume;
      player.current = a;
      setPhase("falando");
      a.onended = a.onerror = () => (URL.revokeObjectURL(url), setPhase("pronta"));
      void a.play().catch(() => setPhase("pronta"));
    } else if (status?.browserTts && last.content) {
      setPhase("falando");
      speak(last.content, volume, () => setPhase("pronta"));
    }
  }, [msgs.data]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => interrupt(), []); // eslint-disable-line react-hooks/exhaustive-deps

  function interrupt() {
    rec.current?.stop();
    rec.current = null;
    player.current?.pause();
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    sender.cancel();
    setPhase("pronta");
  }

  function startTalking() {
    if (!mic.stream.current) return;
    setWarn(null);
    rec.current = recordSegment(mic.stream.current, SEGMENT_MAX_MS);
    setPhase("ouvindo");
    void rec.current.done.then(async (seg) => {
      if (!rec.current) return; // interrompido: descarta sem enviar
      rec.current = null;
      if (seg.blob.size > SEGMENT_MAX_BYTES) return (setWarn("Segmento grande demais; fale em trechos menores."), setPhase("pronta"));
      setPhase("processando");
      await sender.sendAudio(seg.blob, seg.mimeType, seg.durationMs);
      setPhase((p) => (p === "processando" ? "pronta" : p));
    });
  }

  const active = mic.state === "active";
  return (
    <div className="space-y-3 border-t border-q-line bg-white p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold ${phase === "pronta" ? "bg-q-bg" : "bg-q-orange text-white"}`} aria-live="polite">
          <span className={`h-2 w-2 rounded-full ${phase === "pronta" ? "bg-q-mid" : "animate-pulse bg-white"}`} /> {active ? PHASE_LABEL[phase] : "Microfone desligado"}
        </span>
        <div className="h-2.5 w-40 overflow-hidden rounded-full bg-q-bg" aria-label="Nível do microfone"><div className="h-full bg-q-orange transition-[width] duration-75" style={{ width: `${Math.round(mic.level * 100)}%` }} /></div>
        <label className="ml-auto flex items-center gap-2 text-xs"><Volume2 size={15} /> Volume
          <input type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => { const v = Number(e.target.value); setVolume(v); if (player.current) player.current.volume = v; }} aria-label="Volume da resposta" className="accent-q-orange" />
        </label>
      </div>

      {!active ? (
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex max-w-xl items-start gap-2 text-xs">
            <input type="checkbox" className="mt-0.5 accent-q-orange" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            Autorizo o uso do microfone nesta conversa. O áudio é enviado em trechos curtos apenas quando eu clicar em “Enviar”, para transcrição pela RINNE; não é armazenado.
          </label>
          <button disabled={!consent} onClick={mic.start} className="flex h-10 items-center gap-2 rounded-lg bg-q-orange px-4 text-sm font-semibold text-white disabled:opacity-50"><Mic size={16} /> Ativar microfone</button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {phase === "pronta" || phase === "falando" ? (
            <button onClick={startTalking} className="flex h-10 items-center gap-2 rounded-lg bg-q-orange px-4 text-sm font-semibold text-white"><Mic size={16} /> Falar</button>
          ) : null}
          {(phase === "ouvindo" || phase === "pausada") && (
            <>
              <button onClick={() => rec.current?.stop()} className="flex h-10 items-center gap-2 rounded-lg bg-q-orange px-4 text-sm font-semibold text-white"><Send size={15} /> Enviar</button>
              {phase === "ouvindo" ? (
                <button onClick={() => (rec.current?.pause(), setPhase("pausada"))} className="flex h-10 items-center gap-2 rounded-lg border border-q-line px-4 text-sm font-semibold"><Pause size={15} /> Pausar</button>
              ) : (
                <button onClick={() => (rec.current?.resume(), setPhase("ouvindo"))} className="flex h-10 items-center gap-2 rounded-lg border border-q-line px-4 text-sm font-semibold"><Play size={15} /> Retomar</button>
              )}
            </>
          )}
          {phase !== "pronta" && <button onClick={interrupt} className="flex h-10 items-center gap-2 rounded-lg bg-q-ink px-4 text-sm font-semibold text-white"><Square size={14} /> Interromper</button>}
          <button onClick={() => (interrupt(), mic.stop(), setConsent(false))} className="ml-auto flex h-10 items-center gap-2 rounded-lg border border-q-line px-4 text-sm"><MicOff size={15} /> Desligar microfone</button>
        </div>
      )}
      {warn && <p className="text-xs text-q-orange">{warn}</p>}
      {mic.state === "denied" && <p className="flex items-center gap-2 text-xs"><ShieldAlert size={14} className="text-q-orange" /> Permissão do microfone negada no navegador.</p>}
      {mic.state === "unsupported" && <p className="flex items-center gap-2 text-xs"><ShieldAlert size={14} className="text-q-orange" /> Microfone requer HTTPS (ou localhost) e um navegador compatível.</p>}
      {mic.state === "blocked" && <p className="flex items-center gap-2 text-xs"><ShieldAlert size={14} className="text-q-orange" /> A política desta página bloqueia o microfone. Abra a RINNE Voz pelo menu.</p>}
      <p className="text-[11px] text-q-mid">
        Segmentos de até {SEGMENT_MAX_MS / 1000} s. Transcrição e voz da RINNE são processadas no n8n{status?.available ? "" : " (integração indisponível no momento)"}.
        {status?.browserTts ? " Sem áudio do n8n, a resposta pode ser lida pela voz nativa do navegador (pt-BR, preferência por voz masculina grave)." : ""}
      </p>
    </div>
  );
}

export function VoicePage() {
  const can = useCan();
  const status = useRinneStatus();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const sender = useSender(sessionId);
  if (!can("rinne_voz.use")) return <NoAccess title="RINNE Voz" />;
  return (
    <div className="mx-auto max-w-[1480px] space-y-6">
      <PageHeader icon={Mic} title="RINNE Voz" subtitle="Converse por voz com a RINNE. O microfone só é liberado nesta tela e no Modo reunião, e só liga com a sua autorização." />
      <UnavailableBanner status={status.data} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
        <SessionList mode="VOICE" current={sessionId} onSelect={setSessionId} />
        <Conversation key={sessionId} sessionId={sessionId} sender={sender} extra={sessionId && <VoicePanel key={sessionId} sessionId={sessionId} sender={sender} />} />
      </div>
    </div>
  );
}
