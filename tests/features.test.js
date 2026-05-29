import test from 'node:test';
import assert from 'node:assert/strict';
import { resetForTests } from '../src/db.js';
import { createTask, updateTask, completeTask, getTask, listProjects, listTasks, reorderTasks } from '../src/tasks.js';

test('task metadata can be updated for scheduling, waiting, e-ink, and recurrence', async () => {
  await resetForTests();
  const task = await createTask({ title: 'Plan garage shelves', project: 'house' });

  const updated = await updateTask(task.id, {
    dueDate: '2099-01-02',
    waiting: true,
    showOnEink: false,
    recurrence: 'weekly',
    project: 'House',
  });

  assert.equal(updated.dueDate, '2099-01-02');
  assert.equal(updated.waiting, true);
  assert.equal(updated.showOnEink, false);
  assert.equal(updated.recurrence, 'weekly');
  assert.equal(updated.project, 'house');
});

test('completing a recurring task creates the next open occurrence', async () => {
  await resetForTests();
  const task = await createTask({ title: 'Water plants', dueDate: '2026-05-29', recurrence: 'daily' });

  const completed = await completeTask(task.id);
  const open = await listTasks({ status: 'open' });

  assert.equal(completed.status, 'done');
  assert.equal(open.length, 1);
  assert.equal(open[0].title, 'Water plants');
  assert.equal(open[0].dueDate, '2026-05-30');
  assert.equal(open[0].recurrence, 'daily');
});

test('reordering updates open task priorities', async () => {
  await resetForTests();
  const first = await createTask({ title: 'First' });
  const second = await createTask({ title: 'Second' });
  const third = await createTask({ title: 'Third' });

  const reordered = await reorderTasks([third.id, first.id, second.id]);

  assert.deepEqual(reordered.map(t => t.title), ['Third', 'First', 'Second']);
});

test('project list includes open task counts only', async () => {
  await resetForTests();
  const house = await createTask({ title: 'Paint trim', project: 'house' });
  await createTask({ title: 'Buy screws', project: 'house' });
  await createTask({ title: 'File receipt', project: 'admin' });
  await completeTask(house.id);

  assert.deepEqual(await listProjects(), [
    { project: 'admin', count: 1 },
    { project: 'house', count: 1 },
  ]);
  assert.equal((await getTask(house.id)).status, 'done');
});
