import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleStop, Download, FileText, Mic, Pause, Play, Presentation, Send, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { PERIOD_PRESETS } from "../../../../shared/rinne";
import { recordSegment, SEGMENT_MAX_MS, useMicrophone } from "../../audio";
import { PageHeader, Panel } from "../../components/ui";
import { api, ApiError, downloadFrom, fmt, fmtDate, send, STATUS_LABEL, useCan, useMe } from "../../lib";
import { NoAccess } from "../ModulePage";
import { MessageView, UnavailableBanner, useMessages, useRinneStatus } from "./common";

type Kind = "observation" | "decision" | "problem" | "opportunity" | "action";
const KIND: Record<Kind, string> = { observation: "Observação", decision: "Decisão", problem: "Problema", opportunity: "Oportunidade", action: "Encaminhamento" };
const STATE_LABEL: Record<string, string> = { IDLE: "Inativa", CONSENT: "Consentimento", DEPARTMENT_SELECTION: "Escolha do departamento", PERIOD_SELECTION: "Escolha do período", ANALYSIS: "Em análise", DEPARTMENT_COMPLETED: "Departamento finalizado", NEXT_DEPARTMENT: "Próximo departamento", MEETING_COMPLETED: "Encerrada", PAUSED: "Pausada", CANCELLED: "Cancelada", ERROR: "Erro" };
const STEPS = ["CONSENT", "DEPARTMENT_SELECTION", "PERIOD_SELECTION", "ANALYSIS", "DEPARTMENT_COMPLETED", "MEETING_COMPLETED"];
const EVENT_BUTTON: Record<string, string> = { PAUSE: "Pausar", RESUME: "Retomar", COMPLETE_DEPARTMENT: "Departamento finalizado", NEXT_DEPARTMENT: "Próximo departamento", COMPLETE_MEETING: "Encerrar reunião", CANCEL: "Cancelar reunião", RECOVER: "Recuperar" };

interface Item { id: string; kind: Kind; text: string; responsible: string | null; dueDate: string | null; source: string }
interface Dept { id: string; seq: number; department: string; period: { label: string; start: string; end: string } | null; status: string; indicators: { id: string; label: string; unit: string; status: keyof typeof STATUS_LABEL; value: unknown }[]; summary: { deterministic: { counts: Record<Kind, number> }; ai: { status: string; text: string | null; error: string | null } } | null; items: Item[] }
interface MeetingView { id: string; title: string; state: string; pausedFrom: string | null; prompt: string; allowedEvents: string[]; consent: { microphone: boolean; recording: boolean }; sessionId: string; startedAt: string; completedAt: string | null; elapsedMs: number; maxDurationMs: number; currentDepartmentId: string | null; departments: Dept[]; segments: { count: number; lastSeq: number | null; totalMs: number }; report: { ai: { status: string; text: string | null; error: string | null }; totals: Record<Kind, number> } | null; intelligence: { available: boolean } }
interface MeetingRow { id: string; title: string; state: string; started_at: string; departments: number }

const input = "h-10 rounded-lg border border-q-line bg-white px-3 text-sm focus:border-q-orange focus:outline-none";
const hms = (ms: number) => `${Math.floor(ms / 3600000)}h${String(Math.floor((ms % 3600000) / 60000)).padStart(2, "0")}`;

function useMeeting(id: string | null) {
  return useQuery({
    queryKey: ["meeting", id],
    queryFn: () => api<MeetingView>(`/rinne/meetings/${id}`),
    enabled: !!id,
    // Atualiza só enquanto houver consolidação assíncrona da RINNE pendente.
    refetchInterval: (q) => (q.state.data && (q.state.data.report?.ai.status === "pending" || q.state.data.departments.some((d) => d.summary?.ai.status === "pending")) ? 5000 : false),
  });
}

