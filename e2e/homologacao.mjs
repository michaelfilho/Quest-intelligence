// Homologação visual LOCAL do QUEST RINNE com Playwright + Microsoft Edge instalado.
// Pré-requisitos (feitos por scripts/homologar.sh): API + frontend rodando, banco da aplicação TEMPORÁRIO,
// sem PostgreSQL e sem n8n. Variáveis: BASE, ADMIN_USER, ADMIN_TEMP_PASSWORD.
// Saída: e2e/output/*.png + e2e/output/resultado.json (pasta ignorada pelo git).
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const BASE = process.env.BASE ?? "http://localhost:4173";
const EDGE = process.env.EDGE ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const ADMIN = process.env.ADMIN_USER ?? "homolog.admin";
const ADMIN_TEMP = process.env.ADMIN_TEMP_PASSWORD;
const ADMIN_PW = "Homolog-Admin-Senha-2026!";
const OUT = new URL("./output/", import.meta.url);
const outFile = (name) => fileURLToPath(new URL(name, OUT)); // caminho decodificado (pasta com acentos/espaços)
mkdirSync(OUT, { recursive: true });
if (!ADMIN_TEMP) throw new Error("ADMIN_TEMP_PASSWORD não informado");

const results = [];
const consoleIssues = [];
let label = "início";

const browser = await chromium.launch({ executablePath: EDGE, headless: true, args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });

async function newPage(viewport, storageState) {
  const ctx = await browser.newContext({ viewport, locale: "pt-BR", timezoneId: "America/Sao_Paulo", permissions: ["microphone"], acceptDownloads: true, storageState });
  const page = await ctx.newPage();
  page.setDefaultTimeout(12000);
  page.on("console", (m) => m.type() === "error" && consoleIssues.push({ where: label, text: m.text().slice(0, 300) }));
  page.on("pageerror", (e) => consoleIssues.push({ where: label, text: "EXCEÇÃO: " + e.message.slice(0, 300) }));
  page.on("response", (r) => r.status() >= 500 && consoleIssues.push({ where: label, text: `HTTP ${r.status()} ${new URL(r.url()).pathname}` }));
  return { ctx, page };
}

async function check(name, fn) {
  label = name;
  const t = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - t });
    console.log("✔", name);
  } catch (e) {
    results.push({ name, ok: false, error: String(e.message).split("\n")[0].slice(0, 300) });
    console.log("✖", name, "—", String(e.message).split("\n")[0]);
  }
}
const shot = (page, file) => page.screenshot({ path: outFile(file + ".png"), fullPage: true });
const settle = async (page) => {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(250);
};
const noOverflow = async (page) => {
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  if (sw > iw + 1) throw new Error(`rolagem horizontal: ${sw}px > ${iw}px`);
};

async function changePassword(page, current, next) {
  await page.getByText("Defina sua senha").waitFor();
  await page.getByLabel("Senha atual").fill(current);
  await page.getByLabel("Nova senha", { exact: true }).fill(next);
  await page.getByLabel("Confirmar nova senha").fill(next);
  await page.getByRole("button", { name: "Alterar senha" }).click();
}

// ---------------- Desktop (administrador) ----------------
const desk = await newPage({ width: 1440, height: 900 });
const p = desk.page;

await check("login: tela de entrada", async () => {
  await p.goto(BASE);
  await p.getByRole("heading", { name: "Entrar" }).waitFor();
  await shot(p, "01-login");
});
await check("login: credenciais inválidas exibem mensagem genérica", async () => {
  await p.getByLabel("Usuário").fill(ADMIN);
  await p.getByLabel("Senha").fill("senha-errada-123");
  await p.getByRole("button", { name: "Entrar" }).click();
  await p.getByText("Usuário ou senha inválidos.").waitFor();
});
await check("primeiro acesso: troca obrigatória da senha temporária", async () => {
  await p.getByLabel("Senha").fill(ADMIN_TEMP);
  await p.getByRole("button", { name: "Entrar" }).click();
  await shot(p, "02-troca-senha-obrigatoria");
  await changePassword(p, ADMIN_TEMP, ADMIN_PW);
  await p.getByRole("navigation", { name: "Módulos" }).waitFor();
});

