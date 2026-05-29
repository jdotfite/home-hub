import express from 'express';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createTask, updateTask, completeTask, listTasks, reorderTasks, listProjects, einkToday } from './tasks.js';
import { createGroceryItem, listGroceryItems, updateGroceryItem, clearCheckedGroceryItems, quickAdd } from './grocery.js';
import { runTodoCommand } from './discordParser.js';

export function createApp() {
  const app = express();
  app.use(express.json());
  app.use(express.static('public'));

  const page = name => (_req, res) => res.sendFile(`${process.cwd()}/public/index.html`);
  app.get(['/inbox', '/today', '/future', '/grocery', '/projects', '/eink', '/done'], page());

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  app.get('/api/tasks', (req, res) => {
    res.json({ tasks: listTasks(req.query) });
  });

  app.post('/api/tasks', (req, res, next) => {
    try { res.status(201).json({ task: createTask(req.body) }); } catch (err) { next(err); }
  });

  app.patch('/api/tasks/:id', (req, res, next) => {
    try { res.json({ task: updateTask(req.params.id, req.body) }); } catch (err) { next(err); }
  });

  app.post('/api/tasks/:id/complete', (req, res, next) => {
    try { res.json({ task: completeTask(req.params.id) }); } catch (err) { next(err); }
  });

  app.post('/api/tasks/reorder', (req, res, next) => {
    try { res.json({ tasks: reorderTasks(req.body.ids) }); } catch (err) { next(err); }
  });

  app.get('/api/projects', (_req, res) => res.json({ projects: listProjects() }));

  app.get('/api/grocery', (req, res) => res.json({ items: listGroceryItems(req.query) }));

  app.post('/api/grocery', (req, res, next) => {
    try { res.status(201).json({ item: createGroceryItem(req.body) }); } catch (err) { next(err); }
  });

  app.patch('/api/grocery/:id', (req, res, next) => {
    try { res.json({ item: updateGroceryItem(req.params.id, req.body) }); } catch (err) { next(err); }
  });

  app.post('/api/grocery/clear-checked', (_req, res, next) => {
    try { res.json(clearCheckedGroceryItems()); } catch (err) { next(err); }
  });

  app.post('/api/quick-add', (req, res, next) => {
    try { res.status(201).json(quickAdd(req.body.text, req.body)); } catch (err) { next(err); }
  });

  app.get('/api/eink/today', (_req, res) => res.json(einkToday()));

  app.get('/api/eink/today.svg', (_req, res) => {
    const data = einkToday();
    const lines = [data.title.toUpperCase(), ...data.tasks.map(t => `□ ${t}`), ...(data.waiting.length ? ['', 'WAITING', ...data.waiting.map(t => `• ${t}`)] : [])];
    const safe = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const text = lines.map((line, i) => `<text x="48" y="${70 + i * 42}" class="${i === 0 || line === 'WAITING' ? 'heading' : 'item'}">${safe(line)}</text>`).join('\n');
    res.type('image/svg+xml').send(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="480" viewBox="0 0 800 480"><style>rect{fill:#fff}.heading{font:bold 38px sans-serif}.item{font:30px sans-serif}</style><rect width="800" height="480"/>${text}</svg>`);
  });

  app.post('/api/discord/command', (req, res, next) => {
    try { res.json(runTodoCommand(req.body.command)); } catch (err) { next(err); }
  });

  app.use((err, _req, res, _next) => {
    res.status(err.status || 500).json({ error: err.message || 'Server error' });
  });

  return app;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT || 3456);
  createApp().listen(port, () => console.log(`todo listening on http://localhost:${port}`));
}