/** Captura contínua em segmentos independentes; cada um é enviado com número sequencial (checkpoint). */
function MeetingRecorder({ m, onChange }: { m: MeetingView; onChange: () => void }) {
  const mic = useMicrophone();
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [sent, setSent] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const seq = useRef((m.segments.lastSeq ?? -1) + 1);
  const rec = useRef<ReturnType<typeof recordSegment> | null>(null);
  const live = useRef(false);

  async function loop() {
    while (live.current && mic.stream.current) {
      rec.current = recordSegment(mic.stream.current, SEGMENT_MAX_MS);
      const seg = await rec.current.done;
      const n = seq.current++;
      try {
        const r = await fetch(`/api/rinne/meetings/${m.id}/audio`, { method: "POST", credentials: "same-origin", headers: { "X-Requested-With": "rinne", "Content-Type": seg.mimeType, "X-Audio-Duration-Ms": String(Math.max(1, seg.durationMs)), "X-Segment-Seq": String(n) }, body: seg.blob });
        const j = await r.json().catch(() => null);
        if (!r.ok) throw new ApiError(r.status, j?.error ?? `HTTP ${r.status}`);
        setSent((s) => s + 1);
        onChange();
      } catch (e) {
        setErr((e as Error).message);
        live.current = false;
      }
    }
    setRunning(false);
  }

  function stopAll() {
    live.current = false;
    rec.current?.stop();
    mic.stop();
    setRunning(false);
    setPaused(false);
  }
  useEffect(() => () => stopAll(), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => void (m.state !== "ANALYSIS" && running && stopAll()), [m.state]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!m.consent.microphone) return <p className="text-xs text-q-mid">Microfone não autorizado nesta reunião: registre por texto.</p>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {mic.state !== "active" ? (
        <button onClick={mic.start} className="flex h-10 items-center gap-2 rounded-lg bg-q-orange px-4 text-sm font-semibold text-white"><Mic size={16} /> Ativar microfone</button>
      ) : !running ? (
        <button disabled={m.state !== "ANALYSIS"} onClick={() => ((live.current = true), setRunning(true), setErr(null), void loop())} className="flex h-10 items-center gap-2 rounded-lg bg-q-orange px-4 text-sm font-semibold text-white disabled:opacity-50"><Mic size={16} /> Iniciar captura</button>
      ) : (
        <>
          <span className="flex items-center gap-2 rounded-full bg-q-orange px-3 py-1 text-xs font-bold text-white"><span className="h-2 w-2 animate-pulse rounded-full bg-white" /> {paused ? "Captura pausada" : "Capturando"}</span>
          <button onClick={() => (paused ? rec.current?.resume() : rec.current?.pause(), setPaused(!paused))} className="flex h-10 items-center gap-2 rounded-lg border border-q-line px-3 text-sm">{paused ? <Play size={15} /> : <Pause size={15} />} {paused ? "Retomar" : "Pausar"}</button>
          <button onClick={() => ((live.current = false), rec.current?.stop())} className="flex h-10 items-center gap-2 rounded-lg bg-q-ink px-3 text-sm text-white"><CircleStop size={15} /> Parar captura</button>
        </>
      )}
      {mic.state === "active" && <button onClick={stopAll} className="h-10 rounded-lg border border-q-line px-3 text-sm">Desligar microfone</button>}
      <div className="h-2.5 w-32 overflow-hidden rounded-full bg-q-bg" aria-label="Nível do microfone"><div className="h-full bg-q-orange" style={{ width: `${Math.round(mic.level * 100)}%` }} /></div>
      <span className="text-xs text-q-mid">Segmentos enviados nesta tela: {sent} · total na reunião: {m.segments.count} ({Math.round(m.segments.totalMs / 60000)} min)</span>
      {err && <span className="text-xs text-q-orange" role="alert">{err}</span>}
      {mic.state === "denied" && <span className="text-xs text-q-orange">Permissão do microfone negada.</span>}
      {mic.state === "blocked" && <span className="text-xs text-q-orange">A política desta página bloqueia o microfone. Abra o Modo reunião pelo menu.</span>}
      {mic.state === "unsupported" && <span className="text-xs text-q-orange">Microfone requer HTTPS (ou localhost).</span>}
    </div>
  );
}

