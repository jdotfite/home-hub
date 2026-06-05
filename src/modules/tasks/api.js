import { addSubtask, createTask, updateSubtask, deleteSubtask, updateTask, completeTask, listTasks, reorderTasks, listProjects } from './data.js';

export function registerTaskRoutes(app) {
  app.get('/api/tasks', async (req, res, next) => {
    try { res.json({ tasks: await listTasks(req.query) }); } catch (err) { next(err); }
  });

  app.post('/api/tasks', async (req, res, next) => {
    try { res.status(201).json({ task: await createTask(req.body) }); } catch (err) { next(err); }
  });

  app.patch('/api/tasks/:id', async (req, res, next) => {
    try { res.json({ task: await updateTask(req.params.id, req.body) }); } catch (err) { next(err); }
  });

  app.post('/api/tasks/:id/subtasks', async (req, res, next) => {
    try { res.status(201).json(await addSubtask(req.params.id, req.body)); } catch (err) { next(err); }
  });

  app.patch('/api/tasks/:id/subtasks/:subtaskId', async (req, res, next) => {
    try { res.json({ subtask: await updateSubtask(req.params.id, req.params.subtaskId, req.body) }); } catch (err) { next(err); }
  });

  app.delete('/api/tasks/:id/subtasks/:subtaskId', async (req, res, next) => {
    try { res.json(await deleteSubtask(req.params.id, req.params.subtaskId)); } catch (err) { next(err); }
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
}
