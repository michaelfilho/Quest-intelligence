import { useQuery } from "@tanstack/react-query";
import { Copy, KeyRound, Plus, Save, ShieldCheck, Trash2, UserPlus, X } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { ALL_PERMISSIONS, PERMISSIONS, type Permission } from "../../../shared/permissions";
import { Panel } from "../components/ui";
import { api, fmt, send, useCan, useMe } from "../lib";

const input = "h-10 rounded-lg border border-q-line bg-white px-3 text-sm focus:border-q-orange focus:outline-none";
const label = "flex flex-col gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-q-mid";
const btn = "flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold disabled:opacity-50";

// Agrupamento das permissões na tela.
const GROUPS: { title: string; perms: Permission[] }[] = [
  { title: "Dados e módulos", perms: ALL_PERMISSIONS.filter((p) => p.endsWith(".view") && !["config.view", "auditoria.view"].includes(p)) },
  { title: "Relatórios", perms: ["relatorios.export"] },
  { title: "RINNE", perms: ["rinne_ia.use", "rinne_voz.use", "reuniao.use"] },
  { title: "Administração", perms: ["config.view", "config.manage", "usuarios.manage", "perfis.manage", "ip.manage", "sessoes.manage", "auditoria.view"] },
];

export function Notice({ kind, children, onClose }: { kind: "ok" | "err"; children: ReactNode; onClose?: () => void }) {
  return (
    <div role={kind === "err" ? "alert" : "status"} className={`flex items-start gap-3 rounded-lg px-4 py-3 text-sm ${kind === "err" ? "border-l-4 border-q-orange bg-q-bg" : "bg-q-ink text-white"}`}>
      <div className="flex-1">{children}</div>
      {onClose && <button aria-label="Fechar" onClick={onClose}><X size={15} /></button>}
    </div>
  );
}

/** Senha temporária: exibida uma única vez, para o administrador repassar com segurança. */
function TempPassword({ username, password, onClose }: { username: string; password: string; onClose: () => void }) {
  return (
    <div className="rounded-xl border-2 border-q-orange bg-white p-4">
      <div className="text-sm font-bold">Senha temporária de {username}</div>
      <div className="mt-2 flex items-center gap-2">
        <code className="rounded bg-q-bg px-3 py-2 font-mono text-base">{password}</code>
        <button className="rounded-lg border border-q-line p-2" aria-label="Copiar" onClick={() => navigator.clipboard?.writeText(password)}><Copy size={15} /></button>
      </div>
      <p className="mt-2 text-xs text-q-mid">Ela não será exibida novamente. Entregue por um canal seguro; a troca é obrigatória no primeiro acesso.</p>
      <button onClick={onClose} className="mt-2 text-xs font-semibold underline">Entendi, fechar</button>
    </div>
  );
}

interface UserRow {
  id: number;
  username: string;
  name: string;
  email: string | null;
  roleId: string | null;
  roleName: string | null;
  grants: Permission[];
  denies: Permission[];
  scopeDepartment: string | null;
  active: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  sessions: number;
}
interface RoleOpt {
  id: string;
  name: string;
}

