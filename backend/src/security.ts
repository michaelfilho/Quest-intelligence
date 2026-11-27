// Controle de acesso: bloqueio por IP (404), login com limite progressivo, sessão em cookie e painel de IPs.
// users.json é escrito só pelo CLI (src/user.ts); access.json é escrito só pelo servidor.
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { isIP } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type NextFunction, type Request, type Response } from 'express';

export const MAX_ATTEMPTS = 3;
export const BASE_LOCK_MS = 15 * 60_000;
const IDLE_MS = 30 * 60_000;
const SESSION_MS = 12 * 3_600_000;
const MAX_PENDING = 2000;
const COOKIE = 'quest_sid';

export const dataDir = () => process.env.QUEST_DATA_DIR || fileURLToPath(new URL('../data', import.meta.url));

function readJson<T>(file: string, fallback: T): T {
  try { return JSON.parse(readFileSync(file, 'utf8')) as T; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
    throw error; // arquivo corrompido: falha fechada
  }
}
function writeJson(dir: string, name: string, value: unknown) {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, name);
  writeFileSync(`${file}.tmp`, JSON.stringify(value, null, 2), { mode: 0o600 });
  renameSync(`${file}.tmp`, file);
}

// ---------------- Senhas (scrypt, parâmetros OWASP) ----------------
const derive = (password: string, salt: Buffer) => new Promise<Buffer>((resolve, reject) =>
  scrypt(password, salt, 32, { N: 2 ** 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key)));
export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  return `${salt.toString('base64')}:${(await derive(password, salt)).toString('base64')}`;
}
async function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(':');
  const expected = Buffer.from(hash ?? '', 'base64');
  const key = await derive(password, Buffer.from(salt ?? '', 'base64'));
  return expected.length === key.length && timingSafeEqual(key, expected);
}
export const readUsers = (dir = dataDir()) => readJson<Record<string, string>>(join(dir, 'users.json'), {});
export async function saveUser(username: string, password: string, dir = dataDir()) {
  writeJson(dir, 'users.json', { ...readUsers(dir), [username.toLowerCase()]: await hashPassword(password) });
}

// ---------------- IPs ----------------
export function normalizeIp(ip = '') {
  const value = ip.trim().toLowerCase().replace(/%.*$/, '');
  return /^::ffff:\d+\.\d+\.\d+\.\d+$/.test(value) ? value.slice(7) : value;
}
export type IpStatus = 'pending' | 'allowed' | 'blocked';
export interface IpRecord { status: IpStatus; firstSeen: number; lastSeen: number; userAgent: string; fails: number; locks: number; lockedUntil: number; lastUser: string }

export interface SecurityOptions { dir?: string; adminIps?: string[]; secureCookie?: boolean; now?: () => number }

