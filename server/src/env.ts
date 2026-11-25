// Carrega o .env do projeto ANTES de qualquer módulo ler process.env (importar primeiro).
// Regra: variáveis definidas no ambiente (linha de comando, container) prevalecem sobre o .env —
// EXCETO DATABASE_URL: nesta máquina existe uma DATABASE_URL de outro projeto em nível de usuário,
// então a do .env do RINNE sempre vence. Em container não há .env: tudo vem do ambiente.
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

if (process.env.NODE_ENV !== "test") {
  try {
    const file = parseEnv(readFileSync(new URL("../../.env", import.meta.url), "utf8"));
    for (const [k, v] of Object.entries(file)) if (k === "DATABASE_URL" || process.env[k] === undefined) process.env[k] = v;
  } catch {
    /* sem .env */
  }
}
