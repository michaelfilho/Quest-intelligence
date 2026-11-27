import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Eye, EyeOff, LockKeyhole, KeyRound, LogOut, MonitorSmartphone, UserRound } from "lucide-react";
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
              <span className="rounded border border-q-orange/60 px-1.5 py-0.5 text-[10px] font-bold text-q-orange">INTELLIGENCE</span>
            </div>
            <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-white/60">Controladoria e rentabilidade</div>
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
  const [showPassword, setShowPassword] = useState(false);
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
    <main className="core-login">
      <svg className="core-login-art" viewBox="0 0 1672 941" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="login-outer" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#ff8700" /><stop offset=".45" stopColor="#9c3100" /><stop offset="1" stopColor="#301000" /></linearGradient>
          <linearGradient id="login-inner" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#ffba00" /><stop offset=".5" stopColor="#ff7400" /><stop offset="1" stopColor="#e24700" /></linearGradient>
        </defs>
        <path d="M1259 0 Q1420 212 1672 310 V0Z" fill="url(#login-outer)" stroke="#ed6b0d" strokeWidth="3" />
        <path d="M1411 0 Q1513 157 1672 240 V0Z" fill="url(#login-inner)" stroke="#ff9d26" strokeWidth="2" />
        <path d="M0 603 Q211 720 344 941 H0Z" fill="url(#login-outer)" stroke="#ed6b0d" strokeWidth="3" />
        <path d="M0 737 Q126 817 210 941 H0Z" fill="url(#login-inner)" stroke="#ff9d26" strokeWidth="2" />
      </svg>
      <div className="core-login-content">
        <div className="core-login-brand" aria-label="Quest Core">
          <span className="core-login-symbol" aria-hidden="true"><i /><i /><i /></span>
          <span className="core-login-brand-divider" aria-hidden="true" />
          <span>QUEST <strong>CORE</strong></span>
        </div>
        <section className="core-login-card" aria-labelledby="login-title">
          <div className="core-login-lock" aria-hidden="true"><LockKeyhole /></div>
          <h1 id="login-title">Acesso <span>Restrito</span></h1>
          <p className="core-login-subtitle">Informe suas credenciais para acessar o ambiente.</p>
          <form onSubmit={submit} className="core-login-form" aria-busy={busy}>
            <label className="core-login-field">
              <span className="sr-only">Usuário</span><UserRound aria-hidden="true" />
              <input placeholder="Usuário" autoComplete="username" autoCapitalize="none" spellCheck={false} autoFocus required maxLength={64} value={username} onChange={(e) => setUsername(e.target.value)} />
            </label>
            <label className="core-login-field">
              <span className="sr-only">Senha</span><LockKeyhole aria-hidden="true" />
              <input placeholder="Senha" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required maxLength={256} value={password} onChange={(e) => setPassword(e.target.value)} />
              <button className="core-login-eye" type="button" aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}</button>
            </label>
            {error && <p role="alert" className="core-login-error">{error}</p>}
            <button disabled={busy} className="core-login-submit" type="submit">{busy ? "Entrando…" : "Entrar"}<ArrowRight aria-hidden="true" /></button>
          </form>
        </section>
      </div>
    </main>
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
        // Nenhum dado da sessão anterior fica em memória — exceto a consulta "me", que precisa existir para
        // ser refeita: ela devolve 401 e o Gate volta para a tela de login.
        qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" });
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
