import { nanoid } from 'nanoid';
import { nowIso, readStore, todayIsoDate, writeStore } from './db.js';

const recurrenceOptions = new Set(['none', 'daily', 'weekly', 'monthly']);

function normalizeRecurrence(value) {
  const recurrence = String(value || 'none').toLowerCase();
  return recurrenceOptions.has(recurrence) ? recurrence : 'none';
}

function normalizeTask(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    notes: row.notes || '',
    project: row.project || 'inbox',
    status: row.status || 'open',
    priority: Number.isFinite(row.priority) ? row.priority : 1000,
    dueDate: row.dueDate || null,
    waiting: Boolean(row.waiting),
    showOnEink: row.showOnEink !== false,
    recurrence: normalizeRecurrence(row.recurrence),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    completedAt: row.completedAt || null,
    subtasks: normalizeSubtasks(row.subtasks),
  };
}

function normalizeSubtasks(subtasks = []) {
  return Array.isArray(subtasks) ? subtasks.map(item => ({
    id: item.id,
    title: item.title,
    checked: Boolean(item.checked),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  })).filter(item => item.id && item.title) : [];
}

function ensureSubtasks(task) {
  if (!Array.isArray(task.subtasks)) task.subtasks = [];
  return task.subtasks;
}

function sortTasks(a, b) {
  return String(a.status).localeCompare(String(b.status))
    || Number(a.priority || 0) - Number(b.priority || 0)
    || String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
}

export async function createTask(input) {
  const title = String(input.title || '').trim();
  if (!title) throw Object.assign(new Error('Task title is required'), { status: 400 });
  const project = String(input.project || 'inbox').trim().toLowerCase() || 'inbox';
  const store = await readStore();
  const openPriorities = store.tasks.filter(t => t.status === 'open').map(t => Number(t.priority || 0));
  const nextPriority = (openPriorities.length ? Math.max(...openPriorities) : 0) + 1000;
  const timestamp = nowIso();
  const task = {
    id: nanoid(12),
    title,
    notes: String(input.notes || ''),
    project,
    status: 'open',
    priority: Number.isFinite(input.priority) ? input.priority : nextPriority,
    dueDate: input.dueDate || null,
    waiting: Boolean(input.waiting),
    showOnEink: input.showOnEink !== false,
    recurrence: normalizeRecurrence(input.recurrence),
    createdAt: timestamp,
    updatedAt: timestamp,
    completedAt: null,
    subtasks: [],
  };
  store.tasks.push(task);
  await writeStore(store);
  return normalizeTask(task);
}

export async function getTask(id) {
  return normalizeTask((await readStore()).tasks.find(t => t.id === id));
}

export async function addSubtask(taskId, input) {
  const title = String(input.title || '').trim();
  if (!title) throw Object.assign(new Error('Subtask title is required'), { status: 400 });
  const store = await readStore();
  const task = store.tasks.find(t => t.id === taskId);
  if (!task) throw Object.assign(new Error('Task not found'), { status: 404 });
  const timestamp = nowIso();
  const subtask = { id: nanoid(12), title, checked: Boolean(input.checked), createdAt: timestamp, updatedAt: timestamp };
  ensureSubtasks(task).push(subtask);
  task.updatedAt = timestamp;
  await writeStore(store);
  const normalized = normalizeSubtasks([subtask])[0];
  return { ...normalized, subtask: normalized, task: normalizeTask(task) };
}

export async function updateSubtask(taskId, subtaskId, patch) {
  const store = await readStore();
  const task = store.tasks.find(t => t.id === taskId);
  if (!task) throw Object.assign(new Error('Task not found'), { status: 404 });
  const subtask = ensureSubtasks(task).find(item => item.id === subtaskId);
  if (!subtask) throw Object.assign(new Error('Subtask not found'), { status: 404 });
  if (Object.prototype.hasOwnProperty.call(patch, 'title')) {
    const title = String(patch.title || '').trim();
    if (!title) throw Object.assign(new Error('Subtask title is required'), { status: 400 });
    subtask.title = title;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'checked')) subtask.checked = Boolean(patch.checked);
  subtask.updatedAt = nowIso();
  task.updatedAt = subtask.updatedAt;
  await writeStore(store);
  return normalizeSubtasks([subtask])[0];
}