function ActiveMeeting({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const me = useMe().data;
  const q = useMeeting(id);
  const msgs = useMessages(q.data?.sessionId ?? null);
  const [cmd, setCmd] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dept, setDept] = useState(me?.scopeDepartment ?? "");
  const [custom, setCustom] = useState({ start: "", end: "" });
  const [item, setItem] = useState<{ kind: Kind; text: string; responsible: string; dueDate: string }>({ kind: "observation", text: "", responsible: "", dueDate: "" });
  const [consent, setConsent] = useState({ microphone: false, recording: false });
  const m = q.data;

  async function act(path: "events" | "command", body: object) {
    setBusy(true);
    setErr(null);
    try {
      const r = await send<{ view: MeetingView }>("POST", `/rinne/meetings/${id}/${path}`, body);
      qc.setQueryData(["meeting", id], r!.view);
      qc.invalidateQueries({ queryKey: ["rinne-messages", r!.view.sessionId] });
      qc.invalidateQueries({ queryKey: ["meetings"] });
      return true;
    } catch (e) {
      setErr((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (q.isError) return <p role="alert" className="text-sm">{(q.error as Error).message}</p>;
  if (!m) return <p className="text-sm text-q-mid">Carregando reunião…</p>;
  const cur = m.departments.find((d) => d.id === m.currentDepartmentId) ?? null;
  const terminal = m.state === "MEETING_COMPLETED" || m.state === "CANCELLED";
  const stepIdx = STEPS.indexOf(m.state === "NEXT_DEPARTMENT" ? "DEPARTMENT_SELECTION" : m.state === "PAUSED" || m.state === "ERROR" ? (m.pausedFrom ?? "") : m.state);

  return (
    <div className="space-y-5">
      <Panel
        title={m.title}
        subtitle={<><span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${terminal ? "bg-q-bg" : "bg-q-orange text-white"}`}>{STATE_LABEL[m.state]}</span> Início {fmt(m.startedAt, "datetime")} · duração {hms(m.completedAt ? Date.parse(m.completedAt) - Date.parse(m.startedAt) : m.elapsedMs)} (máx. 5h)</>}
        actions={<button onClick={onClose} aria-label="Fechar reunião" className="rounded-lg p-1.5 hover:bg-q-bg"><X size={17} /></button>}
      >
        <div className="space-y-4 border-t border-q-line px-6 py-5">
          <ol className="flex flex-wrap gap-1.5" aria-label="Etapas da reunião">
            {STEPS.map((s, i) => <li key={s} className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${i === stepIdx ? "bg-q-ink text-white" : i < stepIdx ? "bg-q-orange/15 text-q-ink" : "bg-q-bg text-q-mid"}`}>{STATE_LABEL[s]}</li>)}
          </ol>
          <p className="rounded-lg border-l-4 border-q-orange bg-q-bg px-4 py-3 text-sm font-medium" aria-live="polite"><span className="font-bold">RINNE:</span> {m.prompt}</p>

          {m.state === "CONSENT" && (
            <form className="space-y-2" onSubmit={(e) => (e.preventDefault(), act("events", { event: "CONSENT", ...consent }))}>
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5 accent-q-orange" checked={consent.microphone} onChange={(e) => setConsent({ ...consent, microphone: e.target.checked })} /> Autorizo o uso do microfone para transcrição (trechos enviados à RINNE; áudio não é armazenado).</label>
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5 accent-q-orange" checked={consent.recording} onChange={(e) => setConsent({ ...consent, recording: e.target.checked })} /> Os participantes foram informados de que a reunião será registrada.</label>
              <button disabled={busy} className="h-10 rounded-lg bg-q-orange px-4 text-sm font-semibold text-white">Continuar {consent.microphone ? "com microfone" : "só com texto"}</button>
            </form>
          )}

          {["DEPARTMENT_SELECTION", "NEXT_DEPARTMENT", "DEPARTMENT_COMPLETED"].includes(m.state) && (
            <form className="flex flex-wrap gap-2" onSubmit={(e) => (e.preventDefault(), act("events", { event: "SELECT_DEPARTMENT", department: dept }))}>
              <input className={`${input} w-72`} placeholder="Departamento (ex.: Criação)" aria-label="Departamento" required minLength={2} maxLength={64} value={dept} disabled={!!me?.scopeDepartment} onChange={(e) => setDept(e.target.value)} />
              <button disabled={busy} className="h-10 rounded-lg bg-q-orange px-4 text-sm font-semibold text-white">Analisar departamento</button>
              {me?.scopeDepartment && <span className="self-center text-xs text-q-mid">Seu acesso é restrito a {me.scopeDepartment}.</span>}
            </form>
          )}

          {m.state === "PERIOD_SELECTION" && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5">{PERIOD_PRESETS.map((p) => <button key={p} disabled={busy} onClick={() => act("events", { event: "SELECT_PERIOD", period: p })} className="rounded-full border border-q-line px-3 py-1.5 text-xs font-medium hover:border-q-orange">{p}</button>)}</div>
              <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => (e.preventDefault(), act("events", { event: "SELECT_PERIOD", start: custom.start, end: custom.end }))}>
                <label className="flex flex-col text-[10px] font-semibold uppercase text-q-mid">De<input type="date" required className={input} value={custom.start} onChange={(e) => setCustom({ ...custom, start: e.target.value })} /></label>
                <label className="flex flex-col text-[10px] font-semibold uppercase text-q-mid">Até<input type="date" required className={input} value={custom.end} min={custom.start} onChange={(e) => setCustom({ ...custom, end: e.target.value })} /></label>
                <button className="h-10 rounded-lg border border-q-line px-3 text-sm">Período personalizado</button>
              </form>
            </div>
          )}

          {m.state === "ANALYSIS" && cur && (
            <div className="space-y-4">
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-q-mid">{cur.department} · {cur.period?.label} ({fmtDate(cur.period?.start ?? "")} – {fmtDate(cur.period?.end ?? "")})</div>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                  {cur.indicators.map((i) => <div key={i.id} className="rounded-lg border border-q-line px-3 py-2"><div className="text-[11px] text-q-mid">{i.label}</div><div className="num text-sm font-bold">{i.status === "OK" ? fmt(i.value, i.unit as never) : <span className="text-[11px] uppercase text-q-mid">{STATUS_LABEL[i.status]}</span>}</div></div>)}
                  {!cur.indicators.length && <p className="col-span-full text-xs text-q-mid">Indicadores do departamento não liberados ao seu perfil.</p>}
                </div>
              </div>
              <form className="flex flex-wrap items-end gap-2" onSubmit={async (e: FormEvent) => {
                e.preventDefault();
                if (await act("events", { event: "RECORD_ITEM", kind: item.kind, text: item.text, responsible: item.responsible || null, dueDate: item.dueDate || null })) setItem({ ...item, text: "", responsible: "", dueDate: "" });
              }}>
                <select aria-label="Tipo de registro" className={input} value={item.kind} onChange={(e) => setItem({ ...item, kind: e.target.value as Kind })}>{Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                <input aria-label="Registro" required maxLength={2000} className={`${input} min-w-64 flex-1`} placeholder="Descreva o registro" value={item.text} onChange={(e) => setItem({ ...item, text: e.target.value })} />
                <input aria-label="Responsável (opcional)" maxLength={120} className={`${input} w-44`} placeholder="Responsável (se informado)" value={item.responsible} onChange={(e) => setItem({ ...item, responsible: e.target.value })} />
                <input aria-label="Prazo (opcional)" type="date" className={input} value={item.dueDate} onChange={(e) => setItem({ ...item, dueDate: e.target.value })} />
                <button disabled={busy} className="h-10 rounded-lg bg-q-ink px-4 text-sm font-semibold text-white">Registrar</button>
              </form>
              <MeetingRecorder m={m} onChange={() => q.refetch()} />
            </div>
          )}

          {!terminal && (
            <form className="flex gap-2" onSubmit={async (e) => (e.preventDefault(), cmd.trim() && (await act("command", { text: cmd })) && setCmd(""))}>
              <input aria-label="Comando ou pergunta" maxLength={4000} className={`${input} flex-1`} placeholder="Comando ou pergunta (ex.: “departamento finalizado”, “decisão: …”, “Quais entregas atrasaram?”)" value={cmd} onChange={(e) => setCmd(e.target.value)} />
              <button disabled={busy} className="flex h-10 items-center gap-2 rounded-lg bg-q-orange px-4 text-sm font-semibold text-white"><Send size={15} /> Enviar</button>
            </form>
          )}
          <div className="flex flex-wrap gap-2">
            {m.allowedEvents.filter((e) => EVENT_BUTTON[e]).map((e) => (
              <button key={e} disabled={busy} onClick={() => (e !== "CANCEL" || confirm("Cancelar a reunião?")) && act("events", { event: e })} className={`h-9 rounded-lg px-3 text-xs font-semibold ${e === "COMPLETE_MEETING" ? "bg-q-ink text-white" : "border border-q-line hover:border-q-mid"}`}>{EVENT_BUTTON[e]}</button>
            ))}
          </div>
          {busy && <p className="text-xs text-q-mid">Processando…</p>}
          {err && <p role="alert" className="rounded-lg border-l-4 border-q-orange bg-q-bg px-3 py-2 text-sm">{err}</p>}
        </div>
      </Panel>

      {m.state === "MEETING_COMPLETED" && m.report && (
        <Panel title="Relatório da reunião" subtitle={m.report.ai.status === "done" ? "Com consolidação da RINNE (n8n)." : "Análise inteligente indisponível: o relatório contém os registros e os indicadores calculados pelo sistema."}>
          <div className="space-y-3 border-t border-q-line px-6 py-5">
            {m.report.ai.status === "done" && m.report.ai.text && <p className="whitespace-pre-wrap text-sm">{m.report.ai.text}</p>}
            <p className="text-sm">Departamentos: {m.departments.length} · Decisões: {m.report.totals.decision} · Encaminhamentos: {m.report.totals.action} · Problemas: {m.report.totals.problem} · Oportunidades: {m.report.totals.opportunity}</p>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => downloadFrom(`/rinne/meetings/${m.id}/report`, { format: "md" }, "reuniao.md")} className="flex h-9 items-center gap-2 rounded-lg border border-q-line px-3 text-xs font-semibold"><Download size={14} /> Markdown</button>
              <Link to={`/reuniao/${m.id}/imprimir`} target="_blank" className="flex h-9 items-center gap-2 rounded-lg border border-q-line px-3 text-xs font-semibold"><FileText size={14} /> PDF (imprimir)</Link>
            </div>
          </div>
        </Panel>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Panel title="Departamentos analisados">
          <ol className="space-y-3 border-t border-q-line p-4">
            {m.departments.map((d) => (
              <li key={d.id} className="rounded-lg border border-q-line p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold">{d.seq}. {d.department}</span>
                  <span className="text-[11px] text-q-mid">{d.period ? `${d.period.label} (${fmtDate(d.period.start)}–${fmtDate(d.period.end)})` : "período não definido"} · {d.status === "completed" ? "finalizado" : "em andamento"}</span>
                </div>
                <ul className="mt-2 space-y-1 text-sm">
                  {d.items.map((i) => <li key={i.id}><span className="mr-1 rounded bg-q-bg px-1.5 py-0.5 text-[10px] font-bold uppercase">{KIND[i.kind]}</span>{i.text}{i.responsible && <span className="text-q-mid"> — resp.: {i.responsible}</span>}{i.dueDate && <span className="text-q-mid"> — prazo: {fmtDate(i.dueDate)}</span>}</li>)}
                  {!d.items.length && <li className="text-xs text-q-mid">Nenhum registro.</li>}
                </ul>
                {d.summary && <p className="mt-2 text-xs text-q-mid">Consolidação da RINNE: {d.summary.ai.status === "done" ? d.summary.ai.text : d.summary.ai.status === "pending" ? "processando…" : "indisponível (n8n)"}</p>}
              </li>
            ))}
            {!m.departments.length && <li className="text-sm text-q-mid">Nenhum departamento ainda.</li>}
          </ol>
        </Panel>
        <Panel title="Perguntas à RINNE nesta reunião">
          <div className="max-h-[480px] space-y-3 overflow-y-auto border-t border-q-line p-4">
            {msgs.data?.map((x) => <MessageView key={x.id} m={x} />)}
            {msgs.data && !msgs.data.length && <p className="text-sm text-q-mid">Durante a análise, digite uma pergunta na barra de comandos.</p>}
          </div>
        </Panel>
      </div>
    </div>
  );
}

export function MeetingPage() {
  const can = useCan();
  const qc = useQueryClient();
  const status = useRinneStatus();
  const list = useQuery({ queryKey: ["meetings"], queryFn: () => api<MeetingRow[]>("/rinne/meetings"), enabled: can("reuniao.use") });
  const [active, setActive] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [err, setErr] = useState<string | null>(null);
  if (!can("reuniao.use")) return <NoAccess title="Modo reunião" />;

  async function start(e: FormEvent) {
    e.preventDefault();
    try {
      const v = await send<MeetingView>("POST", "/rinne/meetings", { title: title || undefined });
      qc.setQueryData(["meeting", v!.id], v);
      setActive(v!.id);
      setTitle("");
      list.refetch();
    } catch (x) {
      setErr((x as Error).message);
    }
  }

  return (
    <div className="mx-auto max-w-[1480px] space-y-6">
      <PageHeader icon={Presentation} title="Modo reunião" subtitle="“RINNE, iniciar modo reunião.” Análise departamental com estados controlados pelo sistema, registros persistidos e relatório ao final." />
      <UnavailableBanner status={status.data} />
      {active ? (
        <ActiveMeeting id={active} onClose={() => (setActive(null), list.refetch())} />
      ) : (
        <>
          <form onSubmit={start} className="flex flex-wrap gap-2 rounded-xl border border-q-line bg-white p-4">
            <input aria-label="Título da reunião" maxLength={120} className={`${input} min-w-72 flex-1`} placeholder="Título da reunião (opcional)" value={title} onChange={(e) => setTitle(e.target.value)} />
            <button className="flex h-10 items-center gap-2 rounded-lg bg-q-orange px-5 text-sm font-semibold text-white"><Presentation size={16} /> Iniciar modo reunião</button>
          </form>
          {err && <p role="alert" className="text-sm text-q-orange">{err}</p>}
          <Panel title="Minhas reuniões" subtitle="Reuniões em andamento podem ser retomadas; o progresso é salvo a cada registro.">
            <table className="w-full border-t border-q-line text-sm">
              <thead><tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-q-graphite"><th className="px-6 py-3">Reunião</th><th className="px-6 py-3">Situação</th><th className="px-6 py-3">Início</th><th className="px-6 py-3 text-right">Departamentos</th><th /></tr></thead>
              <tbody>
                {list.data?.map((r) => (
                  <tr key={r.id} className="border-t border-q-line/70">
                    <td className="px-6 py-3 font-semibold">{r.title}</td>
                    <td className="px-6 py-3 text-xs">{STATE_LABEL[r.state]}</td>
                    <td className="px-6 py-3 text-xs">{fmt(r.started_at, "datetime")}</td>
                    <td className="num px-6 py-3 text-right">{r.departments}</td>
                    <td className="space-x-3 pr-6 text-right">
                      <button onClick={() => setActive(r.id)} className="text-xs font-semibold text-q-orange hover:underline">{["MEETING_COMPLETED", "CANCELLED"].includes(r.state) ? "Abrir" : "Retomar"}</button>
                      {["MEETING_COMPLETED", "CANCELLED"].includes(r.state) && <button aria-label={`Excluir ${r.title}`} onClick={async () => confirm("Excluir esta reunião e seus registros?") && (await send("DELETE", `/rinne/meetings/${r.id}`), list.refetch())} className="text-q-mid hover:text-q-orange"><Trash2 size={14} className="inline" /></button>}
                    </td>
                  </tr>
                ))}
                {list.data && !list.data.length && <tr><td colSpan={5} className="px-6 py-6 text-center text-q-mid">Nenhuma reunião ainda.</td></tr>}
              </tbody>
            </table>
          </Panel>
        </>
      )}
    </div>
  );
}

