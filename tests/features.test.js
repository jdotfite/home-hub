import test from 'node:test';
import assert from 'node:assert/strict';
import { resetForTests } from '../src/db.js';
import { createTask, updateTask, completeTask, getTask, listProjects, listTasks, reorderTasks } from '../src/tasks.js';

test('task metadata can be updated for scheduling, waiting, e-ink, and recurrence', () => {
  resetForTests();
  const task = createTask({ title: 'Plan garage shelves', project: 'house' });

  const updated = updateTask(task.id, {
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

test('completing a recurring task creates the next open occurrence', () => {
  resetForTests();
  const task = createTask({ title: 'Water plants', dueDate: '2026-05-29', recurrence: 'daily' });

  const completed = completeTask(task.id);
  const open = listTasks({ status: 'open' });

  assert.equal(completed.status, 'done');
  assert.equal(open.length, 1);
  assert.equal(open[0].title, 'Water plants');
  assert.equal(open[0].dueDate, '2026-05-30');
  assert.equal(open[0].recurrence, 'daily');
});

test('reordering updates open task priorities', () => {
  resetForTests();
  const first = createTask({ title: 'First' });
  const second = createTask({ title: 'Second' });
  const third = createTask({ title: 'Third' });

  const reordered = reorderTasks([third.id, first.id, second.id]);

  assert.deepEqual(reordered.map(t => t.title), ['Third', 'First', 'Second']);
});

test('project list includes open task counts only', () => {
  resetForTests();
  const house = createTask({ title: 'Paint trim', project: 'house' });
  createTask({ title: 'Buy screws', project: 'house' });
  createTask({ title: 'File receipt', project: 'admin' });
  completeTask(house.id);

  assert.deepEqual(listProjects(), [
    { project: 'admin', count: 1 },
    { project: 'house', count: 1 },
  ]);
  assert.equal(getTask(house.id).status, 'done');
});