export async function deleteSubtask(taskId, subtaskId) {
  const store = await readStore();
  const task = store.tasks.find(t => t.id === taskId);
  if (!task) throw Object.assign(new Error('Task not found'), { status: 404 });
  const before = ensureSubtasks(task).length;
  task.subtasks = task.subtasks.filter(item => item.id !== subtaskId);
  if (task.subtasks.length === before) throw Object.assign(new Error('Subtask not found'), { status: 404 });
  task.updatedAt = nowIso();
  await writeStore(store);
  return { removed: before - task.subtasks.length };
}

export async function listTasks(filters = {}) {
  const today = todayIsoDate();
  let tasks = (await readStore()).tasks.map(normalizeTask);
  if (filters.status) tasks = tasks.filter(t => t.status === filters.status);
  if (filters.project) tasks = tasks.filter(t => t.project === String(filters.project).toLowerCase());
  if (filters.view === 'today') {
    tasks = tasks.filter(t => t.status === 'open' && (!t.dueDate || t.dueDate <= today));
  } else if (filters.view === 'inbox') {
    tasks = tasks.filter(t => t.project === 'inbox' && t.status === 'open');
  } else if (filters.view === 'done') {
    tasks = tasks.filter(t => t.status === 'done');
  }
  return tasks.sort(sortTasks);
}

export async function updateTask(id, patch) {
  const store = await readStore();
  const index = store.tasks.findIndex(t => t.id === id);
  if (index === -1) throw Object.assign(new Error('Task not found'), { status: 404 });
  const current = store.tasks[index];
  const allowed = ['title', 'notes', 'project', 'priority', 'dueDate', 'waiting', 'showOnEink', 'status', 'recurrence'];
  let changed = false;
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) {
      let value = patch[key];
      if (key === 'project') value = String(value || 'inbox').toLowerCase();
      if (key === 'waiting' || key === 'showOnEink') value = Boolean(value);
      if (key === 'recurrence') value = normalizeRecurrence(value);
      current[key] = value;
      changed = true;
    }
  }
  if (!changed) return normalizeTask(current);
  current.updatedAt = nowIso();
  await writeStore(store);
  return normalizeTask(current);
}

function nextDueDate(dueDate, recurrence) {
  if (!dueDate || recurrence === 'none') return null;
  const date = new Date(`${dueDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  if (recurrence === 'daily') date.setUTCDate(date.getUTCDate() + 1);
  if (recurrence === 'weekly') date.setUTCDate(date.getUTCDate() + 7);
  if (recurrence === 'monthly') date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString().slice(0, 10);
}

export async function completeTask(id) {
  const store = await readStore();
  const task = store.tasks.find(t => t.id === id);
  if (!task) throw Object.assign(new Error('Task not found'), { status: 404 });
  const timestamp = nowIso();
  task.status = 'done';
  task.completedAt = timestamp;
  task.updatedAt = timestamp;
  const recurrence = normalizeRecurrence(task.recurrence);
  const nextDue = nextDueDate(task.dueDate, recurrence);
  if (nextDue) {
    const openPriorities = store.tasks.filter(t => t.status === 'open').map(t => Number(t.priority || 0));
    store.tasks.push({
      ...task,
      id: nanoid(12),
      status: 'open',
      priority: (openPriorities.length ? Math.max(...openPriorities) : 0) + 1000,
      dueDate: nextDue,
      createdAt: timestamp,
      updatedAt: timestamp,
      completedAt: null,
    });
  }
  await writeStore(store);
  return normalizeTask(task);
}

export async function reorderTasks(ids) {
  if (!Array.isArray(ids)) throw Object.assign(new Error('ids must be an array'), { status: 400 });
  const store = await readStore();
  ids.forEach((id, index) => {
    const task = store.tasks.find(t => t.id === id);
    if (task) {
      task.priority = (index + 1) * 1000;
      task.updatedAt = nowIso();
    }
  });
  await writeStore(store);
  return listTasks({ status: 'open' });
}

export async function listProjects() {
  const counts = new Map();
  for (const task of (await readStore()).tasks) {
    if (task.status !== 'open') continue;
    const project = task.project || 'inbox';
    counts.set(project, (counts.get(project) || 0) + 1);
  }
  return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([project, count]) => ({ project, count }));
}

export async function einkToday() {
  const rows = (await listTasks({ view: 'today' })).filter(t => t.showOnEink).slice(0, 12);
  return {
    title: 'Today',
    tasks: rows.filter(t => !t.waiting).slice(0, 8).map(t => t.title),
    waiting: rows.filter(t => t.waiting).slice(0, 5).map(t => t.title),
  };
}
