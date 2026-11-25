import { useQueryClient } from "@tanstack/react-query";
import { Bot, Send, Square } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { FilterBar } from "../../components/FilterBar";
import { PageHeader } from "../../components/ui";
import { ApiError, filterParams, newId, toQuery, useCan, useFilters } from "../../lib";
import { NoAccess } from "../ModulePage";
import { MessageView, SessionList, UnavailableBanner, useMessages, useRinneStatus } from "./common";

const EXAMPLES = ["Quanto recebemos neste mês?", "Qual cliente possui maior rentabilidade?", "Quais departamentos estão sobrecarregados?", "Onde estamos entregando além do contratado?", "Quais clientes precisam renegociar seus contratos?", "Qual foi o resultado operacional do período?", "Quais são os principais gargalos da agência?"];

/** Envio com cancelamento real (AbortController → o backend aborta a chamada ao n8n) e chave de idempotência. */
export function useSender(sessionId: string | null) {
  const qc = useQueryClient();
  const { filters } = useFilters();
  const ctrl = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function post(path: string, init: RequestInit & { headers?: Record<string, string> }) {
    ctrl.current = new AbortController();
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api${path}${toQuery(filterParams(filters))}`, { ...init, credentials: "same-origin", signal: ctrl.current.signal, headers: { "X-Requested-With": "rinne", "Idempotency-Key": newId(), ...init.headers } });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new ApiError(r.status, j?.error ?? `HTTP ${r.status}`);
      return j;
    } catch (e) {
      setError((e as Error).name === "AbortError" ? "Espera cancelada. Nada foi reenviado." : (e as Error).message);
      return null;
    } finally {
      setBusy(false);
      ctrl.current = null;
      qc.invalidateQueries({ queryKey: ["rinne-messages", sessionId] });
      qc.invalidateQueries({ queryKey: ["rinne-sessions"] });
    }
  }

  return {
    busy,
    error,
    cancel: () => ctrl.current?.abort(),
    sendText: (message: string) => post(`/rinne/sessions/${sessionId}/messages`, { method: "POST", body: JSON.stringify({ message }), headers: { "Content-Type": "application/json" } }),
    sendAudio: (blob: Blob, mimeType: string, durationMs: number) => post(`/rinne/sessions/${sessionId}/audio`, { method: "POST", body: blob, headers: { "Content-Type": mimeType, "X-Audio-Duration-Ms": String(Math.max(1, Math.round(durationMs))) } }),
  };
}

export function Conversation({ sessionId, sender, examples, extra }: { sessionId: string | null; sender: ReturnType<typeof useSender>; examples?: string[]; extra?: ReactNode }) {
  const msgs = useMessages(sessionId);
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ block: "end" }), [msgs.data?.length]);

  async function submit(q: string) {
    if (!q.trim() || !sessionId) return;
    setText("");
    await sender.sendText(q.trim());
  }

  if (!sessionId) return <div className="grid min-h-[40vh] place-items-center rounded-xl border border-q-line bg-white p-8 text-center text-sm text-q-mid">Crie ou selecione uma conversa à esquerda.</div>;
  return (
    <div className="flex min-h-[60vh] flex-col rounded-xl border border-q-line bg-q-bg/40">
      <div className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
        {msgs.data?.map((m) => <MessageView key={m.id} m={m} />)}
        {msgs.data && !msgs.data.length && (
          <div className="flex flex-wrap gap-2">
            {examples?.map((e) => <button key={e} onClick={() => submit(e)} className="rounded-full border border-q-line bg-white px-3 py-1.5 text-xs hover:border-q-orange">{e}</button>)}
          </div>
        )}
        {sender.busy && <div className="flex items-center gap-2 text-xs text-q-mid"><span className="h-2 w-2 animate-pulse rounded-full bg-q-orange" /> A RINNE está processando…</div>}
        <div ref={end} />
      </div>
      {extra}
      {sender.error && <p role="alert" className="border-t border-q-line bg-white px-4 py-2 text-xs text-q-ink">{sender.error}</p>}
      <form onSubmit={(e: FormEvent) => (e.preventDefault(), submit(text))} className="flex gap-2 border-t border-q-line bg-white p-3">
        <textarea
          aria-label="Mensagem para a RINNE"
          rows={1}
          maxLength={4000}
          placeholder="Pergunte à RINNE…"
          className="max-h-40 min-h-11 flex-1 resize-y rounded-lg border border-q-line px-3 py-2.5 text-sm focus:border-q-orange focus:outline-none"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), submit(text))}
        />
        {sender.busy ? (
          <button type="button" onClick={sender.cancel} className="flex h-11 items-center gap-2 rounded-lg bg-q-ink px-4 text-sm font-semibold text-white"><Square size={14} /> Cancelar</button>
        ) : (
          <button disabled={!text.trim()} className="flex h-11 items-center gap-2 rounded-lg bg-q-orange px-4 text-sm font-semibold text-white disabled:opacity-50"><Send size={15} /> Enviar</button>
        )}
      </form>
    </div>
  );
}

export function ChatPage() {
  const can = useCan();
  const status = useRinneStatus();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const sender = useSender(sessionId);
  if (!can("rinne_ia.use")) return <NoAccess title="RINNE IA" />;
  return (
    <div className="mx-auto max-w-[1480px] space-y-6">
      <PageHeader icon={Bot} title="RINNE IA" subtitle="Perguntas sobre a gestão da agência. A interpretação é feita pela RINNE (n8n); os valores exibidos são sempre calculados e autorizados pelo sistema." />
      <UnavailableBanner status={status.data} />
      <FilterBar />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
        <SessionList mode="CHAT" current={sessionId} onSelect={setSessionId} />
        <Conversation sessionId={sessionId} sender={sender} examples={EXAMPLES} />
      </div>
    </div>
  );
}
