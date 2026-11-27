import { createApp } from './app.js';
import { dataDir, readUsers } from './security.js';
const port=Number(process.env.QUEST_DEMO_PORT||4310);
const host=process.env.HOST||'127.0.0.1';
if(!Object.keys(readUsers()).length)console.warn(`Nenhum usuário cadastrado em ${dataDir()}. Crie com: npm run user -- <usuario>`);
if(process.env.NODE_ENV==='production'&&!process.env.QUEST_ADMIN_IPS)console.warn('QUEST_ADMIN_IPS vazio: em produção nenhum IP novo acessa o site (404). Defina o IP do administrador.');
createApp().listen(port,host,()=>console.log(`QUEST INTELLIGENCE API: http://${host}:${port}/api/v1`));
