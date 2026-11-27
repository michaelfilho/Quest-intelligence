// Cria (ou recupera) um administrador. Requer acesso ao terminal do servidor — é o caminho de recuperação.
// Uso: npm run user:admin -- <usuario> ["Nome Completo"]
// A senha temporária é exibida UMA vez neste terminal; a troca é obrigatória no primeiro acesso.
import { hashPassword, temporaryPassword } from "./passwords.js";
import { audit, closeStore, get, run, seedRoles } from "./store.js";

const [username, name] = process.argv.slice(2);
if (!username || !/^[a-zA-Z0-9._-]{3,64}$/.test(username)) {
  console.error('Uso: npm run user:admin -- <usuario> ["Nome Completo"]   (3–64 caracteres: letras, números, . _ -)');
  process.exit(1);
}

await seedRoles();
const temp = temporaryPassword();
const hash = await hashPassword(temp);
const existing = await get("SELECT id FROM app.users WHERE lower(username) = lower(?)", username);
if (existing) {
  await run("UPDATE app.users SET password_hash = ?, role_id = 'admin', active = true, must_change_password = true, denies = '[]', updated_at = now() WHERE id = ?", hash, existing.id);
  await run("DELETE FROM app.sessions WHERE user_id = ?", existing.id);
  await audit({ event: "user.password_reset", actor: "cli", target: username, details: { via: "cli", role: "admin" } });
  console.log(`Administrador "${username}" recuperado (sessões anteriores revogadas).`);
} else {
  await run("INSERT INTO app.users (username, name, password_hash, role_id) VALUES (?, ?, ?, 'admin')", username, name || username, hash);
  await audit({ event: "user.create", actor: "cli", target: username, details: { via: "cli", roleId: "admin" } });
  console.log(`Administrador "${username}" criado.`);
}
await run("DELETE FROM app.login_locks"); // recuperação pelo terminal também zera os bloqueios por tentativas
console.log(`Senha temporária (exibida só agora): ${temp}`);
console.log("No primeiro acesso o sistema exigirá a troca da senha.");
await closeStore();
