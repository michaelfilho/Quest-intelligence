import { createApp } from "./app.js";
import { closePool, dbState } from "./db.js";
import { closeStore, pruneAudit, store } from "./store.js";

store(); // aplica migrations e perfis padrão antes de aceitar conexões
pruneAudit();
const users = Number(store().prepare("SELECT count(*) n FROM users").get()?.n ?? 0);
if (!users) console.warn(JSON.stringify({ level: "warn", msg: "Nenhum usuário cadastrado. Crie o administrador: npm run user:admin -- <usuario>" }));

const port = Number(process.env.PORT ?? 3333);
const host = process.env.HOST ?? "127.0.0.1"; // no container: HOST=0.0.0.0 (rede interna do Docker)

const server = createApp().listen(port, host, async () => {
  console.log(JSON.stringify({ level: "info", msg: `QUEST RINNE API em http://${host}:${port}`, database: (await dbState()).state }));
});

for (const sig of ["SIGTERM", "SIGINT"] as const) process.on(sig, () => server.close(() => closePool().then(() => (closeStore(), process.exit(0)))));
