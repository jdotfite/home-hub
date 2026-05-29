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
    { source: '/(inbox|today|future|grocery|projects|eink|done)', destination: '/index.html' },
  ]);
  assert.ok(existsSync('api/index.js'));
});

test('pwa assets are declared from the app shell', () => {
  const html = readFileSync('public/index.html', 'utf8');
  assert.match(html, /manifest\.webmanifest/);
  assert.match(html, /service-worker\.js/);
  const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'));
  assert.equal(manifest.name, 'Todo');
  assert.equal(manifest.start_url, '/today');
  assert.equal(manifest.display, 'standalone');
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
