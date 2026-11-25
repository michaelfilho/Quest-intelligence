// Cria (ou recupera) um administrador. Requer acesso ao terminal do servidor — é o caminho de recuperação.
// Uso: npm run user:admin -- <usuario> ["Nome Completo"]
// A senha temporária é exibida UMA vez neste terminal; a troca é obrigatória no primeiro acesso.
import { hashPassword, temporaryPassword } from "./passwords.js";
import { audit, closeStore, now, store } from "./store.js";

const [username, name] = process.argv.slice(2);
if (!username || !/^[a-zA-Z0-9._-]{3,64}$/.test(username)) {
  console.error('Uso: npm run user:admin -- <usuario> ["Nome Completo"]   (3–64 caracteres: letras, números, . _ -)');
  process.exit(1);
}

const temp = temporaryPassword();
const hash = await hashPassword(temp);
const t = now();
const existing = store().prepare("SELECT id FROM users WHERE username = ?").get(username);
if (existing) {
  store().prepare("UPDATE users SET password_hash = ?, role_id = 'admin', active = 1, must_change_password = 1, denies = '[]', updated_at = ? WHERE id = ?").run(hash, t, existing.id);
  store().prepare("DELETE FROM sessions WHERE user_id = ?").run(existing.id);
  audit({ event: "user.password_reset", actor: "cli", target: username, details: { via: "cli", role: "admin" } });
  console.log(`Administrador "${username}" recuperado (sessões anteriores revogadas).`);
} else {
  store().prepare("INSERT INTO users (username, name, password_hash, role_id, must_change_password, created_at, updated_at) VALUES (?, ?, ?, 'admin', 1, ?, ?)").run(username, name || username, hash, t, t);
  audit({ event: "user.create", actor: "cli", target: username, details: { via: "cli", roleId: "admin" } });
  console.log(`Administrador "${username}" criado.`);
}
console.log(`Senha temporária (exibida só agora): ${temp}`);
console.log("No primeiro acesso o sistema exigirá a troca da senha.");
closeStore();
