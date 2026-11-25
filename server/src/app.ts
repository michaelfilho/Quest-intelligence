import express, { type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { INDICATORS, MODULES, TABLES, moduleById } from "../../shared/catalog.js";
import { DIMENSIONS, previousPeriod, type Dimension } from "../../shared/contracts.js";
import type { Permission } from "../../shared/permissions.js";
import { accessGuard, accessRouter } from "./access.js";
import { adminRouter } from "./admin.js";
import { authenticate, authRouter, can, csrf, requireAuth } from "./auth.js";
import { allowedColumns, chartAllowed, indicatorAllowed, moduleAllowed, scopeFilters, stripRows, tableAllowed } from "./authz.js";
import { dbState, q, SCHEMAS } from "./db.js";
import { filtersSchema, pageSchema } from "./filters.js";
import { reportsRouter } from "./reports.js";
import { runtimeSchema, mappingCapabilities } from "./schema.js";
import { withReadContext } from "./read-once.js";
import { resolveDimension, resolveIndicator, resolveModule, resolveRecords, resolveTable } from "./services.js";

class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const r = schema.safeParse(input);
  if (!r.success) throw new HttpError(400, "Parâmetros inválidos", r.error.issues.map((i) => ({ campo: i.path.join("."), erro: i.message })));
  return r.data;
}

// Rotas assíncronas: erros seguem para o handler central.
const h = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);
const forbidden = () => new HttpError(403, "Você não tem permissão para acessar este conteúdo.", undefined);

