// Regras de acesso da interface (funções puras). A aplicação real das permissões é testada no backend.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MODULES, TABLES } from "../../shared/catalog";
import { columnPermission, DEFAULT_ROLES, MODULE_PERMISSION } from "../../shared/permissions";
import { NAV, navFor } from "./nav";

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

describe("câmera, microfone e localização", () => {
  const conf = readFileSync(new URL("../nginx.conf.template", import.meta.url), "utf8");
  const headers = readFileSync(new URL("../security-headers.conf", import.meta.url), "utf8");
  const policy = /add_header Permissions-Policy "([^"]+)"/.exec(headers)?.[1] ?? "";

  it("Permissions-Policy bloqueia câmera, microfone e localização em todas as páginas", () => {
    for (const f of ["camera", "microphone", "geolocation"]) expect(policy, f).toContain(`${f}=()`);
    // nenhuma liberação, nem para a própria origem: todo "(...)" da política precisa estar vazio
    expect(policy.split(",").every((d) => /=\(\)$/.test(d.trim()))).toBe(true);
  });
  it("não existe regra por rota nem variável de política no nginx", () => {
    expect(conf).not.toContain("permissions_policy");
    expect(conf).not.toContain("microphone=(self)");
    expect(headers).not.toContain("$");
  });
  it("CSP não libera mídia (áudio/vídeo)", () => {
    expect(headers).toContain("media-src 'none'");
  });
  it("nginx não transforma o Path do cookie já configurado pelo backend", () => {
    expect(conf).not.toContain("proxy_cookie_path");
  });
});
