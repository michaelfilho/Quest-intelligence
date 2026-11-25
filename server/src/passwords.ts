// Senhas com Argon2id (node:crypto, Node ≥ 24.7). Formato PHC: $argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash>
// Parâmetros = mínimo recomendado pela OWASP (19 MiB, 2 iterações, paralelismo 1).
import { argon2, randomBytes, timingSafeEqual } from "node:crypto";

if (typeof argon2 !== "function") throw new Error("Node.js sem crypto.argon2 — use Node 24.7+.");

const PARAMS = { memory: 19456, passes: 2, parallelism: 1, tagLength: 32 };
const b64 = (b: Buffer) => b.toString("base64").replace(/=+$/, "");

function derive(password: string, nonce: Buffer, p: typeof PARAMS) {
  return new Promise<Buffer>((resolve, reject) =>
    argon2("argon2id", { message: password, nonce, ...p }, (err, key) => (err ? reject(err) : resolve(key)))
  );
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await derive(password, salt, PARAMS);
  return `$argon2id$v=19$m=${PARAMS.memory},t=${PARAMS.passes},p=${PARAMS.parallelism}$${b64(salt)}$${b64(key)}`;
}

export async function verifyPassword(password: string, phc: string) {
  const m = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/.exec(phc);
  if (!m) return false;
  const expected = Buffer.from(m[5], "base64");
  const key = await derive(password, Buffer.from(m[4], "base64"), { memory: +m[1], passes: +m[2], parallelism: +m[3], tagLength: expected.length });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

// Usuário inexistente também paga o custo do Argon2 (sem diferença de tempo que revele usuários).
let dummy: Promise<string> | null = null;
export const dummyHash = () => (dummy ??= hashPassword(randomBytes(16).toString("hex")));

export function passwordProblem(password: string, username: string, minLength: number): string | null {
  if (typeof password !== "string" || password.length < minLength) return `A senha deve ter pelo menos ${minLength} caracteres.`;
  if (password.length > 128) return "A senha deve ter no máximo 128 caracteres.";
  if (password.toLowerCase().includes(username.toLowerCase())) return "A senha não pode conter o nome de usuário.";
  if (new Set(password).size < 6) return "A senha é repetitiva demais.";
  return null;
}

/** Senha temporária legível (entregue uma única vez ao administrador; troca obrigatória no 1º acesso). */
export const temporaryPassword = () => randomBytes(12).toString("base64url");
