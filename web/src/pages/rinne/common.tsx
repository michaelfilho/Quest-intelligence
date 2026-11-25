// Peças compartilhadas pelos três modos da RINNE (uma única inteligência).
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Download, MessageSquarePlus, Pencil, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { RinneMessage, RinneMode, RinneSessionSummary, RinneTable } from "../../../../shared/rinne";
import { base64ToBlob } from "../../audio";
import { api, BASIS_LABEL, downloadFrom, fmt, fmtDate, send, STATUS_LABEL } from "../../lib";
import type { Unit } from "../../../../shared/contracts";

export interface RinneStatus {
  available: boolean;
  reason: string | null;
  browserTts: boolean;
}
export const useRinneStatus = () => useQuery({ queryKey: ["rinne-status"], queryFn: () => api<RinneStatus>("/rinne/status"), staleTime: 60000 });

export function UnavailableBanner({ status }: { status?: RinneStatus }) {
  if (!status || status.available) return null;
  return (
    <div role="status" className="flex items-start gap-3 rounded-xl border border-q-line border-l-4 border-l-q-orange bg-white px-5 py-4 text-sm">
      <AlertTriangle size={18} className="mt-0.5 shrink-0 text-q-orange" aria-hidden />
      <div>
        <p className="font-bold">Inteligência da RINNE indisponível</p>
        <p className="mt-0.5 text-q-mid">{status.reason} As consultas simples continuam sendo respondidas pelo modo determinístico do sistema, sem interpretação por IA e sem respostas fictícias.</p>
      </div>
    </div>
  );
}

// ---------------- Lista de conversas ----------------
export function SessionList({ mode, current, onSelect }: { mode: Exclude<RinneMode, "MEETING">; current: string | null; onSelect: (id: string | null) => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["rinne-sessions", mode], queryFn: () => api<RinneSessionSummary[]>("/rinne/sessions", { mode }) });
  const [editing, setEditing] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const refresh = () => qc.invalidateQueries({ queryKey: ["rinne-sessions", mode] });

  async function create() {
    const r = await send<{ id: string }>("POST", "/rinne/sessions", { mode });
    await refresh();
    onSelect(r!.id);
  }

  return (
    <aside className="flex h-fit flex-col rounded-xl border border-q-line bg-white lg:sticky lg:top-24" aria-label="Conversas">
      <div className="flex items-center justify-between border-b border-q-line px-4 py-3">
        <span className="text-sm font-bold">Conversas</span>
        <button onClick={create} className="flex items-center gap-1.5 rounded-lg bg-q-ink px-2.5 py-1.5 text-xs font-semibold text-white"><MessageSquarePlus size={14} /> Nova</button>
      </div>
      <ul className="max-h-[60vh] overflow-y-auto p-2">
        {q.data?.map((s) => (
          <li key={s.id} className={`group rounded-lg ${s.id === current ? "bg-q-bg" : "hover:bg-q-bg/60"}`}>
            {editing === s.id ? (
              <form className="flex items-center gap-1 p-1.5" onSubmit={async (e) => (e.preventDefault(), await send("PATCH", `/rinne/sessions/${s.id}`, { title }), setEditing(null), refresh())}>
                <input autoFocus aria-label="Título da conversa" className="h-8 min-w-0 flex-1 rounded border border-q-line px-2 text-sm" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} />
                <button aria-label="Salvar título"><Check size={15} /></button>
                <button type="button" aria-label="Cancelar" onClick={() => setEditing(null)}><X size={15} /></button>
              </form>
            ) : (
              <div className="flex items-center">
                <button onClick={() => onSelect(s.id)} className="min-w-0 flex-1 px-3 py-2 text-left">
                  <div className="truncate text-sm font-medium">{s.title}</div>
                  <div className="text-[11px] text-q-mid">{fmt(s.updatedAt, "datetime")} · {s.messages} mensagens</div>
                </button>
                <div className="flex gap-0.5 pr-1.5 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
                  <button aria-label={`Renomear ${s.title}`} onClick={() => (setEditing(s.id), setTitle(s.title))} className="rounded p-1 text-q-mid hover:text-q-ink"><Pencil size={13} /></button>
                  <button aria-label={`Exportar ${s.title}`} onClick={() => downloadFrom(`/rinne/sessions/${s.id}/export`, {}, "rinne.md")} className="rounded p-1 text-q-mid hover:text-q-ink"><Download size={13} /></button>
                  <button aria-label={`Excluir ${s.title}`} onClick={async () => {
                    if (!confirm(`Excluir a conversa "${s.title}"?`)) return;
                    await send("DELETE", `/rinne/sessions/${s.id}`);
                    if (s.id === current) onSelect(null);
                    refresh();
                  }} className="rounded p-1 text-q-mid hover:text-q-orange"><Trash2 size={13} /></button>
                </div>
              </div>
            )}
          </li>
        ))}
        {q.data && !q.data.length && <li className="px-3 py-6 text-center text-xs text-q-mid">Nenhuma conversa ainda.</li>}
      </ul>
    </aside>
  );
}

