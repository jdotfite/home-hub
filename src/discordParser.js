import { createTask, completeTask, listTasks } from './tasks.js';

function formatTaskList(tasks, title = 'Tasks') {
  if (!tasks.length) return `${title}: nothing here.`;
  return `${title}:\n` + tasks.map((t, i) => `${i + 1}. ${t.title}${t.project !== 'inbox' ? ` [${t.project}]` : ''}${t.waiting ? ' (waiting)' : ''}`).join('\n');
}

function parseAdd(text) {
  const bits = text.trim().split(/\s+/);
  let project = 'inbox';
  const cleaned = [];
  for (const bit of bits) {
    if (bit.startsWith('#') && bit.length > 1) project = bit.slice(1).toLowerCase();
    else cleaned.push(bit);
  }
  return { title: cleaned.join(' '), project };
}

export async function runTodoCommand(commandText) {
  const command = String(commandText || '').trim();
  const match = command.match(/^\/todo(?:\s+(.*))?$/i);
  if (!match) throw Object.assign(new Error('Expected a /todo command'), { status: 400 });
  const rest = (match[1] || 'list').trim();
  const [verbRaw, ...args] = rest.split(/\s+/);
  const verb = (verbRaw || 'list').toLowerCase();
  const argText = args.join(' ').trim();

  if (verb === 'add') {
    const parsed = parseAdd(argText);
    const task = await createTask(parsed);
    return { message: `Added: ${task.title}${task.project !== 'inbox' ? ` [${task.project}]` : ''}`, task };
  }

  if (verb === 'list') {
    const tasks = await listTasks({ status: 'open' });
    return { message: formatTaskList(tasks, 'Open tasks'), tasks };
  }

  if (verb === 'today') {
    const tasks = await listTasks({ view: 'today' });
    return { message: formatTaskList(tasks, 'Today'), tasks };
  }

  if (verb === 'project') {
    if (!argText) throw Object.assign(new Error('Project name is required'), { status: 400 });
    const tasks = await listTasks({ project: argText.toLowerCase(), status: 'open' });
    return { message: formatTaskList(tasks, `Project ${argText.toLowerCase()}`), tasks };
  }

  if (verb === 'done') {
    const index = Number.parseInt(argText, 10);
    if (!Number.isInteger(index) || index < 1) throw Object.assign(new Error('Use /todo done <number from /todo list>'), { status: 400 });
    const tasks = await listTasks({ status: 'open' });
    const task = tasks[index - 1];
    if (!task) throw Object.assign(new Error(`No open task #${index}`), { status: 404 });
    const completed = await completeTask(task.id);
    return { message: `Done: ${completed.title}`, task: completed };
  }

  throw Object.assign(new Error(`Unknown /todo command: ${verb}`), { status: 400 });
}
