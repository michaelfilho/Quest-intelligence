import { useQuery } from "@tanstack/react-query";
import { Lock, Plus, ShieldAlert, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Panel } from "../components/ui";
import { api, fmt, send } from "../lib";

interface Entry {
  cidr: string;
  label: string;
  addedAt?: string;
}
interface AccessState {
  enabled: boolean;
  entries: Entry[];
  bootstrap: string[];
  updatedAt: string | null;
  updatedBy: string | null;
  ip: string;
  requests: { ip: string; status: "pending" | "dismissed"; first_seen: string; last_seen: string; user_agent: string }[];
  locks: { ip: string; fails: number; locks: number; locked_until: number }[];
}

// Validação leve no navegador; a validação oficial (CIDR, /0 proibido) é do backend.
const looksLikeIp = (s: string) => /^[0-9a-fA-F:.]+(\/\d{1,3})?$/.test(s.trim()) && !/\/0$/.test(s.trim());

/** Allowlist de IPs: só os IPs/redes liberados acessam o site e a API quando o controle está ativo. */
export function AccessPanel() {
  const me = useQuery({ queryKey: ["access-me"], queryFn: () => api<{ enabled: boolean; ip: string }>("/access/me") });
  const list = useQuery({ queryKey: ["access-list"], queryFn: () => api<AccessState>("/access"), refetchInterval: 15_000 }); // exige ip.manage (sessão)
  const [saved, setSaved] = useState<AccessState | null>(null);
  useEffect(() => {
    if (list.data && !saved) (setSaved(list.data), setDraft({ enabled: list.data.enabled, entries: list.data.entries }));
  }, [list.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const [draft, setDraft] = useState<{ enabled: boolean; entries: Entry[] } | null>(null);
  const [newIp, setNewIp] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const dirty = !!saved && !!draft && JSON.stringify({ enabled: saved.enabled, entries: saved.entries }) !== JSON.stringify(draft);
  const myIp = saved?.ip ?? me.data?.ip ?? "";

  async function run(fn: () => Promise<AccessState>, ok?: string) {
    setBusy(true);
    setMsg(null);
    try {
      const s = await fn();
      setSaved(s);
      setDraft({ enabled: s.enabled, entries: s.entries });
      if (ok) setMsg({ kind: "ok", text: ok });
      me.refetch();
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const act = (ip: string, action: "allow" | "dismiss" | "unlock", ok: string) =>
    run(async () => {
      const s = (await send<AccessState>("POST", "/access/requests", { ip, action }))!;
      await list.refetch();
      return s;
    }, ok);
  const pending = list.data?.requests.filter((r) => r.status === "pending") ?? [];
  const dismissed = list.data?.requests.filter((r) => r.status === "dismissed") ?? [];
  const action = "text-xs font-semibold text-q-orange hover:underline disabled:opacity-50";

  function add(e: FormEvent) {
    e.preventDefault();
    if (!draft) return;
    const cidr = newIp.trim();
    if (!looksLikeIp(cidr)) return setMsg({ kind: "err", text: "Informe um IPv4/IPv6 ou rede CIDR válida (ex.: 200.10.20.30 ou 200.10.20.0/24). /0 não é permitido." });
    if (draft.entries.some((x) => [cidr, `${cidr}/32`, `${cidr}/128`].includes(x.cidr))) return setMsg({ kind: "err", text: "Esse IP já está na lista." });
    setDraft({ ...draft, entries: [...draft.entries, { cidr, label: newLabel.trim() }] });
    setNewIp("");
    setNewLabel("");
    setMsg(null);
  }

  const input = "h-10 rounded-lg border border-q-line bg-white px-3 text-sm focus:border-q-orange focus:outline-none";
  const status = me.data?.enabled;

  return (
    <Panel
      title="Controle de acesso por IP"
      subtitle={<><Lock size={13} className="text-q-orange" /> Somente os IPs liberados acessam o site e a API quando o controle está ativo</>}
      actions={
        me.data && (
          <span className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold ${status ? "bg-q-orange text-white" : "border border-q-line text-q-mid"}`}>
            {status ? <ShieldCheck size={13} /> : <ShieldAlert size={13} />} {status ? "Bloqueio ativo" : "Bloqueio desativado"}
          </span>
        )
      }
    >
      <div className="space-y-5 border-t border-q-line px-6 py-5">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <span>Seu IP atual: <strong className="num font-mono">{myIp || "—"}</strong></span>
          {saved?.updatedAt && <span className="text-xs text-q-mid">Última alteração: {fmt(saved.updatedAt, "datetime")} por {saved.updatedBy}</span>}
        </div>

        {!saved ? (
          list.isError ? <p className="text-sm text-q-mid">{(list.error as Error).message}</p> : <p className="text-sm text-q-mid">Carregando…</p>
        ) : (
          draft && (
            <>
              <label className="flex items-center gap-3 rounded-xl border border-q-line p-4">
                <input type="checkbox" className="h-5 w-5 accent-q-orange" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} />
                <span>
                  <span className="block text-sm font-bold">Ativar bloqueio por IP</span>
                  <span className="text-xs text-q-mid">Ativo: qualquer IP fora da lista recebe erro 404 e aparece em "Aguardando autorização". Desativado: o acesso depende apenas da senha do site.</span>
                </span>
              </label>

              <form onSubmit={add} className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-q-mid">
                  IP ou rede (CIDR)
                  <input className={`${input} w-56 font-mono font-normal normal-case tracking-normal`} placeholder="200.10.20.30 ou 200.10.20.0/24" value={newIp} onChange={(e) => setNewIp(e.target.value)} />
                </label>
                <label className="flex flex-col gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-q-mid">
                  Descrição
                  <input className={`${input} w-64 font-normal normal-case tracking-normal`} placeholder="Ex.: Escritório Quest" maxLength={80} value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
                </label>
                <button className="flex h-10 items-center gap-2 rounded-lg border border-q-line px-4 text-sm font-semibold hover:border-q-mid"><Plus size={15} /> Adicionar</button>
                {myIp && !draft.entries.some((e) => e.cidr.split("/")[0] === myIp) && (
                  <button type="button" onClick={() => setDraft({ ...draft, entries: [...draft.entries, { cidr: myIp, label: "Meu IP" }] })} className="h-10 text-xs font-semibold text-q-orange hover:underline">
                    + Adicionar meu IP ({myIp})
                  </button>
                )}
              </form>

              <div className="overflow-x-auto rounded-xl border border-q-line">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-q-line text-left text-[11px] font-semibold uppercase tracking-wide text-q-graphite">
                      <th className="px-4 py-2.5">IP / rede</th>
                      <th className="px-4 py-2.5">Descrição</th>
                      <th className="px-4 py-2.5">Adicionado em</th>
                      <th className="w-10" aria-label="Remover" />
                    </tr>
                  </thead>
                  <tbody>
                    {saved.bootstrap.map((c) => (
                      <tr key={"b" + c} className="border-b border-q-line/70 bg-q-bg/60">
                        <td className="px-4 py-2.5 font-mono">{c}</td>
                        <td className="px-4 py-2.5 text-q-mid">Acesso de emergência (variável IP_ALLOWLIST_BOOTSTRAP)</td>
                        <td className="px-4 py-2.5 text-xs text-q-mid">fixo</td>
                        <td />
                      </tr>
                    ))}
                    {draft.entries.map((e, i) => (
                      <tr key={e.cidr + i} className="border-b border-q-line/70 last:border-0">
                        <td className="px-4 py-2.5 font-mono">{e.cidr}{e.cidr.split("/")[0] === myIp && <span className="ml-2 rounded bg-q-orange px-1.5 py-0.5 font-sans text-[10px] font-bold text-white">VOCÊ</span>}</td>
                        <td className="px-4 py-2.5">{e.label || <span className="text-q-mid">—</span>}</td>
                        <td className="px-4 py-2.5 text-xs text-q-mid">{e.addedAt ? fmt(e.addedAt, "datetime") : "não salvo"}</td>
                        <td className="pr-3">
                          <button aria-label={`Remover ${e.cidr}`} onClick={() => setDraft({ ...draft, entries: draft.entries.filter((_, j) => j !== i) })} className="rounded p-1.5 text-q-mid hover:bg-q-bg hover:text-q-orange"><Trash2 size={15} /></button>
                        </td>
                      </tr>
                    ))}
                    {!draft.entries.length && !saved.bootstrap.length && (
                      <tr><td colSpan={4} className="px-4 py-6 text-center text-sm text-q-mid">Nenhum IP liberado. Com o bloqueio ativo, ninguém acessaria — por isso o sistema exige o seu IP na lista.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button disabled={busy || !dirty} onClick={() => run(async () => (await send<AccessState>("PUT", "/access", draft))!, "Lista de IPs salva e aplicada.")} className="h-10 rounded-lg bg-q-orange px-5 text-sm font-semibold text-white hover:brightness-95 disabled:opacity-50">
                  Salvar e aplicar
                </button>
                {dirty && <button onClick={() => setDraft({ enabled: saved.enabled, entries: saved.entries })} className="text-xs font-medium text-q-mid underline">Descartar alterações</button>}
                {dirty && <span className="text-xs font-semibold text-q-orange">Alterações não salvas</span>}
              </div>
            </>
          )
        )}

        {saved && (
          <div className="space-y-4">
            {([["Aguardando autorização", pending, "Nenhum IP novo tentou acessar."], ["Excluídos (continuam vendo 404)", dismissed, "Nenhum IP excluído."]] as const).map(([title, rows, empty]) => (
              <section key={title} className="rounded-xl border border-q-line p-4">
                <h3 className="text-sm font-bold">{title}</h3>
                {!rows.length && <p className="mt-1 text-xs text-q-mid">{empty}</p>}
                {rows.map((r) => (
                  <div key={r.ip} className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                    <strong className="font-mono">{r.ip}</strong>
                    <span className="text-xs text-q-mid">{fmt(r.last_seen, "datetime")}</span>
                    <span className="max-w-xs truncate text-xs text-q-mid" title={r.user_agent}>{r.user_agent}</span>
                    <button className={action} disabled={busy || dirty} onClick={() => act(r.ip, "allow", `${r.ip} autorizado.`)}>Autorizar</button>
                    {r.status === "pending" && <button className={action} disabled={busy || dirty} onClick={() => act(r.ip, "dismiss", `Notificação de ${r.ip} excluída.`)}>Excluir notificação</button>}
                  </div>
                ))}
              </section>
            ))}
            <section className="rounded-xl border border-q-line p-4">
              <h3 className="text-sm font-bold">Tentativas de login</h3>
              {!list.data?.locks.length && <p className="mt-1 text-xs text-q-mid">Nenhum IP com falhas de login.</p>}
              {list.data?.locks.map((l) => (
                <div key={l.ip} className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                  <strong className="font-mono">{l.ip}</strong>
                  <span className="text-xs text-q-mid">{l.locked_until > Date.now() ? `bloqueado até ${fmt(new Date(l.locked_until).toISOString(), "datetime")}` : `${l.fails} falha(s), ${l.locks} bloqueio(s) anteriores`}</span>
                  <button className={action} disabled={busy || dirty} onClick={() => act(l.ip, "unlock", `Bloqueio de ${l.ip} removido.`)}>Zerar tentativas</button>
                </div>
              ))}
            </section>
          </div>
        )}

        {msg && (
          <p role={msg.kind === "err" ? "alert" : "status"} className={`rounded-lg px-4 py-2.5 text-sm ${msg.kind === "err" ? "border-l-4 border-q-orange bg-q-bg text-q-ink" : "bg-q-ink text-white"}`}>
            {msg.text}
          </p>
        )}
        <p className="text-[11px] leading-relaxed text-q-mid">
          O sistema não deixa ativar uma lista que bloqueie o seu próprio IP. Em emergência, um IP definido em <code>IP_ALLOWLIST_BOOTSTRAP</code> sempre entra. Toda alteração fica registrada na auditoria.
        </p>
      </div>
    </Panel>
  );
}