const ROUTES = [
  ["/", "Visão geral"], ["/clientes", "Clientes"], ["/clientes/123", "Cliente"], ["/projetos", "Projetos / Jobs"], ["/projetos/987", "Projeto"], ["/rentabilidade", "Rentabilidade"],
  ["/financeiro", "Financeiro"], ["/timesheet", "Timesheet"], ["/departamentos", "Departamentos"], ["/colaboradores", "Colaboradores"], ["/produtividade", "Produtividade"],
  ["/producao", "Produção"], ["/contratado", "Contratado × executado"], ["/qualidade", "Qualidade dos dados"], ["/relatorios", "Central de relatórios"], ["/rinne", "RINNE IA"],
  ["/rinne/voz", "RINNE Voz"], ["/reuniao", "Modo reunião"], ["/configuracoes", "Configurações"], ["/conta", "Minha conta"],
];
for (const [path, title] of ROUTES) {
  await check(`tela ${path}`, async () => {
    await p.goto(BASE + path);
    await p.getByRole("heading", { level: 1, name: new RegExp(title.replace(/[()×/]/g, ".")) }).first().waitFor({ timeout: 15000 });
    await settle(p);
    if (await p.getByText("Erro inesperado").count()) throw new Error("estado de erro na tela");
    await shot(p, "tela" + (path === "/" ? "-visao-geral" : path.replaceAll("/", "-")));
  });
}

await check("sem banco: aviso DATABASE_UNAVAILABLE e nenhum valor inventado", async () => {
  await p.goto(BASE + "/financeiro");
  await p.getByText("DATABASE_UNAVAILABLE").first().waitFor();
  if (await p.locator("text=/R\\$\\s?\\d/").count()) throw new Error("valor monetário exibido sem banco");
});
await check("rastreabilidade: gaveta do indicador abre e fecha", async () => {
  await p.getByTitle("Ver origem, fórmula e registros").first().click();
  await p.getByText("Rastreabilidade do indicador").waitFor();
  await p.getByText("Tabelas de origem").waitFor();
  await shot(p, "rastreabilidade");
  await p.keyboard.press("Escape");
  await p.getByText("Rastreabilidade do indicador").waitFor({ state: "detached" });
});
await check("tabela: ordenação no servidor (aria-sort)", async () => {
  await p.goto(BASE + "/clientes");
  await settle(p);
  const th = p.locator('th:has(button:text-is("Cliente"))').first();
  await th.locator("button").click();
  await settle(p);
  if ((await th.getAttribute("aria-sort")) !== "ascending") throw new Error("aria-sort não mudou");
  await th.locator("button").click();
  await settle(p);
  if ((await th.getAttribute("aria-sort")) !== "descending") throw new Error("ordem não inverteu");
});
await check("filtros globais: período e comparação persistem na URL entre módulos", async () => {
  await p.goto(BASE + "/");
  await p.getByLabel("Período").selectOption({ label: "Ano atual" });
  await p.getByLabel("Comparar com período anterior").check();
  await settle(p);
  if (!/start=\d{4}-01-01/.test(p.url()) || !p.url().includes("compare=1")) throw new Error("URL sem filtros: " + p.url());
  await p.getByRole("link", { name: "Financeiro" }).click();
  await settle(p);
  if (!p.url().includes("compare=1")) throw new Error("filtros perdidos na navegação");
});

await check("RINNE IA: nova conversa, pergunta e indisponibilidade do n8n sem resposta fictícia", async () => {
  await p.goto(BASE + "/rinne");
  await p.getByText("Inteligência da RINNE indisponível").waitFor();
  await p.getByRole("button", { name: "Nova" }).click();
  await p.getByRole("button", { name: "Quanto recebemos neste mês?" }).click();
  await p.getByText(/análise inteligente da RINNE está indisponível/).first().waitFor({ timeout: 20000 });
  await p.getByText("Indicadores consultados (calculados pelo sistema)").first().waitFor();
  await shot(p, "rinne-ia");
});
await check("RINNE IA: renomear conversa", async () => {
  await p.getByRole("button", { name: /^Renomear/ }).first().click({ force: true });
  await p.getByLabel("Título da conversa").fill("Receita do mês");
  await p.getByRole("button", { name: "Salvar título" }).click();
  await p.getByText("Receita do mês").first().waitFor();
});

await check("RINNE Voz: consentimento, captura de segmento (microfone falso), envio e estado", async () => {
  await p.goto(BASE + "/rinne/voz");
  await p.getByRole("button", { name: "Nova" }).click();
  const consent = p.getByLabel(/Autorizo o uso do microfone nesta conversa/);
  await consent.check();
  await p.getByRole("button", { name: "Ativar microfone" }).click();
  await p.getByRole("button", { name: "Falar" }).waitFor({ timeout: 10000 });
  await p.getByRole("button", { name: "Falar" }).click();
  await p.getByText("Ouvindo…").waitFor();
  await p.waitForTimeout(1500);
  await p.locator('button:has-text("Enviar")').first().click();
  await p.getByText(/\[áudio \d+ s\]/).waitFor({ timeout: 20000 });
  await p.getByText(/análise inteligente da RINNE está indisponível/).first().waitFor({ timeout: 20000 });
  await shot(p, "rinne-voz");
  await p.getByRole("button", { name: "Desligar microfone" }).click();
  await p.getByRole("button", { name: "Ativar microfone" }).waitFor();
});

