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
const requested = [];
let label = "início";

const browser = await chromium.launch({ executablePath: EDGE, headless: true });

async function newPage(viewport, storageState) {
  const ctx = await browser.newContext({ viewport, locale: "pt-BR", timezoneId: "America/Sao_Paulo", acceptDownloads: true, storageState });
  const page = await ctx.newPage();
  page.setDefaultTimeout(12000);
  page.on("request", r => requested.push(new URL(r.url()).pathname));
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
  await p.setViewportSize({ width: 1672, height: 941 });
  await p.goto(BASE + "/?utm_source=chatgpt.com");
  await p.getByRole("heading", { name: "Acesso Restrito" }).waitFor();
  if(p.url()!==BASE.replace(/\/$/,'')+'/')throw new Error('rastreador não removido do exemplo');
  await shot(p, "01-login");
  await p.setViewportSize({ width: 1440, height: 900 });
});
await check('URL: limpa antes do Router e preserva filtros, rota, fragmento e histórico',async()=>{
  await p.addInitScript(()=>{
    const original=history.replaceState.bind(history);
    window.__urlReplacements=[];
    history.replaceState=(state,title,url)=>{window.__urlReplacements.push({before:location.href,url:String(url),state,length:history.length});return original(state,title,url);};
  });
  let documents=0;const count=request=>{if(request.isNavigationRequest()&&request.frame()===p.mainFrame())documents++;};
  p.on('request',count);
  await p.goto(BASE+'/projetos/123?utm_source=x&start=2026-01-01&client=10&gclid=y#atividade');
  await p.getByRole('heading',{name:'Acesso Restrito'}).waitFor();
  const records=await p.evaluate(()=>window.__urlReplacements);
  const expected=new URL(BASE+'/projetos/123?start=2026-01-01&client=10#atividade');
  if(p.url()!==expected.href||documents!==1)throw new Error('rota/filtros/fragmento alterados ou página recarregada');
  if(records[0]?.url!==expected.pathname+expected.search+expected.hash||records[0]?.state!==null)throw new Error('limpeza não precedeu inicialização do Router');
  if(await p.evaluate(()=>history.length)!==records[0].length)throw new Error('limpeza adicionou entrada ao histórico');
  p.off('request',count);await p.goto(BASE+'/');
});
await check('login: senha visível por ação explícita e layout no celular',async()=>{
  const password=p.getByLabel('Senha',{exact:true});await password.fill('Teste-local-123');
  if(await password.getAttribute('type')!=='password')throw new Error('senha exposta inicialmente');
  await p.getByRole('button',{name:'Mostrar senha',exact:true}).click();
  if(await password.getAttribute('type')!=='text'||await password.inputValue()!=='Teste-local-123')throw new Error('alternância alterou a senha');
  await p.getByRole('button',{name:'Ocultar senha',exact:true}).click();await password.fill('');
  await p.setViewportSize({width:390,height:844});await noOverflow(p);await shot(p,'01-login-mobile');
  await p.setViewportSize({width:1440,height:900});
});
await check("login: credenciais inválidas exibem mensagem genérica", async () => {
  await p.getByLabel("Usuário").fill(ADMIN);
  await p.getByLabel("Senha", { exact: true }).fill("senha-errada-123");
  await p.getByRole("button", { name: "Entrar" }).click();
  await p.getByText("Usuário ou senha inválidos.").waitFor();
});
await check("primeiro acesso: troca obrigatória da senha temporária", async () => {
  await p.getByLabel("Senha", { exact: true }).fill(ADMIN_TEMP);
  await p.getByRole("button", { name: "Entrar" }).click();
  await shot(p, "02-troca-senha-obrigatoria");
  await changePassword(p, ADMIN_TEMP, ADMIN_PW);
  await p.getByRole("navigation", { name: "Módulos" }).waitFor();
});

