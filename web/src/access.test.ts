// Regras de acesso da interface (funções puras). A aplicação real das permissões é testada no backend.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MODULES, TABLES } from "../../shared/catalog";
import { columnPermission, DEFAULT_ROLES, MIC_ROUTES, MODULE_PERMISSION } from "../../shared/permissions";
import { isMicRoute, NAV, navFor } from "./nav";

describe("menu por perfil", () => {
  it("sem permissões, nenhum item (bloqueio por padrão)", () => {
    expect(navFor(new Set())).toEqual([]);
  });
  it("cada perfil vê exatamente os módulos das suas permissões", () => {
    for (const r of DEFAULT_ROLES) {
      const ids = navFor(new Set(r.permissions)).map((n) => n.id);
      for (const m of MODULES.filter((x) => !x.detailOf)) expect(ids.includes(m.id), `${r.id}/${m.id}`).toBe(r.permissions.includes(MODULE_PERMISSION[m.id]));
    }
  });
  it("administração só aparece com permissões administrativas", () => {
    const consulta = DEFAULT_ROLES.find((r) => r.id === "consulta")!;
    expect(navFor(new Set(consulta.permissions)).some((n) => n.id === "configuracoes")).toBe(false);
    expect(navFor(new Set(["auditoria.view"])).map((n) => n.id)).toEqual(["configuracoes"]);
  });
  it("todo item de menu exige ao menos uma permissão", () => {
    for (const n of NAV) expect(n.anyOf.length).toBeGreaterThan(0);
  });
});

describe("colunas sensíveis", () => {
  it("valores financeiros e margens exigem permissão própria", () => {
    expect(columnPermission("faturado")).toBe("financeiro.view");
    expect(columnPermission("margem")).toBe("rentabilidade.view");
    expect(columnPermission("cliente")).toBeNull();
    // Nenhuma tabela de cliente expõe valores sem exigir permissão financeira.
    for (const c of TABLES.clientes.columns.filter((c) => c.type === "BRL")) expect(columnPermission(c.key)).not.toBeNull();
  });
});

describe("microfone", () => {
  it("só as rotas de voz/reunião liberam o microfone", () => {
    expect(isMicRoute("/rinne/voz")).toBe(true);
    expect(isMicRoute("/reuniao")).toBe(true);
    for (const p of ["/", "/financeiro", "/rinne", "/reuniao-falsa", "/rinne/vozes"]) expect(isMicRoute(p), p).toBe(false);
  });
  it("a regra do nginx (Permissions-Policy) cobre exatamente as mesmas rotas", () => {
    const conf = readFileSync(new URL("../nginx.conf.template", import.meta.url), "utf8");
    const m = /~\^(\S+)\s+"camera=\(\), microphone=\(self\)/.exec(conf);
    expect(m).not.toBeNull();
    const re = new RegExp("^" + m![1]);
    for (const r of MIC_ROUTES) {
      expect(re.test(r), r).toBe(true);
      expect(re.test(r + "?x=1"), r).toBe(true);
    }
    for (const p of ["/", "/financeiro", "/rinne", "/reuniao-falsa", "/rinne/vozes"]) expect(re.test(p), p).toBe(false);
    const headers = readFileSync(new URL("../security-headers.conf", import.meta.url), "utf8");
    expect(headers).toMatch(/Permissions-Policy \$permissions_policy/);
    expect(conf).toMatch(/default\s+"camera=\(\), microphone=\(\), geolocation=\(\)/);
  });
});
