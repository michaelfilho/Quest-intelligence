import { useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, LogIn, LogOut, MonitorSmartphone, UserRound } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { PageHeader, Panel } from "../components/ui";
import { api, fmt, send, useMe } from "../lib";

const input = "h-11 w-full rounded-lg border border-q-line bg-white px-3 text-sm focus:border-q-orange focus:outline-none";
const label = "flex flex-col gap-1.5 text-xs font-semibold text-q-graphite";

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center bg-q-ink px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-3 text-white">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-q-orange text-xl font-black shadow-[0_0_24px_rgba(245,130,32,0.45)]">Q</div>
          <div className="leading-tight">
            <div className="flex items-center gap-1.5">
              <span className="text-xl font-black">QUEST</span>
              <span className="rounded border border-q-orange/60 px-1.5 py-0.5 text-[10px] font-bold text-q-orange">RINNE</span>
            </div>
            <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-white/60">Inteligência de gestão</div>
          </div>
        </div>
        <div className="rounded-2xl bg-white p-7 shadow-2xl">{children}</div>
        <p className="mt-6 text-center text-[11px] text-white/40">Acesso restrito e auditado · Quest Comunicação</p>
      </div>
    </div>
  );
}

function Message({ kind, children }: { kind: "err" | "ok"; children: ReactNode }) {
  return <p role={kind === "err" ? "alert" : "status"} className={`rounded-lg px-3 py-2 text-sm ${kind === "err" ? "border-l-4 border-q-orange bg-q-bg" : "bg-q-ink text-white"}`}>{children}</p>;
}

export function LoginPage() {
  const qc = useQueryClient();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await send("POST", "/auth/login", { username, password });
      setPassword("");
      await qc.resetQueries();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <h1 className="text-lg font-bold">Entrar</h1>
      <p className="mb-5 mt-1 text-sm text-q-mid">Use seu usuário individual. Cada acesso é registrado.</p>
      <form onSubmit={submit} className="space-y-4">
        <label className={label}>
          Usuário
          <input className={input} autoComplete="username" autoFocus required maxLength={64} value={username} onChange={(e) => setUsername(e.target.value)} />
        </label>
        <label className={label}>
          Senha
          <input className={input} type="password" autoComplete="current-password" required maxLength={256} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <Message kind="err">{error}</Message>}
        <button disabled={busy} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-q-orange font-semibold text-white hover:brightness-95 disabled:opacity-60">
          <LogIn size={17} /> {busy ? "Entrando…" : "Entrar"}
        </button>
      </form>
      <p className="mt-5 text-xs leading-relaxed text-q-mid">Esqueceu a senha? Peça ao administrador uma senha temporária.</p>
    </Shell>
  );
}

export function ChangePasswordForm({ onDone }: { onDone?: () => void }) {
  const qc = useQueryClient();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (next !== confirm) return setMsg({ kind: "err", text: "A confirmação não confere com a nova senha." });
    setBusy(true);
    setMsg(null);
    try {
      await send("POST", "/auth/password", { current, next });
      setCurrent("");
      setNext("");
      setConfirm("");
      setMsg({ kind: "ok", text: "Senha alterada. Suas outras sessões foram encerradas." });
      await qc.invalidateQueries({ queryKey: ["me"] });
      onDone?.();
    } catch (err) {
      setMsg({ kind: "err", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className={label}>Senha atual<input className={input} type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} /></label>
      <label className={label}>Nova senha<input className={input} type="password" autoComplete="new-password" required minLength={10} maxLength={128} value={next} onChange={(e) => setNext(e.target.value)} /></label>
      <label className={label}>Confirmar nova senha<input className={input} type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} /></label>
      <p className="text-xs text-q-mid">Mínimo de 12 caracteres (padrão), sem conter seu usuário. Use uma frase longa e única.</p>
      {msg && <Message kind={msg.kind}>{msg.text}</Message>}
      <button disabled={busy} className="flex h-11 items-center justify-center gap-2 rounded-lg bg-q-ink px-5 font-semibold text-white disabled:opacity-60">
        <KeyRound size={16} /> Alterar senha
      </button>
    </form>
  );
}

export function ForcedPasswordPage() {
  const me = useMe();
  return (
    <Shell>
      <h1 className="text-lg font-bold">Defina sua senha</h1>
      <p className="mb-5 mt-1 text-sm text-q-mid">Olá, {me.data?.name}. Por segurança, troque a senha temporária antes de continuar.</p>
      <ChangePasswordForm />
      <LogoutButton className="mt-4 text-xs text-q-mid underline" />
    </Shell>
  );
}

