import express from 'express';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createTask, updateTask, completeTask, listTasks, reorderTasks, listProjects, einkToday } from './tasks.js';
import { createGroceryItem, listGroceryItems, updateGroceryItem, clearCheckedGroceryItems, quickAdd } from './grocery.js';
import { runTodoCommand } from './discordParser.js';
import { alexaRoute } from './alexa.js';

export function createApp() {
  const app = express();
  app.use(express.json());
  app.use(express.static('public'));

  const page = name => (_req, res) => res.sendFile(`${process.cwd()}/public/index.html`);
  app.get(['/inbox', '/today', '/future', '/grocery', '/projects', '/eink', '/done'], page());

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  app.get('/api/tasks', async (req, res, next) => {
    try { res.json({ tasks: await listTasks(req.query) }); } catch (err) { next(err); }
  });

  app.post('/api/tasks', async (req, res, next) => {
    try { res.status(201).json({ task: await createTask(req.body) }); } catch (err) { next(err); }
  });

  app.patch('/api/tasks/:id', async (req, res, next) => {
    try { res.json({ task: await updateTask(req.params.id, req.body) }); } catch (err) { next(err); }
  });

  app.post('/api/tasks/:id/complete', async (req, res, next) => {
    try { res.json({ task: await completeTask(req.params.id) }); } catch (err) { next(err); }
  });

  app.post('/api/tasks/reorder', async (req, res, next) => {
    try { res.json({ tasks: await reorderTasks(req.body.ids) }); } catch (err) { next(err); }
  });

  app.get('/api/projects', async (_req, res, next) => {
    try { res.json({ projects: await listProjects() }); } catch (err) { next(err); }
  });

  app.get('/api/grocery', async (req, res, next) => {
    try { res.json({ items: await listGroceryItems(req.query) }); } catch (err) { next(err); }
  });

  app.post('/api/grocery', async (req, res, next) => {
    try { res.status(201).json({ item: await createGroceryItem(req.body) }); } catch (err) { next(err); }
  });

  app.patch('/api/grocery/:id', async (req, res, next) => {
    try { res.json({ item: await updateGroceryItem(req.params.id, req.body) }); } catch (err) { next(err); }
  });

  app.post('/api/grocery/clear-checked', async (_req, res, next) => {
    try { res.json(await clearCheckedGroceryItems()); } catch (err) { next(err); }
  });

  app.post('/api/quick-add', async (req, res, next) => {
    try { res.status(201).json(await quickAdd(req.body.text, req.body)); } catch (err) { next(err); }
  });

  app.get('/api/eink/today', async (_req, res, next) => {
    try { res.json(await einkToday()); } catch (err) { next(err); }
  });

  app.get('/api/eink/today.svg', async (_req, res, next) => {
    try {
      const data = await einkToday();
      const lines = [data.title.toUpperCase(), ...data.tasks.map(t => `□ ${t}`), ...(data.waiting.length ? ['', 'WAITING', ...data.waiting.map(t => `• ${t}`)] : [])];
      const safe = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
      const text = lines.map((line, i) => `<text x="48" y="${70 + i * 42}" class="${i === 0 || line === 'WAITING' ? 'heading' : 'item'}">${safe(line)}</text>`).join('\n');
      res.type('image/svg+xml').send(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="480" viewBox="0 0 800 480"><style>rect{fill:#fff}.heading{font:bold 38px sans-serif}.item{font:30px sans-serif}</style><rect width="800" height="480"/>${text}</svg>`);
    } catch (err) { next(err); }
  });

  app.post('/api/discord/command', async (req, res, next) => {
    try { res.json(await runTodoCommand(req.body.command)); } catch (err) { next(err); }
  });

  app.post('/api/alexa', alexaRoute);

  app.use((err, _req, res, _next) => {
    res.status(err.status || 500).json({ error: err.message || 'Server error' });
  });

  return app;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT || 3456);
  createApp().listen(port, () => console.log(`todo listening on http://localhost:${port}`));
}
