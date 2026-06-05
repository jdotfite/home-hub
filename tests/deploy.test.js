import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createApp } from '../src/server.js';
import { resetForTests } from '../src/db.js';

test('vercel config routes api and spa pages', () => {
  assert.ok(existsSync('vercel.json'));
  const config = JSON.parse(readFileSync('vercel.json', 'utf8'));
  assert.deepEqual(config.rewrites, [
    { source: '/api/(.*)', destination: '/api/index.js' },
    { source: '/(inbox|today|future|grocery|projects|done)', destination: '/index.html' },
  ]);
  assert.ok(existsSync('api/index.js'));
});

test('pwa assets are declared from the app shell', () => {
  const html = readFileSync('public/index.html', 'utf8');
  assert.match(html, /manifest\.webmanifest/);
  assert.match(html, /rel="icon" href="\/icon\.svg"/);
  assert.match(html, /rel="apple-touch-icon" href="\/icon\.svg"/);
  assert.match(html, /service-worker\.js/);
  const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'));
  assert.equal(manifest.name, 'Todo');
  assert.equal(manifest.start_url, '/today');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.background_color, '#111111');
  assert.equal(manifest.theme_color, '#111111');
  assert.equal(manifest.icons[0].src, '/icon.svg');
  assert.ok(existsSync('public/service-worker.js'));
});

test('alexa endpoint requires token and can add a grocery item', async () => {
  await resetForTests();
  process.env.ALEXA_API_TOKEN = 'test-token';
  const app = createApp();
  const server = await new Promise(resolve => {
    const s = app.listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    let res = await fetch(`${base}/api/alexa`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ request: { type: 'LaunchRequest' } }) });
    assert.equal(res.status, 401);

    res = await fetch(`${base}/api/alexa`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-alexa-token': 'test-token' },
      body: JSON.stringify({
        request: {
          type: 'IntentRequest',
          intent: {
            name: 'AddGroceryItemIntent',
            slots: { Item: { value: 'milk' }, Quantity: { value: '2' } },
          },
        },
      }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.version, '1.0');
    assert.match(body.response.outputSpeech.text, /Added 2 milk/i);

    res = await fetch(`${base}/api/grocery`, { headers: { 'x-alexa-token': 'test-token' } });
    const grocery = await res.json();
    assert.deepEqual(grocery.items.map(i => `${i.quantity} ${i.title}`), ['2 milk']);
  } finally {
    delete process.env.ALEXA_API_TOKEN;
    server.close();
  }
});

test('household auth protects app pages and api when enabled', async () => {
  await resetForTests();
  const previousPassword = process.env.HOUSEHOLD_PASSWORD;
  const previousSecret = process.env.AUTH_SECRET;
  const previousApiToken = process.env.HOUSEHOLD_API_TOKEN;
  const previousEinkToken = process.env.EINK_API_TOKEN;

  process.env.HOUSEHOLD_PASSWORD = 'family-pass';
  process.env.AUTH_SECRET = 'test-auth-secret';
  process.env.HOUSEHOLD_API_TOKEN = 'integration-token';
  process.env.EINK_API_TOKEN = 'eink-token';

  const app = createApp();
  const server = await new Promise(resolve => {
    const s = app.listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  try {
    let res = await fetch(`${base}/today`, { redirect: 'manual' });
    assert.equal(res.status, 302);
    assert.match(res.headers.get('location'), /^\/login\?next=/);

    res = await fetch(`${base}/api/tasks`);
    assert.equal(res.status, 401);

    res = await fetch(`${base}/api/tasks`, { headers: { 'x-todo-token': 'integration-token' } });
    assert.equal(res.status, 200);

    res = await fetch(`${base}/api/eink/dashboard?token=eink-token`);
    assert.equal(res.status, 200);

    res = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'family-pass' }),
    });
    assert.equal(res.status, 200);
    const cookie = res.headers.get('set-cookie');
    assert.match(cookie, /todo_session=/);

    res = await fetch(`${base}/today`, { headers: { cookie }, redirect: 'manual' });
    assert.equal(res.status, 200);
  } finally {
    if (previousPassword === undefined) delete process.env.HOUSEHOLD_PASSWORD; else process.env.HOUSEHOLD_PASSWORD = previousPassword;
    if (previousSecret === undefined) delete process.env.AUTH_SECRET; else process.env.AUTH_SECRET = previousSecret;
    if (previousApiToken === undefined) delete process.env.HOUSEHOLD_API_TOKEN; else process.env.HOUSEHOLD_API_TOKEN = previousApiToken;
    if (previousEinkToken === undefined) delete process.env.EINK_API_TOKEN; else process.env.EINK_API_TOKEN = previousEinkToken;
    server.close();
  }
});