const ROUTES = [
  ["/", "Visão geral"], ["/clientes", "Clientes"], ["/clientes/123", "Cliente"], ["/projetos", "Projetos"], ["/projetos/987", "Projeto"], ["/rentabilidade", "Rentabilidade"],
  ["/financeiro", "Financeiro"], ["/timesheet", "Timesheet"], ["/departamentos", "Departamentos"], ["/colaboradores", "Colaboradores"], ["/produtividade", "Produtividade e Capacidade"],
  ["/producao", "Produção"], ["/contratado", "Contratado × executado"], ["/contratos", "Contratos e Escopos"], ["/capacidade", "Capacidade operacional"], ["/eficiencia", "Eficiência"], ["/qualidade", "Integrações e Qualidade"], ["/relatorios", "Central de relatórios"], ["/configuracoes", "Configurações"], ["/conta", "Minha conta"],
  ['/dre','DRE Gerencial'],['/fluxo-caixa','Fluxo de Caixa'],['/alertas','Alertas'],['/departamentos/A','Departamentos'],['/colaboradores/1','Colaboradores'],
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

await check("escopo 1.0: sem IA, voz ou reunião no menu nem nas rotas", async () => {
  await p.goto(BASE + "/");
  const nav = p.getByRole("navigation", { name: "Módulos" });
  for (const gone of ["RINNE IA", "RINNE Voz", "Modo reunião"]) if (await nav.getByRole("link", { name: gone }).count()) throw new Error("ainda no menu: " + gone);
  for (const path of ["/rinne", "/rinne/voz", "/reuniao"]) {
    await p.goto(BASE + path);
    await p.getByText("Página não encontrada").first().waitFor();
  }
});
await check("sem banco: estado gerencial curto e nenhum valor inventado", async () => {
  await p.goto(BASE + "/financeiro");
  await p.getByText('Integração pendente').first().waitFor();
  if (await p.locator("text=/R\\$\\s?\\d/").count()) throw new Error("valor monetário exibido sem banco");
});
await check("rastreabilidade: gaveta do indicador abre e fecha", async () => {
  await p.getByTitle("Ver origem, fórmula e registros").first().click();
  await p.getByText('Sobre o indicador').waitFor();
  await p.getByText('Como é calculado').waitFor();
  await shot(p, "rastreabilidade");
  await p.keyboard.press("Escape");
  await p.getByText('Sobre o indicador').waitFor({state:'detached'});
});
await check("tabela sem banco: indisponibilidade clara sem simular linhas", async () => {
  await p.goto(BASE + "/clientes");
  await settle(p);
  const th = p.getByRole('heading',{name:'Clientes',level:3,exact:true});
  // Tabelas abaixo da dobra agora são consultadas apenas quando entram no viewport.
  for(let i=0;i<5&&!await th.count();i++){
    await p.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
    await p.waitForTimeout(250);
  }
  await th.waitFor();
  await p.getByText('Integração indisponível').first().waitFor();
});
await check("filtros globais: período e comparação persistem na URL entre módulos", async () => {
  await p.goto(BASE + "/");
  await p.getByLabel("Período").selectOption({ label: "Ano atual" });
  await settle(p);
  const tableReads = requested.filter(path => path.includes("/api/tables/")).length;
  await p.getByLabel("Comparar com período anterior").check();
  await settle(p);
  if (requested.filter(path => path.includes("/api/tables/")).length !== tableReads) throw new Error("comparação duplicou consultas de linhas atuais");
  if (!/start=\d{4}-01-01/.test(p.url()) || !p.url().includes("compare=1")) throw new Error("URL sem filtros: " + p.url());
  await p.getByRole("link", { name: "Financeiro" }).click();
  await settle(p);
  if (!p.url().includes("compare=1")) throw new Error("filtros perdidos na navegação");
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
  for (const s of ["Usuários", "Perfis e permissões", "Controle de acesso por IP", "Sessões ativas", "Histórico de acessos", "Segurança", "Integrações", "Banco de dados", "Configurações gerais"]) {
    await p.getByRole("navigation", { name: "Seções de configurações" }).getByRole("button", { name: s, exact: true }).click();
    await settle(p);
    if (await p.getByText("Erro inesperado").count()) throw new Error("erro na seção " + s);
    await shot(p, "config-" + s.normalize("NFD").replace(/[^\w]+/g, "-").toLowerCase());
  }
});
await check("Configurações: criar usuário com perfil restrito (Analista)", async () => {
  await p.getByRole("button", { name: "Usuários", exact: true }).click();
  await p.getByRole("button", { name: "Novo usuário" }).click();
  await p.getByLabel("Usuário (login)").fill("analista.homolog");
  await p.getByLabel("Nome").fill("Analista de Homologação");
  await p.getByLabel("Perfil").selectOption({ label: "Analista" });
  await p.getByRole("button", { name: "Criar e gerar senha temporária" }).click();
  await p.getByText("Senha temporária de analista.homolog").waitFor();
  // Caixa da senha temporária (a mesma que o administrador copia); o formato é validado para não capturar outro texto.
  restrictedTemp = (await p.locator("div.border-q-orange:has-text(\"Senha temporária de analista.homolog\") code").first().textContent())?.trim();
  if (!restrictedTemp || !/^[A-Za-z0-9_-]{16}$/.test(restrictedTemp)) throw new Error("senha temporária inválida/não exibida: " + restrictedTemp);
  await shot(p, "config-usuario-criado");
});

// ---------------- Notebook e celular (mesma sessão) ----------------
const state = await desk.ctx.storageState();
await check('carregamento progressivo: cards não aguardam gráficos lentos',async()=>{
  const progressive=await newPage({width:1440,height:900},state);
  try{
    await progressive.page.route('**/api/charts/**',async route=>{
      await new Promise(resolve=>setTimeout(resolve,2000));
      await route.continue().catch(()=>{});
    });
    await progressive.page.goto(BASE+'/capacidade');
    await progressive.page.locator('[title^="Consultado em"]').first().waitFor({timeout:1500});
    await progressive.page.unrouteAll({behavior:'wait'});
  }finally{await progressive.ctx.close();}
});
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
  for (const path of ["/", "/financeiro", "/clientes", "/relatorios", "/configuracoes"]) {
    await mob.page.goto(BASE + path);
    await settle(mob.page);
    await noOverflow(mob.page);
    await shot(mob.page, "celular" + (path === "/" ? "-visao-geral" : path.replaceAll("/", "-")));
  }
  await mob.page.goto(BASE + "/");
  await mob.page.getByRole("button", { name: "Abrir menu" }).click();
  await mob.page.getByRole("navigation", { name: "Módulos" }).getByRole("link", { name: "Financeiro" }).waitFor();
  await shot(mob.page, "celular-menu-aberto");
  // O centro do botão de fechar fica sob o painel aberto: o toque do usuário é na área escurecida, à direita.
  await mob.page.getByRole("button", { name: "Fechar menu" }).click({ position: { x: 350, y: 400 } });
  await mob.page.getByRole("button", { name: "Abrir menu" }).waitFor();
});

