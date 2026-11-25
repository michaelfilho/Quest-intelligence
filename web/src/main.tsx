import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, StrictMode, Suspense, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Link, RouterProvider } from "react-router-dom";
import { MODULES } from "../../shared/catalog";
import { Layout } from "./components/Layout";
import { EmptyState, ErrorState, Skeleton } from "./components/ui";
import "./index.css";
import { ApiError, useMe } from "./lib";
import { AccountPage, ForcedPasswordPage, LoginPage } from "./pages/AuthPages";

// Páginas carregadas sob demanda (bundle inicial menor; gráficos só quando necessários).
const named = <K extends string>(load: () => Promise<Record<K, React.ComponentType<any>>>, name: K) => lazy(() => load().then((m) => ({ default: m[name] })));
const ModulePage = named(() => import("./pages/ModulePage"), "ModulePage");
const ReportsPage = named(() => import("./pages/ReportsPage"), "ReportsPage");
const SettingsPage = named(() => import("./pages/SettingsPage"), "SettingsPage");
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
      refetchInterval: 60000,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: false,
      retry: (n, e) => !(e instanceof ApiError && e.status >= 400 && e.status < 500) && n < 1,
    },
  },
});

const page = (el: ReactNode) => <Suspense fallback={<Skeleton className="mx-auto h-64 max-w-[1480px]" />}>{el}</Suspense>;

const router = createBrowserRouter([
  { path: "/relatorios/:id/imprimir", element: page(<ReportPrintPage />) },
  {
    element: <Layout />,
    children: [
      ...MODULES.map((m) => ({ path: m.path, element: page(<ModulePage key={m.id} moduleId={m.id} />) })),
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
