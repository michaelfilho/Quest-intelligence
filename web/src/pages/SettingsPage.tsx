import { Database, Globe, History, Info, Lock, MonitorSmartphone, Plug, Ruler, Settings, Shield, ShieldCheck, SlidersHorizontal, Users, Workflow, type LucideIcon } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import type { Permission } from "../../../shared/permissions";
import { PageHeader, Panel } from "../components/ui";
import { DB_LABEL, useCan, useHealth } from "../lib";
import { AccessPanel } from "./AccessPanel";
import { AllSessionsSection, AuditSection, GeneralSection, SecuritySection } from "./AdminActivity";
import { RolesSection, UsersSection } from "./AdminUsers";
import { ConnectionPanel } from "./ConnectionPanel";
import { NoAccess } from "./ModulePage";

// Parâmetros metodológicos: somente leitura. Nada aqui é presumido — cada item mostra o estado real da definição.
const METHOD = [
  { label: "Custo/hora por colaborador", value: "Não definido", note: "Horas não são convertidas em custo financeiro sem metodologia validada. Nenhum salário, encargo ou taxa é presumido." },
  { label: "Rateio de custos indiretos", value: "Sem rateio", note: "Custos indiretos são apresentados separadamente e não são distribuídos entre clientes ou projetos." },
  { label: "Jornada e capacidade", value: "Fonte não identificada", note: "Capacidade e ocupação dependem de uma fonte válida de jornada/disponibilidade dos colaboradores." },
  { label: "Critério de entrega", value: "A validar", note: "Peça aprovada, job entregue ou etapa final do workflow: definição pendente com a Quest." },
  { label: "Bases temporais", value: "Separadas", note: "Faturamento, recebimento (caixa) e competência nunca são somados no mesmo número." },
  { label: "Fuso horário", value: "America/Sao_Paulo", note: "Todas as datas e períodos." },
];

function Integrations() {
  const health = useHealth();
  const db = health.data?.database;
  const items = [
    { icon: Database, name: "PostgreSQL quest_rinne", tag: "SOMENTE LEITURA", desc: "Fonte oficial. Schemas core (consumo), ingest (coletas) e audit (conflitos).", status: health.isError ? "API inacessível" : db ? DB_LABEL[db] : "Verificando…", ok: db === "CONNECTED" },
    { icon: Workflow, name: "iClips API → n8n (QPF-00)", tag: "INGESTÃO", desc: "Sincronização externa gerenciada pelo n8n. Esta aplicação apenas lê o resultado e nunca altera workflows.", status: "Gerenciado fora da aplicação", ok: false },
    { icon: Database, name: "Banco da aplicação (SQLite)", tag: "PERSISTENTE", desc: "Usuários, perfis, sessões, auditoria e configurações. Isolado do banco analítico; volume server/data.", status: "Ativo", ok: true },
  ];
  return (
    <Panel title="Integrações" subtitle={<><Plug size={13} className="text-q-orange" /> Conectores de dados</>}>
      <div className="space-y-3 px-6 pb-6">
        {items.map((i) => (
          <div key={i.name} className="flex items-center gap-4 rounded-xl border border-q-line p-4">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-q-bg"><i.icon size={18} className="text-q-graphite" aria-hidden /></div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-sm font-bold">{i.name}<span className="rounded border border-q-line px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-q-mid">{i.tag}</span></div>
              <p className="mt-0.5 text-xs text-q-mid">{i.desc}</p>
            </div>
            <span className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold ${i.ok ? "border-q-orange bg-q-orange text-white" : "border-q-orange/50 text-q-ink"}`}>{i.status}</span>
          </div>
        ))}
        <p className="flex items-center gap-1.5 pt-1 text-[11px] text-q-mid"><Info size={12} aria-hidden /> Credenciais ficam apenas no backend (variáveis de ambiente). Nenhuma é solicitada nesta interface.</p>
      </div>
    </Panel>
  );
}

function General() {
  return (
    <div className="space-y-6">
      <GeneralSection />
      <Panel title="Parâmetros metodológicos" subtitle={<><Ruler size={13} className="text-q-orange" /> Definições que afetam margens, custos e capacidade (somente leitura)</>}>
        <dl className="border-t border-q-line">
          {METHOD.map((m) => (
            <div key={m.label} className="grid grid-cols-[1fr_auto] gap-x-4 border-b border-q-line/70 px-6 py-3.5 last:border-0">
              <dt className="text-sm font-semibold">{m.label}</dt>
              <dd className="rounded-md bg-q-bg px-2 py-0.5 text-xs font-bold text-q-graphite">{m.value}</dd>
              <p className="col-span-2 mt-1 text-xs text-q-mid">{m.note}</p>
            </div>
          ))}
        </dl>
      </Panel>
    </div>
  );
}

const SECTIONS: { id: string; label: string; icon: LucideIcon; perm: Permission; render: () => JSX.Element }[] = [
  { id: "usuarios", label: "Usuários", icon: Users, perm: "usuarios.manage", render: () => <UsersSection /> },
  { id: "perfis", label: "Perfis e permissões", icon: ShieldCheck, perm: "perfis.manage", render: () => <RolesSection /> },
  { id: "ip", label: "Controle de acesso por IP", icon: Lock, perm: "ip.manage", render: () => <AccessPanel /> },
  { id: "sessoes", label: "Sessões ativas", icon: MonitorSmartphone, perm: "sessoes.manage", render: () => <AllSessionsSection /> },
  { id: "historico", label: "Histórico de acessos", icon: History, perm: "auditoria.view", render: () => <AuditSection /> },
  { id: "seguranca", label: "Segurança", icon: Shield, perm: "config.view", render: () => <SecuritySection /> },
  { id: "integracoes", label: "Integrações", icon: Globe, perm: "config.view", render: () => <Integrations /> },
  { id: "banco", label: "Banco de dados", icon: Database, perm: "config.view", render: () => <ConnectionPanel /> },
  { id: "gerais", label: "Configurações gerais", icon: SlidersHorizontal, perm: "config.view", render: () => <General /> },
];

export function SettingsPage() {
  const can = useCan();
  const [sp, setSp] = useSearchParams();
  const allowed = SECTIONS.filter((s) => can(s.perm));
  if (!allowed.length) return <NoAccess title="Configurações" />;
  const current = allowed.find((s) => s.id === sp.get("secao")) ?? allowed[0];

  return (
    <div className="mx-auto max-w-[1480px] space-y-6">
      <PageHeader icon={Settings} title="Configurações" subtitle="Usuários, permissões, acesso, sessões, auditoria, integrações e parâmetros. Tudo é persistido no banco da aplicação e auditado." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[240px_1fr]">
        <nav aria-label="Seções de configurações" className="h-fit rounded-xl border border-q-line bg-white p-2 lg:sticky lg:top-24">
          {allowed.map((s) => (
            <button
              key={s.id}
              onClick={() => setSp((p) => (p.set("secao", s.id), p), { replace: true })}
              aria-current={s.id === current.id ? "page" : undefined}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium ${s.id === current.id ? "bg-q-ink text-white" : "text-q-graphite hover:bg-q-bg"}`}
            >
              <s.icon size={16} className={s.id === current.id ? "text-q-orange" : "text-q-mid"} aria-hidden /> {s.label}
            </button>
          ))}
        </nav>
        <div className="min-w-0">{current.render()}</div>
      </div>
    </div>
  );
}