export function LogoutButton({ className = "" }: { className?: string }) {
  const qc = useQueryClient();
  return (
    <button
      className={className}
      onClick={async () => {
        await send("POST", "/auth/logout").catch(() => null);
        qc.clear(); // nenhum dado da sessão anterior fica em memória
        await qc.resetQueries({ queryKey: ["me"] });
      }}
    >
      <LogOut size={14} className="mr-1 inline" /> Sair
    </button>
  );
}

interface SessionRow {
  id: string;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  ip: string;
  user_agent: string;
  current: boolean;
}

export function SessionsTable({ rows, onRevoke, showUser }: { rows: (SessionRow & { username?: string; name?: string })[]; onRevoke: (id: string) => void; showUser?: boolean }) {
  return (
    <div className="overflow-x-auto border-t border-q-line">
      <table className="w-full min-w-max text-sm">
        <thead>
          <tr className="border-b border-q-line text-left text-[11px] font-semibold uppercase tracking-wide text-q-graphite">
            {showUser && <th className="px-6 py-3">Usuário</th>}
            <th className="px-6 py-3">Dispositivo</th>
            <th className="px-6 py-3">IP</th>
            <th className="px-6 py-3">Início</th>
            <th className="px-6 py-3">Última atividade</th>
            <th className="px-6 py-3">Expira</th>
            <th className="w-28" />
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id} className="border-b border-q-line/70 last:border-0">
              {showUser && <td className="px-6 py-3 font-semibold">{s.name} <span className="text-xs font-normal text-q-mid">({s.username})</span></td>}
              <td className="max-w-xs truncate px-6 py-3 text-xs text-q-mid" title={s.user_agent}>{s.user_agent || "—"}</td>
              <td className="px-6 py-3 font-mono text-xs">{s.ip || "—"}</td>
              <td className="px-6 py-3 text-xs">{fmt(s.created_at, "datetime")}</td>
              <td className="px-6 py-3 text-xs">{fmt(s.last_seen_at, "datetime")}</td>
              <td className="px-6 py-3 text-xs">{fmt(s.expires_at, "datetime")}</td>
              <td className="pr-4 text-right">
                {s.current ? <span className="rounded bg-q-orange px-2 py-0.5 text-[10px] font-bold text-white">ESTA SESSÃO</span> : <button onClick={() => onRevoke(s.id)} className="text-xs font-semibold text-q-orange hover:underline">Encerrar</button>}
              </td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={7} className="px-6 py-6 text-center text-sm text-q-mid">Nenhuma sessão ativa.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

export function AccountPage() {
  const me = useMe();
  const sessions = useQuery({ queryKey: ["my-sessions"], queryFn: () => api<SessionRow[]>("/auth/sessions") });
  const u = me.data;
  return (
    <div className="mx-auto max-w-[1100px] space-y-6">
      <PageHeader icon={UserRound} title="Minha conta" subtitle="Seus dados de acesso, senha e sessões ativas." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="Perfil">
          <dl className="divide-y divide-q-line border-t border-q-line px-6 text-sm">
            {[["Nome", u?.name], ["Usuário", u?.username], ["Perfil", u?.role ?? "Sem perfil (nenhum acesso)"], ["Escopo", u?.scopeDepartment ? `Departamento: ${u.scopeDepartment}` : "Toda a agência"], ["Permissões", `${u?.permissions.length ?? 0} liberadas`]].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 py-3"><dt className="text-q-mid">{k}</dt><dd className="text-right font-medium">{v}</dd></div>
            ))}
          </dl>
        </Panel>
        <Panel title="Alterar senha" subtitle="Ao trocar a senha, todas as suas outras sessões são encerradas.">
          <div className="border-t border-q-line px-6 py-5"><ChangePasswordForm onDone={() => sessions.refetch()} /></div>
        </Panel>
      </div>
      <Panel title="Sessões ativas" subtitle={<><MonitorSmartphone size={13} className="text-q-orange" /> Encerre qualquer sessão que você não reconheça.</>}>
        <SessionsTable rows={sessions.data ?? []} onRevoke={async (id) => (await send("DELETE", `/auth/sessions/${id}`), sessions.refetch())} />
      </Panel>
    </div>
  );
}