// ---------------- Usuário restrito ----------------
const rest = await newPage({ width: 1440, height: 900 });
await check("perfil restrito: troca de senha, menu filtrado e bloqueio por padrão", async () => {
  const r = rest.page;
  await r.goto(BASE + "/");
  await r.getByLabel("Usuário").fill("analista.homolog");
  await r.getByLabel("Senha", { exact: true }).fill(restrictedTemp);
  await r.getByRole("button", { name: "Entrar" }).click();
  await changePassword(r, restrictedTemp, "Analista-Homolog-2026!");
  const nav = r.getByRole("navigation", { name: "Módulos" });
  await nav.waitFor();
  for (const forbidden of ["Financeiro", "Rentabilidade", "Configurações"]) if (await nav.getByRole("link", { name: forbidden, exact: true }).count()) throw new Error(`item proibido no menu: ${forbidden}`);
  for (const allowed of ["Produção", "Projetos", "Integrações e Qualidade"]) await nav.getByRole("link", { name: allowed }).waitFor();
  await shot(r, "restrito-menu");
  for (const path of ["/financeiro", "/rentabilidade", "/configuracoes"]) {
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
  await rest.page.getByRole("heading", { name: "Acesso Restrito" }).waitFor();
  if ((await rest.ctx.cookies()).some(c => c.name === "rinne_sid")) throw new Error("cookie não removido no mesmo Path");
});

await check("base pública: API, assets e cookie não duplicam prefixos", async () => {
  const prefix = new URL(BASE).pathname.replace(/\/$/, "");
  const cookies = (await desk.ctx.cookies()).filter(c => c.name === "rinne_sid");
  if (cookies.length !== 1 || cookies[0].path !== (prefix + "/")) throw new Error("Path do cookie diverge da base pública");
  if (prefix && requested.some(path => path.startsWith("/api/") || path.startsWith("/assets/") || path.includes(prefix + prefix + "/"))) throw new Error("URL saiu da base pública ou duplicou prefixo");
  if (!requested.some(path => path.startsWith(prefix + "/api/"))) throw new Error("API pública não foi consultada");
});

await browser.close();

// Erros de console esperados: 401 de /api/auth/me antes do login e 403 de recursos negados de propósito.
const unexpected = consoleIssues.filter((c) => !/status of 40[13]/.test(c.text));
const summary = { base: BASE, when: new Date().toISOString(), passed: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results, consoleIssues, unexpectedConsoleErrors: unexpected };
writeFileSync(new URL("resultado.json", OUT), JSON.stringify(summary, null, 2));
console.log(`\n${summary.passed} aprovados · ${summary.failed} reprovados · ${consoleIssues.length} mensagens de console (${unexpected.length} inesperadas)`);
for (const u of unexpected) console.log("  console:", u.where, "→", u.text);
process.exit(summary.failed || unexpected.length ? 1 : 0);
