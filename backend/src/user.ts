// Cria um administrador ou redefine a senha. Uso: npm run user -- <usuario>
// A senha é gerada e exibida uma única vez; para escolher, defina QUEST_PASSWORD (mínimo 12 caracteres).
import { randomBytes } from 'node:crypto';
import { saveUser } from './security.js';

const username = process.argv[2] ?? '';
const password = process.env.QUEST_PASSWORD || randomBytes(15).toString('base64url');
if (!/^[a-zA-Z0-9._-]{3,64}$/.test(username) || password.length < 12 || password.length > 128) {
  console.error('Uso: npm run user -- <usuario>  (3–64 caracteres; QUEST_PASSWORD opcional com 12–128 caracteres)');
  process.exit(1);
}
await saveUser(username, password);
console.log(`Usuário "${username.toLowerCase()}" salvo.`);
if (!process.env.QUEST_PASSWORD) console.log(`Senha (exibida só agora): ${password}`);
