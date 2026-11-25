import { Briefcase, Building2, Clock, Factory, FileText, LayoutGrid, Layers, Scale, Settings, ShieldCheck, TrendingUp, Users, Wallet, Zap, type LucideIcon } from "lucide-react";
import { MODULES } from "../../shared/catalog";
import { monthPeriod, todaySP } from "../../shared/contracts";
import { MODULE_PERMISSION, type Permission } from "../../shared/permissions";

export const MODULE_ICON: Record<string, LucideIcon> = {
  executivo: LayoutGrid,
  clientes: Building2,
  cliente: Building2,
  projetos: Briefcase,
  projeto: Briefcase,
  rentabilidade: TrendingUp,
  financeiro: Wallet,
  timesheet: Clock,
  departamentos: Layers,
  colaboradores: Users,
  produtividade: Zap,
  producao: Factory,
  contratado: Scale,
  contratos: Briefcase,
  capacidade: Clock,
  eficiencia: Zap,
  qualidade: ShieldCheck,
};

export interface NavItem {
  id: string;
  path: string;
  label: string;
  group: string;
  icon: LucideIcon;
  question: string;
  /** Basta UMA destas permissões para ver o item (o backend sempre confere). */
  anyOf: Permission[];
}

const GROUP_LABEL: Record<string, string> = { Principal: "Navegação principal", Análises: "Análises", Governança: "Governança" };

const modules: NavItem[] = MODULES.filter((m) => !m.detailOf).map((m) => ({ id: m.id, path: m.path, label: m.label, group: GROUP_LABEL[m.group] ?? m.group, icon: MODULE_ICON[m.id], question: m.question, anyOf: [MODULE_PERMISSION[m.id]] }));

export const NAV: NavItem[] = [
  ...modules.filter((m) => m.group !== "Governança"),
  { id: "relatorios", path: "/relatorios", label: "Relatórios", group: "Análises", icon: FileText, question: "Relatórios gerenciais com exportação CSV (Excel pt-BR).", anyOf: ["relatorios.view"] },
  ...modules.filter((m) => m.group === "Governança"),
  { id: "configuracoes", path: "/configuracoes", label: "Configurações", group: "Governança", icon: Settings, question: "Usuários, perfis, acesso, sessões, auditoria e integrações.", anyOf: ["config.view", "usuarios.manage", "perfis.manage", "ip.manage", "sessoes.manage", "auditoria.view"] },
];

/** Itens de menu liberados para um conjunto de permissões (o backend aplica de verdade). */
export const navFor = (perms: ReadonlySet<string>) => NAV.filter((n) => n.anyOf.some((p) => perms.has(p)));

export function periodPresets() {
  const t = todaySP();
  const y = Number(t.slice(0, 4));
  const m = Number(t.slice(5, 7));
  const prev = m === 1 ? monthPeriod(y - 1, 12) : monthPeriod(y, m - 1);
  return [
    { label: "Mês atual", start: `${t.slice(0, 8)}01`, end: t },
    { label: "Mês anterior", ...prev },
    { label: "Ano atual", start: `${y}-01-01`, end: t },
    { label: "Ano anterior", start: `${y - 1}-01-01`, end: `${y - 1}-12-31` },
    { label: "Últimos 12 meses", start: new Date(Date.UTC(y, m - 12, 1)).toISOString().slice(0, 10), end: t },
  ];
}