// ---------------- Mensagens ----------------
const ORIGIN: Record<string, string> = { n8n: "RINNE (n8n)", deterministico: "Sistema (determinístico)", sistema: "Sistema" };
const REPLY_STATUS: Record<string, string> = { pending: "Processando…", unavailable: "IA indisponível", error: "Falha", cancelled: "Cancelada", done: "" };

type Resolved = { id: string; label: string; unit: Unit; basis: keyof typeof BASIS_LABEL; status: keyof typeof STATUS_LABEL; value: unknown; reliability: string; sources: string[]; reason?: string };

function TableView({ t }: { t: RinneTable }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-q-line">
      <div className="border-b border-q-line bg-q-bg px-3 py-1.5 text-xs font-semibold">{t.title}</div>
      <table className="w-full text-xs">
        <thead><tr>{t.columns.map((c) => <th key={c} className="px-3 py-1.5 text-left font-semibold">{c}</th>)}</tr></thead>
        <tbody>{t.rows.map((r, i) => <tr key={i} className="border-t border-q-line/60">{r.map((v, j) => <td key={j} className="px-3 py-1.5">{v === null ? "—" : String(v)}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

export function MessageView({ m }: { m: RinneMessage }) {
  // Áudio da resposta via blob: URL (a CSP não permite data: em mídia).
  const audio = m.payload.audio;
  const audioUrl = useMemo(() => (audio ? URL.createObjectURL(base64ToBlob(audio.data, audio.mimeType)) : null), [audio]);
  useEffect(() => () => void (audioUrl && URL.revokeObjectURL(audioUrl)), [audioUrl]);
  if (m.role === "user") {
    return <div className="ml-auto max-w-[80%] rounded-2xl rounded-br-sm bg-q-ink px-4 py-2.5 text-sm whitespace-pre-wrap text-white">{m.content}</div>;
  }
  const p = m.payload;
  const resolved = (p.resolvedIndicators as Resolved[] | undefined) ?? [];
  return (
    <article className="max-w-[92%] space-y-3 rounded-2xl rounded-bl-sm border border-q-line bg-white px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-q-mid">
        <span className="font-semibold text-q-ink">{ORIGIN[p.origin ?? "sistema"]}</span>
        {REPLY_STATUS[m.status] && <span className={`rounded px-1.5 py-0.5 font-bold uppercase ${m.status === "pending" ? "animate-pulse bg-q-bg" : "bg-q-orange text-white"}`}>{REPLY_STATUS[m.status]}</span>}
        <span>{fmt(m.createdAt, "datetime")}</span>
        {p.requestId && <span className="font-mono" title="Identificador de rastreamento">#{String(p.requestId).slice(0, 8)}</span>}
      </div>
      {p.transcript && <p className="rounded-lg bg-q-bg px-3 py-2 text-xs"><span className="font-semibold">Transcrição:</span> {p.transcript}</p>}
      {/* Texto sempre como texto puro (nada de HTML vindo da IA). */}
      <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
      {p.summary && <p className="rounded-lg border-l-4 border-q-orange bg-q-bg px-3 py-2 text-xs whitespace-pre-wrap">{p.summary}</p>}
      {resolved.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-q-mid">Indicadores consultados (calculados pelo sistema)</div>
          {resolved.map((i) => (
            <div key={i.id} className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg bg-q-bg px-3 py-2">
              <span className="font-semibold">{i.label}</span>
              <span className="num font-bold">{i.status === "OK" ? fmt(i.value, i.unit) : <span className="text-xs uppercase text-q-mid">{STATUS_LABEL[i.status]}</span>}</span>
              <span className="w-full text-[11px] text-q-mid">Base {BASIS_LABEL[i.basis]} · confiabilidade {i.reliability} · origem {i.sources.join(", ")}</span>
            </div>
          ))}
        </div>
      )}
      {p.tables?.map((t, i) => <TableView key={i} t={t} />)}
      {p.charts?.map((c, i) => (
        <div key={i} className="h-56 rounded-lg border border-q-line p-2">
          <div className="px-1 text-xs font-semibold">{c.title} <span className="font-normal text-q-mid">(gerado pela RINNE)</span></div>
          <ResponsiveContainer width="100%" height="88%">
            {c.kind === "line" ? (
              <LineChart data={c.points}><CartesianGrid stroke="#E6E6E6" vertical={false} /><XAxis dataKey="label" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} /><Tooltip /><Legend />{c.series.map((s, k) => <Line key={s} dataKey={s} stroke={k ? "#292929" : "#F58220"} dot={false} />)}</LineChart>
            ) : (
              <BarChart data={c.points}><CartesianGrid stroke="#E6E6E6" vertical={false} /><XAxis dataKey="label" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} /><Tooltip /><Legend />{c.series.map((s, k) => <Bar key={s} dataKey={s} fill={k ? "#292929" : "#F58220"} />)}</BarChart>
            )}
          </ResponsiveContainer>
        </div>
      ))}
      {!!p.sources?.length && <p className="text-[11px] text-q-mid">Fontes: {p.sources.map((s) => s.label ?? s.id).join(" · ")}</p>}
      {!!p.warnings?.length && <ul className="space-y-0.5 text-xs text-q-graphite">{p.warnings.map((w, i) => <li key={i}>⚠ {w}</li>)}</ul>}
      {!!p.suggestions?.length && (
        <div><div className="text-[11px] font-semibold uppercase tracking-wide text-q-mid">Sugestões gerenciais</div><ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">{p.suggestions.map((s, i) => <li key={i}>{s}</li>)}</ul></div>
      )}
      {audioUrl && <audio controls src={audioUrl} className="h-9 w-full" aria-label="Resposta em áudio" />}
      {p.period && <p className="text-[11px] text-q-mid">Período {fmtDate(p.period.from)} – {fmtDate(p.period.to)}</p>}
    </article>
  );
}

/** Mensagens da conversa; atualiza sozinho (com intervalo crescente) apenas enquanto houver resposta pendente. */
export function useMessages(sessionId: string | null) {
  return useQuery({
    queryKey: ["rinne-messages", sessionId],
    queryFn: () => api<RinneMessage[]>(`/rinne/sessions/${sessionId}/messages`),
    enabled: !!sessionId,
    refetchInterval: (q) => {
      const pending = q.state.data?.some((m) => m.status === "pending");
      if (!pending) return false;
      return Math.min(15000, 3000 * 2 ** Math.min(3, Math.floor(q.state.dataUpdateCount / 5))); // 3 s → 15 s
    },
  });
}
