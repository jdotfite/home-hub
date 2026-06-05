import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const COOKIE_NAME = 'todo_session';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 5;
const loginFailures = new Map();

function clientKey(req) {
  return String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || req.socket?.remoteAddress || 'unknown';
}

function loginFailure(req) {
  const key = clientKey(req);
  const now = Date.now();
  const current = loginFailures.get(key);
  const next = !current || current.resetAt < now
    ? { count: 1, resetAt: now + LOGIN_WINDOW_MS }
    : { count: current.count + 1, resetAt: current.resetAt };
  loginFailures.set(key, next);
}

function loginLimited(req) {
  const entry = loginFailures.get(clientKey(req));
  if (!entry) return false;
  if (entry.resetAt < Date.now()) {
    loginFailures.delete(clientKey(req));
    return false;
  }
  return entry.count >= LOGIN_MAX_FAILURES;
}

function clearLoginFailures(req) {
  loginFailures.delete(clientKey(req));
}

function authEnabled() {
  return Boolean(process.env.HOUSEHOLD_PIN || process.env.HOUSEHOLD_PASSWORD);
}

function credential() {
  return process.env.HOUSEHOLD_PIN || process.env.HOUSEHOLD_PASSWORD || '';
}

function secret() {
  return process.env.AUTH_SECRET || credential() || 'local-dev-secret';
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
  res.redirect(`/login?next=${encodeURIComponent(req.originalUrl || '/home')}`);
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
  <title>Household Hub Login</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #151515; color: #f5f5f0; }
    body { min-height: 100vh; margin: 0; display: grid; place-items: center; background: radial-gradient(circle at top, #2a2a24, #151515 48%); }
    form { width: min(360px, calc(100vw - 32px)); display: grid; gap: 14px; padding: 28px; border-radius: 24px; background: #202020; border: 1px solid #333; box-shadow: 0 24px 80px rgba(0,0,0,.45); }
    h1 { margin: 0; font-size: 28px; letter-spacing: -.04em; }
    p { margin: 0; color: #aaa; line-height: 1.45; }
    input, button { border: 0; border-radius: 14px; padding: 14px 16px; font: inherit; }
    input { background: #111; color: #fff; outline: 1px solid #333; text-align: center; font-size: 24px; letter-spacing: .42em; }
    button { background: #ffd60a; color: #111; font-weight: 750; cursor: pointer; }
    .error { color: #ff9f9f; min-height: 1.2em; }
  </style>
</head>
<body>
  <form id="login-form">
    <h1>Household Hub</h1>
    <p>Enter the Household PIN to open calendar, tasks, grocery, and docs.</p>
    <input name="pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="current-password" placeholder="••••" aria-label="Household PIN" autofocus required />
    <button>Unlock</button>
    <p class="error" id="error"></p>
  </form>
  <script>
    const params = new URLSearchParams(location.search);
    const rawNext = params.get('next') || '/home';
    const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/home';
    document.querySelector('#login-form').addEventListener('submit', async event => {
      event.preventDefault();
      const pin = new FormData(event.currentTarget).get('pin');
      const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin, password: pin }) });
      if (res.ok) location.href = next.startsWith('/') ? next : '/home';
      else document.querySelector('#error').textContent = 'That PIN did not work.';
    });
  </script>
</body>
</html>`);
}

export function login(req, res) {
  if (!authEnabled()) return res.json({ ok: true, enabled: false });
  if (loginLimited(req)) return res.status(429).json({ error: 'Too many PIN attempts. Try again later.' });
  const supplied = req.body?.pin || req.body?.password || '';
  if (!safeEqual(supplied, credential())) {
    loginFailure(req);
    return res.status(401).json({ error: 'Invalid PIN' });
  }
  clearLoginFailures(req);
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${encodeURIComponent(makeSessionCookie())}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE_SECONDS}${secure}`);
  res.json({ ok: true });
}

export function logout(_req, res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  res.json({ ok: true });
}
