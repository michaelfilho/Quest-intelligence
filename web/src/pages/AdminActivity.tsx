import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Bot, History, Mic, Save, Shield, SlidersHorizontal } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Panel } from "../components/ui";
import { api, fmt, send, useCan } from "../lib";
import { Notice } from "./AdminUsers";
import { SessionsTable } from "./AuthPages";

const input = "h-10 rounded-lg border border-q-line bg-white px-3 text-sm focus:border-q-orange focus:outline-none";

export function AllSessionsSection() {
  const q = useQuery({ queryKey: ["admin-sessions"], queryFn: () => api<Parameters<typeof SessionsTable>[0]["rows"]>("/admin/sessions") });
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <Panel title="Sessões ativas" subtitle="Todas as sessões válidas. Encerrar uma sessão desconecta o usuário imediatamente.">
      {msg && <div className="px-6 pb-3"><Notice kind="ok" onClose={() => setMsg(null)}>{msg}</Notice></div>}
      <SessionsTable showUser rows={q.data ?? []} onRevoke={async (id) => (await send("DELETE", `/admin/sessions/${id}`), setMsg("Sessão encerrada."), q.refetch())} />
    </Panel>
  );
}

const EVENT_LABEL: Record<string, string> = {
  "auth.login": "Login",
  "auth.logout": "Logout",
  "auth.password_change": "Troca de senha",
  "user.create": "Usuário criado",
  "user.update": "Usuário alterado",
  "user.permissions_update": "Permissões do usuário",
  "user.password_reset": "Senha redefinida",
  "role.create": "Perfil criado",
  "role.permissions_update": "Permissões do perfil",
  "role.delete": "Perfil excluído",
  "session.revoke": "Sessão encerrada",
  "session.revoke_all": "Sessões encerradas",
  "ip_allowlist.update": "Lista de IPs",
  "access.blocked": "Acesso bloqueado (IP)",
  "access.denied": "Acesso negado (permissão)",
  "settings.update": "Configurações",
};
const OUTCOME: Record<string, string> = { success: "Sucesso", failure: "Falha", denied: "Negado" };

interface AuditRow {
  id: number;
  at: string;
  event: string;
  outcome: string;
  actor: string | null;
  ip: string | null;
  target: string | null;
  details: Record<string, unknown>;
}