export function UsersSection() {
  const can = useCan();
  const me = useMe().data;
  const users = useQuery({ queryKey: ["admin-users"], queryFn: () => api<UserRow[]>("/admin/users") });
  const roles = useQuery({ queryKey: ["role-options"], queryFn: () => api<RoleOpt[]>("/admin/roles/options") });
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [temp, setTemp] = useState<{ username: string; password: string } | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function act(fn: () => Promise<unknown>, ok: string) {
    setMsg(null);
    try {
      await fn();
      setMsg({ kind: "ok", text: ok });
      users.refetch();
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    }
  }

  return (
    <Panel
      title="Usuários"
      subtitle="Cada pessoa tem login próprio. Sem perfil = nenhum acesso (bloqueio por padrão)."
      actions={<button onClick={() => (setCreating(true), setEditing(null))} className={`${btn} bg-q-orange text-white`}><UserPlus size={16} /> Novo usuário</button>}
    >
      <div className="space-y-4 border-t border-q-line px-6 py-5">
        {msg && <Notice kind={msg.kind} onClose={() => setMsg(null)}>{msg.text}</Notice>}
        {temp && <TempPassword {...temp} onClose={() => setTemp(null)} />}
        {creating && (
          <UserForm
            roles={roles.data ?? []}
            onCancel={() => setCreating(false)}
            onSubmit={async (body) => {
              const r = await send<{ id: number; temporaryPassword: string }>("POST", "/admin/users", body);
              setCreating(false);
              setTemp({ username: String(body.username), password: r!.temporaryPassword });
              users.refetch();
            }}
          />
        )}
        {editing && (
          <UserForm
            user={editing}
            roles={roles.data ?? []}
            self={editing.id === me?.id}
            onCancel={() => setEditing(null)}
            onSubmit={async (body) => {
              await send("PATCH", `/admin/users/${editing.id}`, body);
              setEditing(null);
              setMsg({ kind: "ok", text: "Usuário atualizado. Permissões valem a partir da próxima requisição." });
              users.refetch();
            }}
            extra={
              <div className="flex flex-wrap gap-2">
                <button type="button" className={`${btn} border border-q-line`} onClick={async () => {
                  if (!confirm(`Gerar nova senha temporária para ${editing.username}? As sessões dele serão encerradas.`)) return;
                  try {
                    const r = await send<{ temporaryPassword: string }>("POST", `/admin/users/${editing.id}/reset-password`);
                    setTemp({ username: editing.username, password: r!.temporaryPassword });
                    users.refetch();
                  } catch (e) {
                    setMsg({ kind: "err", text: (e as Error).message });
                  }
                }}><KeyRound size={15} /> Redefinir senha</button>
                {can("sessoes.manage") && (
                  <button type="button" className={`${btn} border border-q-line`} onClick={() => act(() => send("DELETE", `/admin/users/${editing.id}/sessions`), `Sessões de ${editing.username} encerradas.`)}>Encerrar sessões</button>
                )}
              </div>
            }
          />
        )}
        <div className="overflow-x-auto rounded-xl border border-q-line">
          <table className="w-full min-w-max text-sm">
            <thead>
              <tr className="border-b border-q-line text-left text-[11px] font-semibold uppercase tracking-wide text-q-graphite">
                <th className="px-4 py-3">Usuário</th><th className="px-4 py-3">Perfil</th><th className="px-4 py-3">Ajustes individuais</th><th className="px-4 py-3">Escopo</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Último acesso</th><th className="px-4 py-3 text-right">Sessões</th><th />
              </tr>
            </thead>
            <tbody>
              {users.data?.map((u) => (
                <tr key={u.id} className="border-b border-q-line/70 last:border-0">
                  <td className="px-4 py-3"><div className="font-semibold">{u.name}</div><div className="text-xs text-q-mid">{u.username}{u.email ? ` · ${u.email}` : ""}</div></td>
                  <td className="px-4 py-3">{u.roleName ?? <span className="text-q-orange">Sem perfil (bloqueado)</span>}</td>
                  <td className="px-4 py-3 text-xs text-q-mid">{u.grants.length ? `+${u.grants.length} ` : ""}{u.denies.length ? `−${u.denies.length}` : ""}{!u.grants.length && !u.denies.length && "—"}</td>
                  <td className="px-4 py-3 text-xs">{u.scopeDepartment ?? "Toda a agência"}</td>
                  <td className="px-4 py-3"><span className={`rounded-md px-2 py-1 text-[10px] font-bold uppercase ${u.active ? "bg-q-bg" : "bg-q-ink text-white"}`}>{u.active ? (u.mustChangePassword ? "Troca de senha pendente" : "Ativo") : "Desativado"}</span></td>
                  <td className="px-4 py-3 text-xs">{u.lastLoginAt ? fmt(u.lastLoginAt, "datetime") : "Nunca"}</td>
                  <td className="num px-4 py-3 text-right">{u.sessions}</td>
                  <td className="pr-4 text-right"><button onClick={() => (setEditing(u), setCreating(false))} className="text-xs font-semibold text-q-orange hover:underline">Editar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Panel>
  );
}

function UserForm({ user, roles, self, onSubmit, onCancel, extra }: { user?: UserRow; roles: RoleOpt[]; self?: boolean; onSubmit: (body: Record<string, unknown>) => Promise<void>; onCancel: () => void; extra?: ReactNode }) {
  const [f, setF] = useState({ username: user?.username ?? "", name: user?.name ?? "", email: user?.email ?? "", roleId: user?.roleId ?? "", scopeDepartment: user?.scopeDepartment ?? "", active: user?.active ?? true });
  const [over, setOver] = useState<Record<string, "grant" | "deny">>(() => Object.fromEntries([...(user?.grants ?? []).map((p) => [p, "grant"]), ...(user?.denies ?? []).map((p) => [p, "deny"])]));
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await onSubmit({
        ...(user ? {} : { username: f.username }),
        name: f.name,
        email: f.email,
        roleId: f.roleId || null,
        scopeDepartment: f.scopeDepartment.trim() || null,
        active: f.active,
        grants: Object.keys(over).filter((p) => over[p] === "grant"),
        denies: Object.keys(over).filter((p) => over[p] === "deny"),
      });
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-q-line bg-q-bg/50 p-5">
      <div className="flex items-center justify-between">
        <h4 className="font-bold">{user ? `Editar ${user.username}` : "Novo usuário"}</h4>
        <button type="button" onClick={onCancel} aria-label="Cancelar"><X size={17} /></button>
      </div>
      <div className="flex flex-wrap gap-3">
        {!user && <label className={label}>Usuário (login)<input className={`${input} w-48 font-normal normal-case tracking-normal`} required minLength={3} maxLength={64} pattern="[a-zA-Z0-9._\-]+" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} /></label>}
        <label className={label}>Nome<input className={`${input} w-64 font-normal normal-case tracking-normal`} required maxLength={120} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <label className={label}>E-mail<input type="email" className={`${input} w-64 font-normal normal-case tracking-normal`} maxLength={160} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
        <label className={label}>Perfil
          <select className={`${input} w-56 font-normal normal-case tracking-normal`} value={f.roleId} onChange={(e) => setF({ ...f, roleId: e.target.value })}>
            <option value="">Sem perfil (nenhum acesso)</option>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </label>
        <label className={label}>Escopo de departamento<input className={`${input} w-56 font-normal normal-case tracking-normal`} placeholder="Vazio = toda a agência" maxLength={64} value={f.scopeDepartment} onChange={(e) => setF({ ...f, scopeDepartment: e.target.value })} /></label>
        {user && (
          <label className="flex h-10 items-center gap-2 self-end text-sm">
            <input type="checkbox" className="accent-q-orange" disabled={self} checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Ativo {self && <span className="text-xs text-q-mid">(você)</span>}
          </label>
        )}
      </div>

      <details className="rounded-lg border border-q-line bg-white">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">Ajustes individuais de permissão <span className="font-normal text-q-mid">(sobrepõem o perfil)</span></summary>
        <div className="grid grid-cols-1 gap-x-6 gap-y-1 border-t border-q-line px-4 py-3 md:grid-cols-2">
          {ALL_PERMISSIONS.map((p) => (
            <div key={p} className="flex items-center justify-between gap-3 py-1 text-xs">
              <span>{PERMISSIONS[p]}</span>
              <select aria-label={PERMISSIONS[p]} className="rounded border border-q-line px-1.5 py-1" value={over[p] ?? ""} onChange={(e) => setOver((o) => { const n = { ...o }; if (e.target.value) n[p] = e.target.value as "grant" | "deny"; else delete n[p]; return n; })}>
                <option value="">Do perfil</option>
                <option value="grant">Conceder</option>
                <option value="deny">Remover</option>
              </select>
            </div>
          ))}
        </div>
      </details>

      {err && <Notice kind="err">{err}</Notice>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button disabled={busy} className={`${btn} bg-q-ink text-white`}>{user ? <><Save size={15} /> Salvar</> : <><Plus size={15} /> Criar e gerar senha temporária</>}</button>
        {extra}
      </div>
    </form>
  );
}

interface RoleRow {
  id: string;
  name: string;
  description: string;
  permissions: Permission[];
  system: boolean;
  locked: boolean;
  users: number;
}

export function RolesSection() {
  const roles = useQuery({ queryKey: ["admin-roles"], queryFn: () => api<RoleRow[]>("/admin/roles") });
  const [draft, setDraft] = useState<Record<string, Set<Permission>>>({});
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [newName, setNewName] = useState("");
  const list = roles.data ?? [];
  const permsOf = (r: RoleRow) => draft[r.id] ?? new Set(r.permissions);
  const dirty = (r: RoleRow) => !!draft[r.id] && (draft[r.id].size !== r.permissions.length || r.permissions.some((p) => !draft[r.id].has(p)));

  function toggle(r: RoleRow, p: Permission) {
    const s = new Set(permsOf(r));
    s.has(p) ? s.delete(p) : s.add(p);
    setDraft({ ...draft, [r.id]: s });
  }
  async function run(fn: () => Promise<unknown>, ok: string, clear?: string) {
    setMsg(null);
    try {
      await fn();
      if (clear) setDraft(({ [clear]: _, ...rest }) => rest);
      setMsg({ kind: "ok", text: ok });
      roles.refetch();
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    }
  }

  return (
    <Panel title="Perfis e permissões" subtitle={<><ShieldCheck size={13} className="text-q-orange" /> Matriz aplicada no backend. Alterações valem imediatamente para todos os usuários do perfil.</>}>
      <div className="space-y-4 border-t border-q-line px-6 py-5">
        {msg && <Notice kind={msg.kind} onClose={() => setMsg(null)}>{msg.text}</Notice>}
        <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => (e.preventDefault(), run(() => send("POST", "/admin/roles", { name: newName, permissions: [] }), `Perfil "${newName}" criado sem permissões. Marque o que ele pode ver.`).then(() => setNewName("")))}>
          <label className={label}>Novo perfil<input className={`${input} w-64 font-normal normal-case tracking-normal`} required minLength={2} maxLength={60} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ex.: Comercial" /></label>
          <button className={`${btn} border border-q-line`}><Plus size={15} /> Criar perfil</button>
        </form>
        <div className="overflow-x-auto rounded-xl border border-q-line">
          <table className="w-full min-w-max text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-q-line">
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-q-graphite">Permissão</th>
                {list.map((r) => (
                  <th key={r.id} className="px-3 py-3 text-center align-bottom">
                    <div className="text-xs font-bold">{r.name}</div>
                    <div className="text-[10px] font-normal text-q-mid">{r.users} usuário(s)</div>
                    {!r.locked && dirty(r) && <button onClick={() => run(() => send("PUT", `/admin/roles/${r.id}`, { name: r.name, description: r.description, permissions: [...permsOf(r)] }), `Perfil ${r.name} atualizado.`, r.id)} className="mt-1 rounded bg-q-orange px-2 py-0.5 text-[10px] font-bold text-white">Salvar</button>}
                    {!r.system && <button aria-label={`Excluir ${r.name}`} onClick={() => confirm(`Excluir o perfil ${r.name}? Os usuários dele ficarão sem acesso.`) && run(() => send("DELETE", `/admin/roles/${r.id}`), `Perfil ${r.name} excluído.`)} className="mt-1 block w-full text-q-mid hover:text-q-orange"><Trash2 size={13} className="mx-auto" /></button>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {GROUPS.map((g) => [
                <tr key={g.title} className="bg-q-bg"><td colSpan={list.length + 1} className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wide text-q-mid">{g.title}</td></tr>,
                ...g.perms.map((p) => (
                  <tr key={p} className="border-b border-q-line/60">
                    <td className="px-4 py-2 text-xs">{PERMISSIONS[p]}</td>
                    {list.map((r) => (
                      <td key={r.id} className="px-3 py-2 text-center">
                        <input type="checkbox" aria-label={`${r.name}: ${PERMISSIONS[p]}`} className="h-4 w-4 accent-q-orange" disabled={r.locked} checked={permsOf(r).has(p)} onChange={() => toggle(r, p)} />
                      </td>
                    ))}
                  </tr>
                )),
              ])}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-q-mid">O perfil Administrador sempre tem todas as permissões. Perfis padrão podem ter as permissões ajustadas, mas não podem ser excluídos.</p>
      </div>
    </Panel>
  );
}
