import test from 'node:test';
import assert from 'node:assert/strict';
import { resetForTests } from '../src/db.js';
import { createApp } from '../src/server.js';

function start() {
  resetForTests();
  const app = createApp();
  return new Promise(resolve => {
    const server = app.listen(0, () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` }));
  });
}

test('discord add/list/done flow and eink output', async () => {
  const { server, base } = await start();
  try {
    let res = await fetch(`${base}/api/discord/command`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command: '/todo add Fix arcade joystick #arcade' }) });
    assert.equal(res.status, 200);
    let body = await res.json();
    assert.match(body.message, /Added/);

    res = await fetch(`${base}/api/discord/command`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command: '/todo project arcade' }) });
    body = await res.json();
    assert.match(body.message, /Fix arcade joystick/);

    res = await fetch(`${base}/api/eink/today`);
    body = await res.json();
    assert.deepEqual(body.tasks, ['Fix arcade joystick']);

    res = await fetch(`${base}/api/discord/command`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command: '/todo done 1' }) });
    body = await res.json();
    assert.match(body.message, /Done/);

    res = await fetch(`${base}/api/tasks?view=done`);
    body = await res.json();
    assert.equal(body.tasks.length, 1);
  } finally { server.close(); }
});
