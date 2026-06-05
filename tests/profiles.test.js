import test from 'node:test';
import assert from 'node:assert/strict';
import { readStore, resetForTests, writeStore } from '../src/db.js';
import { createApp } from '../src/server.js';
import { modulesForProfile } from '../src/profiles.js';

async function withServer(fn) {
  const app = createApp();
  const server = await new Promise(resolve => {
    const s = app.listen(0, () => resolve(s));
  });
  try {
    await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.close();
  }
}

test('old stores normalize with default household profiles and future module data arrays', async () => {
  await writeStore({ tasks: [], groceryItems: [] });
  const store = await readStore();

  assert.ok(Array.isArray(store.profiles));
  assert.ok(store.profiles.some(profile => profile.id === 'family'));
  assert.ok(store.profiles.some(profile => profile.id === 'justin'));
  assert.ok(store.profiles.some(profile => profile.id === 'wife'));
  assert.ok(Array.isArray(store.modules));
  assert.ok(Array.isArray(store.tipEntries));
  assert.ok(Array.isArray(store.chatThreads));
  assert.ok(Array.isArray(store.chatMessages));
});

test('profile-aware modules hide tips for Justin and show tips for Wife', async () => {
  await resetForTests();

  const justinModules = await modulesForProfile('justin');
  const wifeModules = await modulesForProfile('wife');

  assert.equal(justinModules.some(module => module.id === 'tips'), false);
  assert.equal(wifeModules.some(module => module.id === 'tips'), true);
  assert.ok(wifeModules.some(module => module.href === '/tips'));
});

test('profile API defaults to family and can switch the active profile with a signed cookie', async () => {
  await resetForTests();

  await withServer(async base => {
    let res = await fetch(`${base}/api/profile`);
    assert.equal(res.status, 200);
    let body = await res.json();
    assert.equal(body.profile.id, 'family');

    res = await fetch(`${base}/api/modules`);
    body = await res.json();
    assert.equal(body.profile.id, 'family');
    assert.equal(body.modules.some(module => module.id === 'tips'), false);

    res = await fetch(`${base}/api/profile/select`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId: 'wife' }),
    });
    assert.equal(res.status, 200);
    const cookie = res.headers.get('set-cookie');
    assert.match(cookie, /todo_profile=/);

    res = await fetch(`${base}/api/profile`, { headers: { cookie } });
    body = await res.json();
    assert.equal(body.profile.id, 'wife');

    res = await fetch(`${base}/api/modules`, { headers: { cookie } });
    body = await res.json();
    assert.equal(body.profile.id, 'wife');
    assert.ok(body.modules.some(module => module.id === 'tips'));
  });
});

test('invalid profile selections are rejected', async () => {
  await resetForTests();

  await withServer(async base => {
    const res = await fetch(`${base}/api/profile/select`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId: '../admin' }),
    });
    assert.equal(res.status, 400);
  });
});

test('malformed profile cookies safely fall back to family profile', async () => {
  await resetForTests();

  await withServer(async base => {
    const res = await fetch(`${base}/api/profile`, { headers: { cookie: 'todo_profile=%E0%A4%A' } });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.profile.id, 'family');
  });
});
