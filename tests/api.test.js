import test from 'node:test';
import assert from 'node:assert/strict';
import { resetForTests } from '../src/db.js';
import { createApp } from '../src/server.js';

async function start() {
  await resetForTests();
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

test('grocery items can be deleted through the api', async () => {
  const { server, base } = await start();
  try {
    let res = await fetch(`${base}/api/grocery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '2 milk', store: 'walmart' }),
    });
    assert.equal(res.status, 201);
    const { item } = await res.json();

    res = await fetch(`${base}/api/grocery/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checked: true }),
    });
    assert.equal(res.status, 200);

    res = await fetch(`${base}/api/grocery/recent`);
    let body = await res.json();
    assert.deepEqual(body.items.map(i => `${i.quantity} ${i.title}`), ['2 milk']);

    res = await fetch(`${base}/api/grocery/${item.id}`, { method: 'DELETE' });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { removed: 1 });

    res = await fetch(`${base}/api/grocery/recent`);
    body = await res.json();
    assert.deepEqual(body.items, []);
  } finally { server.close(); }
});

test('task sub todo lists can be managed through the api', async () => {
  const { server, base } = await start();
  try {
    let res = await fetch(`${base}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Finish cabinet build', project: 'garage' }),
    });
    assert.equal(res.status, 201);
    const { task } = await res.json();

    res = await fetch(`${base}/api/tasks/${task.id}/subtasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Cut side panels' }),
    });
    assert.equal(res.status, 201);
    let body = await res.json();
    assert.equal(body.task.subtasks[0].title, 'Cut side panels');

    const subtaskId = body.subtask.id;
    res = await fetch(`${base}/api/tasks/${task.id}/subtasks/${subtaskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checked: true }),
    });
    body = await res.json();
    assert.equal(body.subtask.checked, true);

    res = await fetch(`${base}/api/tasks/${task.id}/subtasks/${subtaskId}`, { method: 'DELETE' });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { removed: 1 });
  } finally { server.close(); }
});