// Opções de filtro também revelam dados (nomes de clientes etc.).
const DIMENSION_PERMISSION: Partial<Record<Dimension, Permission>> = { clients: "clientes.view", groups: "clientes.view", projects: "projetos.view", departments: "departamentos.view", employees: "departamentos.view", statuses: "projetos.view", services: "producao.view" };

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use((_req, _res, next) => withReadContext(next));
  app.set("query parser", "simple"); // sem objetos/arrays aninhados vindos da query string
  // Só confia em X-Forwarded-For vindo destes proxies. Padrão: apenas loopback (dev).
  // Produção: IP fixo do nginx (docker-compose.prod.yml). Ver docs/SEGURANCA.md.
  app.set("trust proxy", process.env.TRUST_PROXY || "loopback");

  // Log de acesso sem query string nem headers (evita vazar filtros sensíveis ou credenciais).
  app.use((req, res, next) => {
    const t = Date.now();
    res.on("finish", () => console.log(JSON.stringify({ level: "info", method: req.method, path: req.path, status: res.statusCode, ms: Date.now() - t, user: req.user?.username })));
    res.set({ "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store", "X-Frame-Options": "DENY" });
    next();
  });

  // 1) IP (allowlist + REQUIRE_PROXY) → 2) sessão → 3) CSRF. Tudo antes de qualquer rota.
  app.use("/api", accessGuard, authenticate, csrf);
  app.use("/api/access", accessRouter());
  app.use("/api/auth", authRouter());

  // Público e mínimo (healthcheck do Docker). Detalhes da sessão do banco só para quem pode ver configurações.
  app.get("/api/health", h(async (req, res) => {
    const db = await dbState();
    let session = null;
    if (db.state === "CONNECTED" && req.user && can(req, "config.view")) {
      [session] = await q("select current_database() as database, current_user as user, current_setting('transaction_read_only') as read_only, now()::text as server_time");
    }
    res.json({ status: "ok", database: db.state, session, timezone: process.env.APP_TIMEZONE ?? "America/Sao_Paulo", ...(req.user && can(req, "config.view") ? { schemas: SCHEMAS } : {}) });
  }));

  // Daqui em diante: sessão válida obrigatória (bloqueio por padrão).
  app.use("/api", requireAuth);
  app.use("/api/admin", adminRouter());

  app.get("/api/modules", (req, res) => res.json(MODULES.filter((m) => moduleAllowed(req.user!, m))));

  app.get("/api/modules/:id", h(async (req, res) => {
    const m = moduleById(String(req.params.id));
    if (!m) throw new HttpError(404, "Módulo inexistente");
    if (!moduleAllowed(req.user!, m)) throw forbidden();
    const f = scopeFilters(req.user!, parse(filtersSchema, req.query));
    if (m.detailOf === "client" && !f.client) throw new HttpError(400, "Informe o cliente (client)");
    if (m.detailOf === "project" && !f.project) throw new HttpError(400, "Informe o projeto (project)");
    res.json(await resolveModule(m, f, { indicator: (id) => indicatorAllowed(req.user!, id), chart: (id) => chartAllowed(req.user!, id) }));
  }));

  app.get("/api/indicators/:id", h(async (req, res) => {
    const def = INDICATORS[String(req.params.id)];
    if (!def) throw new HttpError(404, "Indicador inexistente");
    if (!indicatorAllowed(req.user!, def.id)) throw forbidden();
    const f = scopeFilters(req.user!, parse(filtersSchema, req.query));
    const { state } = await dbState();
    res.json({ definition: def, result: await resolveIndicator(def.id, f, state), filters: f, previousPeriod: f.compare ? previousPeriod(f.start, f.end) : null, database: state });
  }));

  app.get("/api/indicators/:id/records", h(async (req, res) => {
    const id = String(req.params.id);
    if (!INDICATORS[id]) throw new HttpError(404, "Indicador inexistente");
    if (!indicatorAllowed(req.user!, id)) throw forbidden();
    const f = scopeFilters(req.user!, parse(filtersSchema, omit(req.query, ["page", "pageSize"])));
    const p = parse(pageSchema, req.query);
    res.json(await resolveRecords(id, f, p, (await dbState()).state));
  }));

  app.get("/api/tables/:id", h(async (req, res) => {
    const def = TABLES[String(req.params.id)];
    if (!def) throw new HttpError(404, "Tabela inexistente");
    if (!tableAllowed(req.user!, def.id)) throw forbidden();
    const f = scopeFilters(req.user!, parse(filtersSchema, omit(req.query, ["page", "pageSize"])));
    const p = parse(pageSchema, req.query);
    if (p.sort && !allowedColumns(req.user!, def).some((c) => c.key === p.sort)) throw new HttpError(400, "Coluna de ordenação inválida");
    const t = await resolveTable(def.id, f, p, (await dbState()).state);
    // Colunas sem permissão são removidas no servidor (ex.: valores financeiros para perfis operacionais).
    res.json({ ...t, rows: stripRows(req.user!, def, t.rows), columns: allowedColumns(req.user!, def).map((c) => c.key) });
  }));

  app.get("/api/dimensions/:dim", h(async (req, res) => {
    const dim = String(req.params.dim) as Dimension;
    if (!DIMENSIONS.includes(dim)) throw new HttpError(404, "Dimensão inexistente");
    const need = DIMENSION_PERMISSION[dim];
    if (need && !can(req, need)) throw forbidden();
    res.json(await resolveDimension(dim, scopeFilters(req.user!, parse(filtersSchema, req.query))));
  }));

  app.use("/api/reports", reportsRouter());

  // Cobertura: tabelas reais dos schemas autorizados (catálogo do PostgreSQL, sem full scan).
  app.get("/api/metadata/schema", h(async (req, res) => {
    if (!can(req, "config.view")) throw forbidden();
    const db = await dbState();
    if (db.state !== "CONNECTED") return res.json({ database: db.state, columns: [], constraints: [], capabilities: null });
    const snapshot = await runtimeSchema();
    res.json({ database: db.state, ...snapshot, capabilities: mappingCapabilities(snapshot) });
  }));

  app.get("/api/metadata/coverage", h(async (req, res) => {
    if (!can(req, "config.view") && !can(req, "qualidade.view")) throw forbidden();
    const db = await dbState();
    if (db.state !== "CONNECTED") return res.json({ database: db.state, schemas: SCHEMAS, tables: [] });
    const tables = await q(
      `select n.nspname as schema, c.relname as table, c.relkind as kind,
              greatest(c.reltuples, 0)::bigint as estimated_rows,
              coalesce(s.last_autoanalyze, s.last_analyze)::text as last_analyze
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
         left join pg_stat_user_tables s on s.relid = c.oid
        where n.nspname = any($1) and c.relkind in ('r','v','m','p')
        order by 1, 2`,
      [Object.values(SCHEMAS)]
    );
    res.json({ database: db.state, schemas: SCHEMAS, tables });
  }));

  app.use("/api", (_req, _res, next) => next(new HttpError(404, "Rota inexistente")));

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, details: err.details });
    const type = (err as { type?: string }).type;
    if (type === "entity.parse.failed") return res.status(400).json({ error: "JSON inválido" });
    if (type === "entity.too.large") return res.status(413).json({ error: "Requisição grande demais" });
    console.error(JSON.stringify({ level: "error", msg: err.message })); // mensagem apenas, sem connection string
    res.status(500).json({ error: "Erro interno" });
  });

  return app;
}


const omit = (o: Record<string, unknown>, keys: string[]) => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)));