export function AuditSection() {
  const [page, setPage] = useState(1);
  const [event, setEvent] = useState("");
  const [outcome, setOutcome] = useState("");
  const q = useQuery({
    queryKey: ["audit", page, event, outcome],
    queryFn: () => api<{ total: number; page: number; pageSize: number; rows: AuditRow[] }>("/admin/audit", { page, pageSize: 50, event: event || undefined, outcome: outcome || undefined }),
    placeholderData: keepPreviousData,
  });
  const pages = q.data ? Math.max(1, Math.ceil(q.data.total / q.data.pageSize)) : 1;
  return (
    <Panel title="Histórico de acessos e auditoria" subtitle={<><History size={13} className="text-q-orange" /> Senhas, tokens e credenciais nunca são registrados.</>}>
      <div className="flex flex-wrap gap-3 border-t border-q-line px-6 py-4">
        <select className={input} value={event} onChange={(e) => (setEvent(e.target.value), setPage(1))} aria-label="Evento">
          <option value="">Todos os eventos</option>
          {Object.entries(EVENT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className={input} value={outcome} onChange={(e) => (setOutcome(e.target.value), setPage(1))} aria-label="Resultado">
          <option value="">Todos os resultados</option>
          {Object.entries(OUTCOME).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {q.data && <span className="num self-center text-xs text-q-mid">{fmt(q.data.total, "count")} eventos</span>}
      </div>
      <div className="overflow-x-auto border-t border-q-line">
        <table className="w-full min-w-max text-sm">
          <thead>
            <tr className="border-b border-q-line text-left text-[11px] font-semibold uppercase tracking-wide text-q-graphite">
              <th className="px-6 py-3">Data/hora</th><th className="px-6 py-3">Evento</th><th className="px-6 py-3">Resultado</th><th className="px-6 py-3">Quem</th><th className="px-6 py-3">IP</th><th className="px-6 py-3">Alvo</th><th className="px-6 py-3">Detalhes</th>
            </tr>
          </thead>
          <tbody>
            {q.data?.rows.map((r) => (
              <tr key={r.id} className="border-b border-q-line/70 align-top last:border-0">
                <td className="whitespace-nowrap px-6 py-2.5 text-xs">{fmt(r.at, "datetime")}</td>
                <td className="px-6 py-2.5 font-medium">{EVENT_LABEL[r.event] ?? r.event}</td>
                <td className="px-6 py-2.5"><span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${r.outcome === "success" ? "bg-q-bg" : "bg-q-orange text-white"}`}>{OUTCOME[r.outcome] ?? r.outcome}</span></td>
                <td className="px-6 py-2.5 text-xs">{r.actor ?? "—"}</td>
                <td className="px-6 py-2.5 font-mono text-xs">{r.ip ?? "—"}</td>
                <td className="px-6 py-2.5 text-xs">{r.target ?? "—"}</td>
                <td className="max-w-md px-6 py-2.5 font-mono text-[11px] text-q-mid">{Object.keys(r.details).length ? JSON.stringify(r.details) : "—"}</td>
              </tr>
            ))}
            {q.data && !q.data.rows.length && <tr><td colSpan={7} className="px-6 py-6 text-center text-q-mid">Nenhum evento.</td></tr>}
          </tbody>
        </table>
      </div>
      {q.data && q.data.total > q.data.pageSize && (
        <div className="flex items-center justify-end gap-3 border-t border-q-line px-6 py-3 text-xs text-q-mid">
          <span className="num">Página {page} de {pages}</span>
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded-lg border border-q-line px-3 py-1.5 disabled:opacity-40">Anterior</button>
          <button disabled={page >= pages} onClick={() => setPage(page + 1)} className="rounded-lg border border-q-line px-3 py-1.5 disabled:opacity-40">Próxima</button>
        </div>
      )}
    </Panel>
  );
}

// ---------------- Configurações persistentes (app.db) ----------------
type Settings = Record<string, string | number | boolean>;
export interface SettingsResponse {
  settings: Settings;
  environment: { database: string; schemas: Record<string, string>; n8n: { enabled: boolean; problem: string | null }; trustProxy: string; requireProxy: boolean; cookieSecure: boolean; node: string; dataDir: string };
}
export const useSettings = () => useQuery({ queryKey: ["admin-settings"], queryFn: () => api<SettingsResponse>("/admin/settings") });

type Field = { key: string; label: string; help?: string } & ({ type: "number"; min: number; max: number } | { type: "text"; max: number } | { type: "bool" } | { type: "select"; options: string[] });

function SettingsForm({ title, icon, subtitle, fields, children }: { title: string; icon: ReactNode; subtitle: string; fields: Field[]; children?: ReactNode }) {
  const can = useCan();
  const q = useSettings();
  const [draft, setDraft] = useState<Settings>({});
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  useEffect(() => {
    if (q.data) setDraft(Object.fromEntries(fields.map((f) => [f.key, q.data.settings[f.key]])));
  }, [q.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const editable = can("config.manage");
  const changed = Object.fromEntries(Object.entries(draft).filter(([k, v]) => q.data && q.data.settings[k] !== v));

  return (
    <Panel title={title} subtitle={<>{icon} {subtitle}</>}>
      <div className="space-y-4 border-t border-q-line px-6 py-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {fields.map((f) => (
            <label key={f.key} className="flex flex-col gap-1.5 text-sm">
              <span className="font-semibold">{f.label}</span>
              {f.type === "bool" ? (
                <span className="flex h-10 items-center gap-2"><input type="checkbox" className="h-5 w-5 accent-q-orange" disabled={!editable} checked={!!draft[f.key]} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.checked })} /> {draft[f.key] ? "Ativado" : "Desativado"}</span>
              ) : f.type === "select" ? (
                <select className={input} disabled={!editable} value={String(draft[f.key] ?? "")} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}>{f.options.map((o) => <option key={o}>{o}</option>)}</select>
              ) : (
                <input className={input} disabled={!editable} type={f.type === "number" ? "number" : "text"} min={f.type === "number" ? f.min : undefined} max={f.type === "number" ? f.max : undefined} maxLength={f.type === "text" ? f.max : undefined} value={String(draft[f.key] ?? "")} onChange={(e) => setDraft({ ...draft, [f.key]: f.type === "number" ? Number(e.target.value) : e.target.value })} />
              )}
              {f.help && <span className="text-xs text-q-mid">{f.help}</span>}
            </label>
          ))}
        </div>
        {children}
        {msg && <Notice kind={msg.kind} onClose={() => setMsg(null)}>{msg.text}</Notice>}
        {editable ? (
          <button disabled={!Object.keys(changed).length} onClick={async () => {
            try {
              await send("PUT", "/admin/settings", changed);
              setMsg({ kind: "ok", text: "Configurações salvas (persistidas no banco da aplicação)." });
              q.refetch();
            } catch (e) {
              setMsg({ kind: "err", text: (e as Error).message });
            }
          }} className="flex h-10 items-center gap-2 rounded-lg bg-q-orange px-5 text-sm font-semibold text-white disabled:opacity-50"><Save size={15} /> Salvar</button>
        ) : (
          <p className="text-xs text-q-mid">Somente leitura para o seu perfil (requer "Alterar configurações gerais, segurança e IA").</p>
        )}
      </div>
    </Panel>
  );
}

export function SecuritySection() {
  const env = useSettings().data?.environment;
  return (
    <SettingsForm title="Segurança" icon={<Shield size={13} className="text-q-orange" />} subtitle="Sessões, senhas e bloqueio por tentativas." fields={[
      { key: "security.session_idle_minutes", label: "Encerrar sessão após inatividade (min)", type: "number", min: 5, max: 480 },
      { key: "security.session_max_hours", label: "Duração máxima da sessão (h)", type: "number", min: 1, max: 72, help: "Vale para novas sessões." },
      { key: "security.login_max_attempts", label: "Tentativas de login antes do bloqueio", type: "number", min: 3, max: 20 },
      { key: "security.lockout_minutes", label: "Tempo de bloqueio (min)", type: "number", min: 1, max: 1440 },
      { key: "security.password_min_length", label: "Tamanho mínimo de senha", type: "number", min: 10, max: 64 },
    ]}>
      {env && (
        <dl className="grid grid-cols-1 gap-2 rounded-lg bg-q-bg p-4 text-xs md:grid-cols-2">
          {[["Hash de senhas", "Argon2id (19 MiB, t=2, p=1)"], ["Cookie de sessão", `HttpOnly · SameSite=Strict${env.cookieSecure ? " · Secure" : " · sem Secure (somente dev local)"}`], ["Proxies confiáveis (TRUST_PROXY)", env.trustProxy], ["Exige proxy (REQUIRE_PROXY)", env.requireProxy ? "Sim" : "Não (dev)"], ["Proteção CSRF", "SameSite=Strict + header próprio + Origin"], ["Runtime", `Node ${env.node}`]].map(([k, v]) => (
            <div key={k}><dt className="text-q-mid">{k}</dt><dd className="font-mono font-semibold">{v}</dd></div>
          ))}
        </dl>
      )}
    </SettingsForm>
  );
}

interface N8nInfo {
  status: { enabled: boolean; configured: boolean; problem: string | null; transport: string | null; timeoutMs: number; maxConcurrency: number; avgLatencyMs: number | null; inFlight: number; lastSuccess: { request_id: string; operation: string; created_at: string; latency_ms: number } | null; lastFailure: { request_id: string; operation: string; status: string; created_at: string; error: string } | null };
  history: { request_id: string; correlation_id: string; session_id: string | null; mode: string; operation: string; status: string; http_status: number | null; latency_ms: number | null; error: string | null; created_at: string }[];
}

/** Inteligência RINNE: toda IA (modelos, prompts, tokens, custos) é configurada no n8n — aqui só status e rastreio. */
export function RinneIntelligenceSection() {
  const can = useCan();
  const q = useQuery({ queryKey: ["n8n-status"], queryFn: () => api<N8nInfo>("/admin/integrations/n8n") });
  const [test, setTest] = useState<{ status: string; requestId: string; latencyMs: number | null; error: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const s = q.data?.status;
  const rows: [string, string][] = s
    ? [
        ["Integração", s.enabled ? "Disponível" : "Indisponível"],
        ["Configuração", s.configured ? "URL e segredo definidos no backend" : "Não configurada (variáveis RINNE_N8N_*)"],
        ["Transporte", s.transport ?? "—"],
        ["Última comunicação bem-sucedida", s.lastSuccess ? `${fmt(s.lastSuccess.created_at, "datetime")} · ${s.lastSuccess.operation} · ${s.lastSuccess.latency_ms} ms` : "Nenhuma"],
        ["Última falha", s.lastFailure ? `${fmt(s.lastFailure.created_at, "datetime")} · ${s.lastFailure.status}: ${s.lastFailure.error}` : "Nenhuma"],
        ["Tempo médio de resposta", s.avgLatencyMs == null ? "—" : `${s.avgLatencyMs} ms (últimas 20)`],
        ["Timeout", `${s.timeoutMs / 1000} s`],
        ["Concorrência máxima", String(s.maxConcurrency)],
        ["Em andamento", String(s.inFlight)],
      ]
    : [];
  return (
    <Panel title="Inteligência RINNE (n8n)" subtitle={<><Bot size={13} className="text-q-orange" /> Modelos, prompts, memória, tokens, custos e fallback ficam exclusivamente nos workflows do n8n.</>}>
      <div className="space-y-4 border-t border-q-line px-6 py-5">
        {rows.length > 0 && (
          <dl className="grid grid-cols-1 gap-3 text-sm md:grid-cols-3">
            {rows.map(([k, v]) => <div key={k} className="rounded-lg bg-q-bg px-3 py-2"><dt className="text-[11px] text-q-mid">{k}</dt><dd className="font-semibold">{v}</dd></div>)}
          </dl>
        )}
        {s?.problem && <Notice kind="err">{s.problem}</Notice>}
        {can("config.manage") && (
          <div className="flex flex-wrap items-center gap-3">
            <button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  setTest((await send<NonNullable<typeof test>>("POST", "/admin/integrations/n8n/test"))!);
                  q.refetch();
                } finally {
                  setBusy(false);
                }
              }}
              className="flex h-10 items-center gap-2 rounded-lg bg-q-ink px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              Testar conectividade
            </button>
            <span className="text-xs text-q-mid">Envia a operação PING, que o workflow responde sem acionar modelos (sem custo).</span>
            {test && (
              <span className={`rounded px-2 py-1 text-xs font-bold text-white ${test.status === "success" ? "bg-q-ink" : "bg-q-orange"}`}>
                {test.status}
                {test.latencyMs != null ? ` · ${test.latencyMs} ms` : ""}
                {test.error ? ` · ${test.error}` : ""} · #{test.requestId.slice(0, 8)}
              </span>
            )}
          </div>
        )}
        <div className="overflow-x-auto rounded-xl border border-q-line">
          <table className="w-full min-w-max text-xs">
            <thead>
              <tr className="border-b border-q-line text-left font-semibold uppercase tracking-wide text-q-graphite">
                <th className="px-3 py-2">Data</th><th className="px-3 py-2">Modo</th><th className="px-3 py-2">Operação</th><th className="px-3 py-2">Situação</th><th className="px-3 py-2 text-right">Latência</th><th className="px-3 py-2">requestId</th><th className="px-3 py-2">correlationId</th><th className="px-3 py-2">Erro</th>
              </tr>
            </thead>
            <tbody>
              {q.data?.history.map((h) => (
                <tr key={h.request_id} className="border-b border-q-line/60">
                  <td className="whitespace-nowrap px-3 py-1.5">{fmt(h.created_at, "datetime")}</td>
                  <td className="px-3 py-1.5">{h.mode}</td>
                  <td className="px-3 py-1.5">{h.operation}</td>
                  <td className="px-3 py-1.5"><span className={`rounded px-1.5 py-0.5 font-bold uppercase ${h.status === "success" ? "bg-q-bg" : "bg-q-orange text-white"}`}>{h.status}</span></td>
                  <td className="num px-3 py-1.5 text-right">{h.latency_ms == null ? "—" : `${h.latency_ms} ms`}</td>
                  <td className="px-3 py-1.5 font-mono">{h.request_id.slice(0, 8)}</td>
                  <td className="px-3 py-1.5 font-mono">{h.correlation_id.slice(0, 8)}</td>
                  <td className="max-w-xs truncate px-3 py-1.5" title={h.error ?? ""}>{h.error ?? "—"}</td>
                </tr>
              ))}
              {q.data && !q.data.history.length && <tr><td colSpan={8} className="px-3 py-4 text-center text-q-mid">Nenhuma solicitação registrada.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-q-mid">A URL privada e o segredo do webhook nunca são exibidos. Não há campos para chaves de provedores, modelos, prompts, temperatura ou orçamento de tokens — isso pertence ao n8n.</p>
      </div>
    </Panel>
  );
}

export function VoiceSection() {
  return (
    <SettingsForm
      title="Voz"
      icon={<Mic size={13} className="text-q-orange" />}
      subtitle="RINNE Voz e Modo reunião."
      fields={[{ key: "rinne.browser_tts", label: "Permitir voz nativa do navegador como alternativa", type: "bool", help: "Usada só quando o n8n não devolver áudio. Depende do sistema/navegador (pode não ser offline). Preferência: voz masculina pt-BR, grave e firme." }]}
    >
      <p className="text-xs text-q-mid">Reconhecimento e síntese inteligentes de voz são configurados nos workflows do n8n. O áudio é enviado em segmentos de até 30 s / 2 MB, somente com consentimento, e não é armazenado.</p>
    </SettingsForm>
  );
}

export function RetentionSection() {
  return (
    <SettingsForm
      title="Retenção"
      icon={<History size={13} className="text-q-orange" />}
      subtitle="Prazo de guarda dos dados internos da aplicação (aplicado na inicialização)."
      fields={[
        { key: "rinne.history_retention_days", label: "Conversas da RINNE (dias)", type: "number", min: 7, max: 3650 },
        { key: "meetings.retention_days", label: "Reuniões e seus registros (dias)", type: "number", min: 7, max: 3650 },
      ]}
    />
  );
}

export function GeneralSection() {
  return (
    <SettingsForm title="Configurações gerais" icon={<SlidersHorizontal size={13} className="text-q-orange" />} subtitle="Preferências da aplicação." fields={[
      { key: "general.organization", label: "Organização", type: "text", max: 120 },
      { key: "general.default_period", label: "Período padrão", type: "select", options: ["Mês atual", "Mês anterior", "Ano atual", "Ano anterior", "Últimos 12 meses"] },
    ]} />
  );
}
