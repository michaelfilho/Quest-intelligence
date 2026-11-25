import { CalendarDays, ChevronDown, Database, Menu, Search } from "lucide-react";
import { useEffect,useRef, useState } from "react";
import { matchPath, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { INDICATORS, MODULES } from "../../../shared/catalog";
import { DB_LABEL, useFilters, useHealth, useMe } from "../lib";
import { NAV, navFor, periodPresets, type NavItem } from "../nav";
import { LogoutButton } from "../pages/AuthPages";

/** Itens de menu liberados ao usuário (esconder é só conveniência; o backend aplica as permissões). */
function useNav(): NavItem[] {
  return navFor(new Set(useMe().data?.permissions ?? []));
}

// Busca rápida: módulos e indicadores (catálogo real, sem dados).
function useSearchIndex(nav: NavItem[]) {
  const paths = new Set(nav.map((n) => n.path));
  return [
    ...nav.map((n) => ({ label: n.label, path: n.path })),
    ...MODULES.filter((m) => !m.detailOf && paths.has(m.path)).flatMap((m) => m.indicators.map((i) => ({ label: `${INDICATORS[i].label} · ${m.label}`, path: m.path }))),
  ].filter((x, i, a) => a.findIndex((y) => y.label === x.label) === i);
}

function useTitle() {
  const { pathname } = useLocation();
  if (matchPath("/clientes/:id", pathname)) return "Cliente";
  if (matchPath("/projetos/:id", pathname)) return "Projeto";
  if(matchPath('/departamentos/:id',pathname))return 'Departamento';
  if(matchPath('/colaboradores/:id',pathname))return 'Colaborador';
  if (pathname === "/conta") return "Minha conta";
  return NAV.find((n) => n.path === pathname)?.label ?? MODULES.find(m=>m.path===pathname)?.label?? "Página não encontrada";
}

function PeriodSelect() {
  const { filters, set } = useFilters();
  const presets = periodPresets();
  const current = presets.findIndex((p) => p.start === filters.start && p.end === filters.end);
  return (
    <label className="hidden h-10 items-center gap-2 rounded-lg border border-q-line bg-white px-3 text-sm md:flex">
      <CalendarDays size={16} className="text-q-orange" aria-hidden />
      <span className="sr-only">Período</span>
      <select className="bg-transparent font-medium text-q-ink outline-none" value={current} onChange={(e) => {
        const p = presets[Number(e.target.value)];
        if (p) set({ start: p.start, end: p.end });
      }}>
        {current === -1 && <option value={-1}>Período personalizado</option>}
        {presets.map((p, i) => (
          <option key={p.label} value={i}>{p.label}</option>
        ))}
      </select>
    </label>
  );
}

function QuickSearch() {
  const SEARCH = useSearchIndex(useNav());
  const navigate = useNavigate();
  const { search } = useFilters();
  const [q, setQ] = useState("");
  return (
    <label className="relative hidden w-60 xl:block">
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-q-mid" aria-hidden />
      <input
        list="rinne-search"
        value={q}
        placeholder="Buscar módulos e indicadores…"
        aria-label="Buscar módulos e indicadores"
        className="h-10 w-full rounded-lg border border-q-line bg-white pl-9 pr-3 text-sm placeholder:text-q-mid focus:border-q-orange focus:outline-none"
        onChange={(e) => {
          const hit = SEARCH.find((s) => s.label === e.target.value);
          if (hit) {
            navigate({ pathname: hit.path, search });
            setQ("");
          } else setQ(e.target.value);
        }}
      />
      <datalist id="rinne-search">
        {SEARCH.map((s) => (
          <option key={s.label} value={s.label} />
        ))}
      </datalist>
    </label>
  );
}

export function Layout() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const health = useHealth(true); // único dono do timer; painéis observam a mesma query sem outro intervalo
  const { search } = useFilters();
  const title = useTitle();
  const me = useMe().data;
  const nav = useNav();
  const groups = [...new Set(nav.map((n) => n.group))];
  const [collapsed,setCollapsed]=useState<Record<string,boolean>>({});
  const navigation=useRef<HTMLElement>(null);
  const db = health.data?.database;
  useEffect(()=>{
    setOpen(false);
    const active=nav.find(n=>n.path===pathname||(n.path!=='/'&&pathname.startsWith(n.path+'/')));
    if(active)setCollapsed(c=>c[active.group]?{...c,[active.group]:false}:c);
    const frame=requestAnimationFrame(()=>navigation.current?.querySelector<HTMLElement>('a[aria-current="page"]')?.scrollIntoView({block:'nearest'}));
    return ()=>cancelAnimationFrame(frame);
  },[pathname]);

  return (
    <div className="min-h-screen lg:pl-64">
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-q-ink text-white transition-transform lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-5">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-q-orange text-lg font-black text-white shadow-[0_0_18px_rgba(245,130,32,0.45)]">Q</div>
          <div className="leading-tight">
            <div className="flex items-center gap-1.5">
              <span className="text-lg font-black tracking-tight">QUEST</span>
              <span className="rounded border border-q-orange/60 bg-white/5 px-1.5 py-0.5 text-[10px] font-bold text-q-orange">RINNE</span>
            </div>
            <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-white/60">Inteligência de gestão</div>
          </div>
        </div>

        <nav ref={navigation} className="flex-1 overflow-y-auto px-3 py-4" aria-label="Módulos">
          {groups.map((g) => (
            <div key={g} className="mb-4">
              <button aria-expanded={!collapsed[g]} onClick={()=>setCollapsed(c=>({...c,[g]:!c[g]}))} className="flex w-full items-center justify-between px-3 pb-2 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-white/60">{g}<ChevronDown size={13} className={collapsed[g]?'-rotate-90':''}/></button>
              {!collapsed[g]&&nav.filter((n) => n.group === g).map((n) => (
                <NavLink
                  key={n.id}
                  to={{ pathname: n.path, search }}
                  end={n.path === "/"}
                  className={({ isActive }) =>
                    `mb-0.5 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${isActive ? "bg-q-orange text-white shadow-[0_4px_14px_rgba(245,130,32,0.35)]" : "text-white/75 hover:bg-white/5 hover:text-white"}`
                  }
                >
                  <n.icon size={17} strokeWidth={1.8} aria-hidden />
                  <span className="flex-1">{n.label}</span>
                  {n.id === "qualidade" && db && db !== "CONNECTED" && <span className="rounded border border-q-orange/70 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-q-orange">OFFLINE</span>}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="m-3 rounded-xl border border-white/10 bg-white/[0.04] p-4 text-xs">
          <div className="flex items-center gap-2 font-semibold text-white">
            <Database size={14} className="text-q-orange" aria-hidden /> Conexão de dados
          </div>
          <p className="mt-2 leading-relaxed text-white/60">Informações financeiras, comerciais e operacionais.</p>
          <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-2 text-[11px]">
            <span className="text-white/40">QUEST RINNE 1.0</span>
            <span className={`flex items-center gap-1.5 font-semibold ${db === "CONNECTED" ? "text-q-orange" : "text-white/60"}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${db === "CONNECTED" ? "bg-q-orange" : "border border-white/60"}`} />
              {health.isError ? "API inacessível" : db ? DB_LABEL[db] : "Verificando…"}
            </span>
          </div>
        </div>
      </aside>
      {open && <button aria-label="Fechar menu" className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setOpen(false)} />}

      <div className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-q-line bg-white px-4 py-3 lg:px-8">
          <button onClick={() => setOpen(true)} aria-label="Abrir menu" className="rounded-lg p-2 hover:bg-q-bg lg:hidden">
            <Menu size={20} aria-hidden />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-xs text-q-mid">
              <span className="whitespace-nowrap">Quest RINNE</span>
              <span aria-hidden>›</span>
              <span className="truncate text-q-ink">{title}</span>
            </div>
            <div className="truncate text-xl font-bold tracking-tight">{title}</div>
          </div>
          <QuickSearch />
          <PeriodSelect />
          <div className={`hidden items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold 2xl:flex ${db === "CONNECTED" ? "border-q-orange/40 text-q-ink" : "border-q-line text-q-mid"}`} title="Disponibilidade dos dados">
            <span className={`h-2 w-2 rounded-full ${db === "CONNECTED" ? "bg-q-orange" : "border border-q-orange"}`} />
            {db ? DB_LABEL[db] : "…"}
          </div>
          {me && (
            <div className="flex items-center gap-3 border-l border-q-line pl-3">
              <NavLink to="/conta" className="flex items-center gap-2.5" title="Minha conta">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-q-ink text-xs font-bold text-white">{me.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase()}</span>
                <span className="hidden leading-tight xl:block">
                  <span className="block max-w-40 truncate text-sm font-semibold" title={me.name}>{me.name}</span>
                  <span className="block text-[11px] text-q-mid">{me.role ?? "Sem perfil"}{me.scopeDepartment ? ' · Seu departamento' : ''}</span>
                </span>
              </NavLink>
              <LogoutButton className="hidden rounded-lg px-2 py-1.5 text-xs font-medium text-q-mid hover:bg-q-bg hover:text-q-ink sm:block" />
            </div>
          )}
        </header>
        <main className="flex-1 px-4 py-8 lg:px-8">
          <Outlet />
        </main>
        <footer className="border-t border-q-line bg-white px-4 py-4 text-center text-[11px] text-q-mid lg:px-8">
          QUEST RINNE · Gestão financeira, comercial e operacional · Valores em R$ e datas no horário de Brasília.
        </footer>
      </div>
    </div>
  );
}