await check("Modo reunião: fluxo completo com máquina de estados e relatório", async () => {
  await p.goto(BASE + "/reuniao");
  await p.getByPlaceholder("Título da reunião (opcional)").fill("Reunião de homologação");
  await p.getByRole("button", { name: "Iniciar modo reunião" }).click();
  await p.getByLabel(/Autorizo o uso do microfone para transcrição/).check();
  await p.getByRole("button", { name: /Continuar com microfone/ }).click();
  await p.getByText("Qual departamento você deseja analisar?").waitFor();
  await p.getByLabel("Departamento").fill("Criação");
  await p.getByRole("button", { name: "Analisar departamento" }).click();
  await p.getByRole("button", { name: "Este mês" }).click();
  await p.getByText(/Analisando Criação/).waitFor();
  await p.getByLabel("Tipo de registro").selectOption("decision");
  await p.getByLabel("Registro", { exact: true }).fill("Priorizar a campanha do cliente X");
  await p.getByRole("button", { name: "Registrar" }).click();
  await p.getByText("Priorizar a campanha do cliente X").first().waitFor();
  await p.getByRole("button", { name: "Iniciar captura" }).click();
  await p.getByText("Capturando").waitFor();
  await p.getByRole("button", { name: "Parar captura" }).click();
  await p.getByText(/total na reunião: 1/).waitFor({ timeout: 20000 });
  await p.getByLabel("Comando ou pergunta").fill("Quais entregas atrasaram?");
  await p.getByRole("button", { name: "Enviar" }).click();
  await p.getByText(/indisponível/).first().waitFor();
  await shot(p, "reuniao-analise");
  await p.getByRole("button", { name: "Departamento finalizado" }).click();
  await p.getByText(/Qual é o próximo departamento/).waitFor();
  await p.getByRole("button", { name: "Encerrar reunião" }).click();
  await p.getByText("Relatório da reunião").waitFor();
  const [dl] = await Promise.all([p.waitForEvent("download"), p.getByRole("button", { name: "Markdown" }).click()]);
  if (!/\.md$/.test(dl.suggestedFilename())) throw new Error("download md: " + dl.suggestedFilename());
  const [popup] = await Promise.all([p.waitForEvent("popup"), p.getByRole("link", { name: "PDF (imprimir)" }).click()]);
  await popup.getByText("Priorizar a campanha do cliente X").waitFor();
  await popup.screenshot({ path: outFile("reuniao-impressao.png"), fullPage: true });
  await popup.close();
  await shot(p, "reuniao-encerrada");
});

await check("Relatórios: pré-visualização honesta e exportação XLSX/CSV/MD", async () => {
  await p.goto(BASE + "/relatorios");
  await p.getByRole("button", { name: /Relatório financeiro/ }).click();
  await p.getByText("DADOS INDISPONÍVEIS").first().waitFor();
  for (const fmt of ["XLSX", "CSV", "Markdown"]) {
    const [dl] = await Promise.all([p.waitForEvent("download"), p.getByRole("button", { name: fmt }).click()]);
    if (!dl.suggestedFilename().startsWith("rinne_financeiro_")) throw new Error(`${fmt}: ${dl.suggestedFilename()}`);
  }
  const [popup] = await Promise.all([p.waitForEvent("popup"), p.getByRole("link", { name: "PDF" }).click()]);
  await popup.getByText("DADOS INDISPONÍVEIS").first().waitFor();
  await popup.screenshot({ path: outFile("relatorio-impressao.png"), fullPage: true });
  await popup.close();
  await shot(p, "relatorios");
});

let restrictedTemp = null;
await check("Configurações: todas as seções abrem", async () => {
  await p.goto(BASE + "/configuracoes");
  for (const s of ["Usuários", "Perfis e permissões", "Controle de acesso por IP", "Sessões ativas", "Histórico de acessos", "Segurança", "Integrações", "Banco de dados", "Inteligência RINNE", "Voz", "Retenção de reuniões", "Configurações gerais"]) {
    await p.getByRole("navigation", { name: "Seções de configurações" }).getByRole("button", { name: s, exact: true }).click();
    await settle(p);
    if (await p.getByText("Erro inesperado").count()) throw new Error("erro na seção " + s);
    await shot(p, "config-" + s.normalize("NFD").replace(/[^\w]+/g, "-").toLowerCase());
  }
});
await check("Configurações: teste de conectividade do n8n informa indisponibilidade", async () => {
  await p.getByRole("button", { name: "Inteligência RINNE" }).click();
  await p.getByRole("button", { name: "Testar conectividade" }).click();
  await p.getByText(/unavailable/).first().waitFor();
});
await check("Configurações: criar usuário com perfil restrito (Analista)", async () => {
  await p.getByRole("button", { name: "Usuários", exact: true }).click();
  await p.getByRole("button", { name: "Novo usuário" }).click();
  await p.getByLabel("Usuário (login)").fill("analista.homolog");
  await p.getByLabel("Nome").fill("Analista de Homologação");
  await p.getByLabel("Perfil").selectOption({ label: "Analista" });
  await p.getByRole("button", { name: "Criar e gerar senha temporária" }).click();
  await p.getByText("Senha temporária de analista.homolog").waitFor();
  restrictedTemp = (await p.locator("code").first().textContent())?.trim();
  if (!restrictedTemp || restrictedTemp.length < 12) throw new Error("senha temporária não exibida");
  await shot(p, "config-usuario-criado");
});

