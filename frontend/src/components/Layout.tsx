import { Bell, CalendarDays, ChevronDown, Database, Menu, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, matchPath, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { INDICATORS, MODULES } from '../../../shared/catalog';
import { DB_LABEL, useFilters, useHealth, useMe } from '../lib';
import { NAV, navFor, periodPresets, type NavItem } from '../nav';
import { LogoutButton } from '../pages/AuthPages';

/** Itens de menu liberados ao usuário (esconder é só conveniência; o backend aplica as permissões). */
function useNav(): NavItem[] {
  return navFor(new Set(useMe().data?.permissions ?? []));
}

const fold = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Busca rápida: módulos e indicadores (catálogo real, sem dados).
function searchIndex(nav: NavItem[]) {
  const paths = new Set(nav.map((n) => n.path));
  return [
    ...nav.map((n) => ({ label: n.label, path: n.path })),
    ...MODULES.filter((m) => !m.detailOf && paths.has(m.path)).flatMap((m) => m.indicators.map((i) => ({ label: `${INDICATORS[i].label} · ${m.label}`, path: m.path }))),
  ].filter((x, i, a) => a.findIndex((y) => y.label === x.label) === i);
}

function useTitle() {
  const { pathname } = useLocation();
  if (matchPath('/clientes/:id', pathname)) return 'Cliente';
  if (matchPath('/projetos/:id', pathname)) return 'Projeto';
  if (matchPath('/departamentos/:id', pathname)) return 'Departamento';
  if (matchPath('/colaboradores/:id', pathname)) return 'Colaborador';
  if (pathname === '/conta') return 'Minha conta';
  return NAV.find((n) => n.path === pathname)?.label ?? MODULES.find((m) => m.path === pathname)?.label ?? 'Página não encontrada';
}

function PeriodSelect() {
  const { filters, set } = useFilters();
  const presets = periodPresets();
  const current = presets.findIndex((p) => p.start === filters.start && p.end === filters.end);
  return (
    <label className="period">
      <CalendarDays size={14} aria-hidden />
      <select aria-label="Período" value={current} onChange={(e) => {
        const p = presets[Number(e.target.value)];
        if (p) set({ start: p.start, end: p.end });
      }}>
        {current === -1 && <option value={-1}>Período personalizado</option>}
        {presets.map((p, i) => <option key={p.label} value={i}>{p.label}</option>)}
      </select>
    </label>
  );
}

function GlobalSearch({ nav }: { nav: NavItem[] }) {
  const navigate = useNavigate();
  const { search } = useFilters();
  const { pathname } = useLocation();
  const [q, setQ] = useState('');
  useEffect(() => setQ(''), [pathname]);
  const matches = q.length > 1 ? searchIndex(nav).filter((s) => fold(s.label).includes(fold(q))).slice(0, 7) : [];
  return (
    <div className="global-search">
      <Search size={14} aria-hidden />
      <input aria-label="Buscar módulos e indicadores" placeholder="Buscar módulos e indicadores..." value={q} onChange={(e) => setQ(e.target.value)} />
      {q.length > 1 && (
        <div className="search-results">
          {matches.length ? matches.map((m) => <button key={m.label} onClick={() => { navigate({ pathname: m.path, search }); setQ(''); }}>{m.label}</button>) : <p>Nenhum resultado encontrado.</p>}
        </div>
      )}
    </div>
  );
}

export function Layout() {
  const [mobile, setMobile] = useState(false);
  const { pathname } = useLocation();
  const health = useHealth(true); // único dono do timer; painéis observam a mesma query sem outro intervalo
  const { search } = useFilters();
  const title = useTitle();
  const me = useMe().data;
  const nav = useNav();
  const groups = [...new Set(nav.map((n) => n.group))];
  const activeGroup = nav.find((n) => n.path === pathname || (n.path !== '/' && pathname.startsWith(n.path + '/')))?.group;
  // Grupos começam recolhidos, exceto o da página atual (como no design).
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  const [menuSearch, setMenuSearch] = useState('');
  const navigation = useRef<HTMLElement>(null);
  const db = health.data?.database;
  const dbLabel = health.isError ? 'API inacessível' : db ? DB_LABEL[db] : 'Verificando…';
  const alertsPath = nav.find((n) => n.id === 'alertas')?.path;
  useEffect(() => {
    setMobile(false);
    if (activeGroup) setOpened((o) => ({ ...o, [activeGroup]: true }));
    const frame = requestAnimationFrame(() => navigation.current?.querySelector<HTMLElement>('a[aria-current="page"]')?.scrollIntoView({ block: 'nearest' }));
    return () => cancelAnimationFrame(frame);
  }, [pathname, activeGroup]);

  return (
    <div className="app">
      <aside className={`sidebar ${mobile ? 'mobile-open' : ''}`}>
        <Link className="brand" to={{ pathname: '/', search }}>
          <span className="brand-symbol">Q</span>
          <div><strong>QUEST <b>PRO</b></strong><small>INTELLIGENCE SUITE</small></div>
        </Link>
        <div className="sidebar-search">
          <Search size={13} aria-hidden />
          <input value={menuSearch} onChange={(e) => setMenuSearch(e.target.value)} placeholder="Buscar menu..." aria-label="Buscar menu" />
        </div>
        <nav ref={navigation} aria-label="Módulos">
          {groups.map((g) => {
            const visible = nav.filter((n) => n.group === g && fold(n.label).includes(fold(menuSearch)));
            if (!visible.length) return null;
            const open = !!menuSearch || (opened[g] ?? (g === activeGroup));
            return (
              <div className="nav-group" key={g}>
                <button className={`group-title ${g === activeGroup ? 'active-group' : ''}`} aria-expanded={open} onClick={() => setOpened((o) => ({ ...o, [g]: !open }))}>
                  {g}<ChevronDown size={12} className={open ? '' : 'collapsed'} />
                </button>
                {open && visible.map((n) => (
                  <NavLink key={n.id} to={{ pathname: n.path, search }} end={n.path === '/'} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                    <n.icon size={15} aria-hidden /><span>{n.label}</span>
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="demo-card">
          <strong><Database size={13} aria-hidden />Conexão de dados</strong>
          <p>Informações financeiras, comerciais e operacionais da agência.</p>
          <div><small>QUEST INTELLIGENCE</small><span className={db === 'CONNECTED' ? '' : 'offline'}>● {dbLabel}</span></div>
        </div>
        {me && (
          <div className="sidebar-user">
            <Link to="/conta" title="Minha conta" className="sidebar-account">
              <span className="avatar">{me.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()}</span>
              <div><strong>{me.name}</strong><small>{me.role ?? 'Sem perfil'}{me.scopeDepartment ? ' · Seu departamento' : ''}</small></div>
            </Link>
            <LogoutButton className="icon-button logout" />
          </div>
        )}
      </aside>
      {mobile && <button className="sidebar-overlay" aria-label="Fechar menu" onClick={() => setMobile(false)} />}

      <div className="workspace">
        <header>
          <div className="header-title">
            <button className="icon-button mobile-toggle" aria-label="Abrir menu" onClick={() => setMobile(true)}><Menu size={19} /></button>
            <div>
              <div className="breadcrumbs"><Link to={{ pathname: '/', search }}>Quest Intelligence</Link><span>›</span>{title}</div>
              <strong>{title}</strong>
            </div>
          </div>
          <div className="header-controls">
            <GlobalSearch nav={nav} />
            <PeriodSelect />
            {alertsPath && (
              <Link to={{ pathname: alertsPath, search }} className="icon-button" aria-label="Notificações" title="Alertas"><Bell size={17} /></Link>
            )}
            <div className={`source-state ${db === 'CONNECTED' ? 'ok' : ''}`} title="Disponibilidade dos dados">{dbLabel}</div>
          </div>
        </header>
        <main><Outlet /></main>
        <footer>QUEST INTELLIGENCE · Gestão financeira, comercial e operacional · Valores em R$ e datas no horário de Brasília.</footer>
      </div>
    </div>
  );
}
