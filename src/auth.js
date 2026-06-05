import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const COOKIE_NAME = 'todo_session';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function authEnabled() {
  return Boolean(process.env.HOUSEHOLD_PASSWORD);
}

function secret() {
  return process.env.AUTH_SECRET || process.env.HOUSEHOLD_PASSWORD || 'local-dev-secret';
}

function sign(value) {
  return createHmac('sha256', secret()).update(value).digest('base64url');
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function parseCookies(req) {
  return Object.fromEntries(String(req.headers.cookie || '').split(';').map(part => part.trim()).filter(Boolean).map(part => {
    const index = part.indexOf('=');
    return index === -1 ? [part, ''] : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
  }));
}

function makeSessionCookie() {
  const issuedAt = Date.now();
  const nonce = randomBytes(12).toString('base64url');
  const payload = `${issuedAt}.${nonce}`;
  return `${payload}.${sign(payload)}`;
}

function verifySessionCookie(value) {
  if (!value) return false;
  const parts = String(value).split('.');
  if (parts.length !== 3) return false;
  const [issuedAt, nonce, signature] = parts;
  const issuedMs = Number(issuedAt);
  if (!Number.isFinite(issuedMs)) return false;
  if (Date.now() - issuedMs > MAX_AGE_SECONDS * 1000) return false;
  return safeEqual(signature, sign(`${issuedAt}.${nonce}`));
}

function hasSession(req) {
  if (!authEnabled()) return true;
  return verifySessionCookie(parseCookies(req)[COOKIE_NAME]);
}

function hasApiToken(req) {
  const token = process.env.HOUSEHOLD_API_TOKEN;
  if (!token) return false;
  const supplied = req.get('x-todo-token') || req.query.token;
  return supplied ? safeEqual(supplied, token) : false;
}

function hasEinkToken(req) {
  const token = process.env.EINK_API_TOKEN || process.env.HOUSEHOLD_API_TOKEN;
  if (!token) return false;
  const supplied = req.get('x-eink-token') || req.get('x-todo-token') || req.query.token;
  return supplied ? safeEqual(supplied, token) : false;
}

export function isHouseholdAuthed(req) {
  return hasSession(req) || hasApiToken(req);
}

export function requireHouseholdAuth(req, res, next) {
  if (!authEnabled() || isHouseholdAuthed(req)) return next();
  res.status(401).json({ error: 'Authentication required' });
}

export function requirePageAuth(req, res, next) {
  if (!authEnabled() || hasSession(req)) return next();
  res.redirect(`/login?next=${encodeURIComponent(req.originalUrl || '/today')}`);
}

export function requireEinkAuth(req, res, next) {
  if (!authEnabled() || hasSession(req) || hasEinkToken(req)) return next();
  res.status(401).json({ error: 'E-ink token required' });
}

export function authStatus(_req, res) {
  res.json({ enabled: authEnabled(), authenticated: !authEnabled() || hasSession(_req) });
}

export function loginPage(_req, res) {
  res.type('html').send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Todo Login</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #151515; color: #f5f5f0; }
    body { min-height: 100vh; margin: 0; display: grid; place-items: center; background: radial-gradient(circle at top, #2a2a24, #151515 48%); }
    form { width: min(360px, calc(100vw - 32px)); display: grid; gap: 14px; padding: 28px; border-radius: 24px; background: #202020; border: 1px solid #333; box-shadow: 0 24px 80px rgba(0,0,0,.45); }
    h1 { margin: 0; font-size: 28px; letter-spacing: -.04em; }
    p { margin: 0; color: #aaa; line-height: 1.45; }
    input, button { border: 0; border-radius: 14px; padding: 14px 16px; font: inherit; }
    input { background: #111; color: #fff; outline: 1px solid #333; }
    button { background: #ffd60a; color: #111; font-weight: 750; cursor: pointer; }
    .error { color: #ff9f9f; min-height: 1.2em; }
  </style>
</head>
<body>
  <form id="login-form">
    <h1>Family Todo</h1>
    <p>Enter the household password to open the todo and grocery app.</p>
    <input name="password" type="password" autocomplete="current-password" placeholder="Household password" autofocus required />
    <button>Unlock</button>
    <p class="error" id="error"></p>
  </form>
  <script>
    const params = new URLSearchParams(location.search);
    const next = params.get('next') || '/today';
    document.querySelector('#login-form').addEventListener('submit', async event => {
      event.preventDefault();
      const password = new FormData(event.currentTarget).get('password');
      const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
      if (res.ok) location.href = next.startsWith('/') ? next : '/today';
      else document.querySelector('#error').textContent = 'That password did not work.';
    });
  </script>
</body>
</html>`);
}

export function login(req, res) {
  if (!authEnabled()) return res.json({ ok: true, enabled: false });
  if (!safeEqual(req.body?.password || '', process.env.HOUSEHOLD_PASSWORD)) {
    return res.status(401).json({ error: 'Invalid password' });
  }
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${encodeURIComponent(makeSessionCookie())}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE_SECONDS}${secure}`);
  res.json({ ok: true });
}

export function logout(_req, res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  res.json({ ok: true });
}