export function createSecurity(options: SecurityOptions = {}) {
  const dir = options.dir ?? dataDir();
  const now = options.now ?? Date.now;
  const production = process.env.NODE_ENV === 'production';
  const secure = options.secureCookie ?? (process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE !== 'false' : production);
  // IPs do administrador: sempre autorizados. Em produção não há padrão (falha fechada).
  const adminIps = new Set((options.adminIps ?? (process.env.QUEST_ADMIN_IPS ?? (production ? '' : '127.0.0.1,::1')).split(',')).map(normalizeIp).filter(Boolean));
  const ips = new Map(Object.entries(readJson<Record<string, IpRecord>>(join(dir, 'access.json'), {})));
  // ponytail: sessões em memória (reiniciar derruba os logins; 1 instância). Persistir se houver mais de uma.
  const sessions = new Map<string, { user: string; hash: string; seen: number; expires: number }>();

  const save = () => writeJson(dir, 'access.json', Object.fromEntries(ips));
  const isAllowed = (ip: string) => adminIps.has(ip) || ips.get(ip)?.status === 'allowed';
  const clientIp = (req: Request) => normalizeIp(req.ip);
  const log = (event: string, extra: object) => console.warn(JSON.stringify({ scope: 'security', event, at: new Date(now()).toISOString(), ...extra }));

  function record(ip: string, req: Request) {
    let entry = ips.get(ip);
    if (!entry) {
      const pending = [...ips].filter(([, r]) => r.status === 'pending');
      if (pending.length >= MAX_PENDING) ips.delete(pending.sort((a, b) => a[1].lastSeen - b[1].lastSeen)[0][0]);
      entry = { status: adminIps.has(ip) ? 'allowed' : 'pending', firstSeen: now(), lastSeen: 0, userAgent: '', fails: 0, locks: 0, lockedUntil: 0, lastUser: '' };
      ips.set(ip, entry);
    }
    return entry;
  }

  /** Primeira barreira: IP não autorizado só vê 404, como se não houvesse site. */
  function gate(req: Request, res: Response, next: NextFunction) {
    const ip = clientIp(req);
    if (isAllowed(ip)) return next();
    if (ip) {
      const entry = record(ip, req);
      if (now() - entry.lastSeen > 60_000) { // no máximo 1 escrita por minuto por IP
        entry.lastSeen = now();
        entry.userAgent = String(req.headers['user-agent'] ?? '').slice(0, 200);
        save();
        log('ip.denied', { ip, status: entry.status });
      }
    }
    res.status(404).type('html').send('<html><head><title>404 Not Found</title></head><body><h1>404 Not Found</h1></body></html>');
  }

  function sessionOf(req: Request) {
    const token = new RegExp(`(?:^|;\\s*)${COOKIE}=([\\w-]+)`).exec(req.headers.cookie ?? '')?.[1];
    if (!token) return null;
    const id = createHash('sha256').update(token).digest('hex');
    const session = sessions.get(id);
    if (!session) return null;
    // Trocar ou remover a senha pelo CLI invalida as sessões antigas.
    if (now() > session.expires || now() - session.seen > IDLE_MS || readUsers(dir)[session.user] !== session.hash) {
      sessions.delete(id);
      return null;
    }
    session.seen = now();
    return { id, ...session };
  }
  const setCookie = (res: Response, token: string) => res.append('Set-Cookie',
    `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${token ? SESSION_MS / 1000 : 0}${secure ? '; Secure' : ''}`);

  function requireAuth(req: Request, res: Response, next: NextFunction) {
    if (sessionOf(req)) return next();
    res.status(401).json({ error: 'Sessão inválida ou expirada.' });
  }

  const dummy = hashPassword(randomBytes(16).toString('hex')); // usuário inexistente paga o mesmo custo

  const auth = express.Router();
  auth.get('/me', (req, res) => res.json({ user: sessionOf(req)?.user ?? null }));
  auth.post('/login', async (req, res) => {
    const { username, password } = req.body ?? {};
    if (typeof username !== 'string' || typeof password !== 'string' || !username || !password || username.length > 64 || password.length > 128)
      return res.status(400).json({ error: 'Informe usuário e senha.' });
    const ip = clientIp(req);
    const entry = record(ip, req);
    const locked = () => {
      const seconds = Math.ceil((entry.lockedUntil - now()) / 1000);
      res.set('Retry-After', String(seconds));
      return res.status(429).json({ error: `IP bloqueado por excesso de tentativas. Tente novamente em ${Math.ceil(seconds / 60)} minuto(s).` });
    };
    if (entry.lockedUntil > now()) return locked();

    // A tentativa é contada ANTES do await: requisições paralelas não furam o limite.
    entry.fails += 1;
    entry.lastSeen = now();
    entry.lastUser = username.slice(0, 64);
    entry.userAgent = String(req.headers['user-agent'] ?? '').slice(0, 200);
    if (entry.fails >= MAX_ATTEMPTS) {
      entry.lockedUntil = now() + BASE_LOCK_MS * 3 ** entry.locks; // 15, 45, 135, 405... minutos
      entry.locks += 1;
      entry.fails = 0;
    }
    const remaining = MAX_ATTEMPTS - entry.fails;
    const lockedByThisAttempt = entry.lockedUntil > now();
    save();

    const name = username.toLowerCase();
    const users = readUsers(dir);
    const hash = Object.hasOwn(users, name) ? users[name] : null;
    const ok = await verifyPassword(password, hash ?? await dummy);
    if (!hash || !ok) {
      log('login.failure', { ip, locks: entry.locks });
      if (lockedByThisAttempt) return locked();
      return res.status(401).json({ error: `Usuário ou senha inválidos. Tentativas restantes: ${remaining}.` });
    }
    Object.assign(entry, { fails: 0, locks: 0, lockedUntil: 0 });
    save();
    const token = randomBytes(32).toString('base64url');
    for (const [id, s] of sessions) if (now() > s.expires || now() - s.seen > IDLE_MS) sessions.delete(id);
    sessions.set(createHash('sha256').update(token).digest('hex'), { user: name, hash, seen: now(), expires: now() + SESSION_MS });
    setCookie(res, token);
    return res.status(204).end();
  });
  auth.post('/logout', (req, res) => {
    const session = sessionOf(req);
    if (session) sessions.delete(session.id);
    setCookie(res, '');
    res.status(204).end();
  });

  // Painel: todo usuário cadastrado é administrador.
  const admin = express.Router();
  admin.use(requireAuth);
  const view = (req: Request) => ({
    you: clientIp(req),
    adminIps: [...adminIps],
    ips: [...ips].map(([ip, r]) => ({ ip, ...r })).sort((a, b) => b.lastSeen - a.lastSeen),
  });
  admin.get('/ips', (req, res) => res.json(view(req)));
  // allowed = autorizar · blocked = excluir a notificação (segue vendo 404) · unlock = zerar o bloqueio de tentativas
  admin.post('/ips', (req, res) => {
    const ip = normalizeIp(typeof req.body?.ip === 'string' ? req.body.ip : '');
    const action = req.body?.action;
    if (!isIP(ip) || !['allowed', 'blocked', 'unlock'].includes(action)) return res.status(422).json({ error: 'IP ou ação inválida.' });
    if (action === 'blocked' && (ip === clientIp(req) || adminIps.has(ip))) return res.status(409).json({ error: 'Não é possível bloquear o próprio IP nem um IP fixo de administrador.' });
    const entry = record(ip, req);
    if (action === 'unlock') Object.assign(entry, { fails: 0, locks: 0, lockedUntil: 0 });
    else entry.status = action;
    save();
    log(`ip.${action}`, { ip, by: sessionOf(req)!.user });
    return res.json(view(req));
  });

  return { gate, auth, admin, requireAuth, adminIps };
}
