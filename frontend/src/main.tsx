import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, StrictMode, Suspense, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Link, Navigate, RouterProvider, useLocation } from "react-router-dom";
import { MODULES } from "../../shared/catalog";
import {CASH_VIEW,DRE_VIEW} from '../../shared/management';
import { Layout } from "./components/Layout";
import { EmptyState, ErrorState, Skeleton } from "./components/ui";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
import "./styles.css";
import "./compact.css";
import { SECTION_PAGES, UNAVAILABLE_PAGES } from "./nav";
import { ApiError, useMe } from "./lib";
import { AccountPage, ForcedPasswordPage, LoginPage } from "./pages/AuthPages";
import { sanitizeTrackingUrl } from './tracking-url';

// O Router deve observar apenas a URL já sanitizada, inclusive no login.
sanitizeTrackingUrl();

// Páginas carregadas sob demanda (bundle inicial menor; gráficos só quando necessários).
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- props variam por página
const named = <K extends string>(load: () => Promise<Record<K, React.ComponentType<any>>>, name: K) => lazy(() => load().then((m) => ({ default: m[name] })));
const ModulePage = named(() => import("./pages/ModulePage"), "ModulePage");
const ReportsPage = named(() => import("./pages/ReportsPage"), "ReportsPage");
const AlertsPage=named(()=>import('./pages/AlertsPage'),'AlertsPage');
const SettingsPage = named(() => import("./pages/SettingsPage"), "SettingsPage");
const UnavailablePage = named(() => import("./pages/ModulePage"), "UnavailablePage");
const ReportPrintPage = named(() => import("./pages/PrintPages"), "ReportPrintPage");

const client: QueryClient = new QueryClient({
  // Sessão expirada/revogada em qualquer chamada → volta para o login.
  queryCache: new QueryCache({
    onError: (e, query) => {
      if (e instanceof ApiError && e.status === 401 && query.queryKey[0] !== "me") client.resetQueries({ queryKey: ["me"] });
      if (e instanceof ApiError && e.code === "PASSWORD_CHANGE_REQUIRED") client.invalidateQueries({ queryKey: ["me"] });
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 60000,
      refetchInterval: false,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
});

const page = (el: ReactNode) => <Suspense fallback={<Skeleton className="mx-auto h-64 max-w-[1480px]" />}>{el}</Suspense>;

/** Endereço antigo: leva à página atual mantendo os filtros. */
function Redirect({ to }: { to: string }) {
  return <Navigate to={{ pathname: to, search: useLocation().search }} replace />;
}

const router = createBrowserRouter([
  { path: "/relatorios/:id/imprimir", element: page(<ReportPrintPage />) },
  {
    element: <Layout />,
    children: [
      ...MODULES.map((m) => ({ path: m.path, element: page(<ModulePage key={m.id} moduleId={m.id} />) })),
      {path:'/dre',element:page(<ModulePage moduleId="financeiro" preset={DRE_VIEW}/>)},
      {path:'/fluxo-caixa',element:page(<ModulePage moduleId="financeiro" preset={CASH_VIEW}/>)},
      {path:'/alertas',element:page(<AlertsPage/>)},
      {path:'/departamentos/:id',element:page(<ModulePage moduleId="departamentos"/>)},
      {path:'/colaboradores/:id',element:page(<ModulePage moduleId="colaboradores"/>)},
      ...SECTION_PAGES.map((s) => ({ path: s.path, element: page(<ModulePage moduleId={s.moduleId} preset={s.preset} compare={s.compare} />) })),
      ...UNAVAILABLE_PAGES.map((u) => ({ path: u.path, element: page(<UnavailablePage key={u.path} {...u} />) })),
      // Endereços do protótipo e da interface anterior continuam funcionando.
      { path: "/dre-gerencial", element: <Redirect to="/dre" /> },
      { path: "/dashboard-financeiro", element: <Redirect to="/financeiro" /> },
      { path: "/alertas-gerenciais", element: <Redirect to="/alertas" /> },
      { path: "/central-alertas", element: page(<AlertsPage />) },
      { path: "/controle-acesso", element: page(<SettingsPage key="ip" section="ip" />) },
      { path: "/permissoes", element: page(<SettingsPage key="perfis" section="perfis" />) },
      { path: "/auditoria", element: page(<SettingsPage key="historico" section="historico" />) },
      { path: "/relatorios", element: page(<ReportsPage />) },
      { path: "/configuracoes", element: page(<SettingsPage />) },
      { path: "/conta", element: page(<AccountPage />) },
      {
        path: "*",
        element: (
          <div className="rounded-lg border border-q-line bg-white">
            <EmptyState title="Página não encontrada" reason="Use o menu lateral para navegar pelos módulos." />
            <div className="pb-6 text-center">
              <Link to="/" className="text-sm font-medium text-q-orange">Ir para a visão geral</Link>
            </div>
          </div>
        ),
      },
    ],
  },
], { basename: import.meta.env.BASE_URL.replace(/\/$/, "") || "/" });

/** Sem sessão → login. Senha temporária → troca obrigatória. Depois, o sistema. */
function Gate() {
  const me = useMe();
  if (me.isPending) return <div className="grid min-h-screen place-items-center bg-q-ink text-sm text-white/60">Carregando…</div>;
  if (me.error instanceof ApiError && me.error.status === 401) return <LoginPage />;
  if (me.isError) return <div className="grid min-h-screen place-items-center p-6"><ErrorState error={me.error} onRetry={() => me.refetch()} /></div>;
  if (me.data.mustChangePassword) return <ForcedPasswordPage />;
  return <RouterProvider router={router} />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <Gate />
    </QueryClientProvider>
  </StrictMode>
);