// ---------------- Notebook e celular (mesma sessão) ----------------
const state = await desk.ctx.storageState();
const note = await newPage({ width: 1280, height: 720 }, state);
await check("notebook 1280×720: visão geral e financeiro sem rolagem horizontal", async () => {
  for (const path of ["/", "/financeiro"]) {
    await note.page.goto(BASE + path);
    await settle(note.page);
    await noOverflow(note.page);
    await shot(note.page, "notebook" + (path === "/" ? "-visao-geral" : path.replaceAll("/", "-")));
  }
});
const mob = await newPage({ width: 390, height: 844 }, state);
await check("celular 390×844: menu, telas principais e ausência de rolagem horizontal", async () => {
  for (const path of ["/", "/rinne", "/reuniao", "/relatorios", "/configuracoes"]) {
    await mob.page.goto(BASE + path);
    await settle(mob.page);
    await noOverflow(mob.page);
    await shot(mob.page, "celular" + (path === "/" ? "-visao-geral" : path.replaceAll("/", "-")));
  }
  await mob.page.goto(BASE + "/");
  await mob.page.getByRole("button", { name: "Abrir menu" }).click();
  await mob.page.getByRole("navigation", { name: "Módulos" }).getByRole("link", { name: "Financeiro" }).waitFor();
  await shot(mob.page, "celular-menu-aberto");
  await mob.page.getByRole("button", { name: "Fechar menu" }).click();
});

// ---------------- Usuário restrito ----------------
const rest = await newPage({ width: 1440, height: 900 });
await check("perfil restrito: troca de senha, menu filtrado e bloqueio por padrão", async () => {
  const r = rest.page;
  await r.goto(BASE);
  await r.getByLabel("Usuário").fill("analista.homolog");
  await r.getByLabel("Senha").fill(restrictedTemp);
  await r.getByRole("button", { name: "Entrar" }).click();
  await changePassword(r, restrictedTemp, "Analista-Homolog-2026!");
  const nav = r.getByRole("navigation", { name: "Módulos" });
  await nav.waitFor();
  for (const forbidden of ["Financeiro", "Rentabilidade", "Configurações", "RINNE IA", "Modo reunião"]) if (await nav.getByRole("link", { name: forbidden, exact: true }).count()) throw new Error(`item proibido no menu: ${forbidden}`);
  for (const allowed of ["Produção", "Projetos / Jobs", "Qualidade dos dados"]) await nav.getByRole("link", { name: allowed, exact: true }).waitFor();
  await shot(r, "restrito-menu");
  for (const path of ["/financeiro", "/rentabilidade", "/configuracoes", "/rinne", "/reuniao"]) {
    await r.goto(BASE + path);
    await r.getByText(/Sem permissão para/).waitFor();
  }
  await shot(r, "restrito-sem-permissao");
  await r.goto(BASE + "/clientes");
  await settle(r);
  if (await r.locator('th:has-text("Faturado")').count()) throw new Error("coluna financeira visível ao analista");
});
await check("logout encerra a sessão", async () => {
  await rest.page.goto(BASE + "/");
  await rest.page.getByRole("button", { name: "Sair" }).first().click();
  await rest.page.getByRole("heading", { name: "Entrar" }).waitFor();
});

await browser.close();

// Erros de console esperados: 401 de /api/auth/me antes do login e 403 de recursos negados de propósito.
const unexpected = consoleIssues.filter((c) => !/status of 40[13]/.test(c.text));
const summary = { base: BASE, when: new Date().toISOString(), passed: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results, consoleIssues, unexpectedConsoleErrors: unexpected };
writeFileSync(new URL("resultado.json", OUT), JSON.stringify(summary, null, 2));
console.log(`\n${summary.passed} aprovados · ${summary.failed} reprovados · ${consoleIssues.length} mensagens de console (${unexpected.length} inesperadas)`);
for (const u of unexpected) console.log("  console:", u.where, "→", u.text);
process.exit(summary.failed || unexpected.length ? 1 : 0);
