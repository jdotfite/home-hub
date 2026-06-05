import { createGroceryItem, listGroceryItems, listRecentGroceryItems, readdGroceryItem, updateGroceryItem, clearCheckedGroceryItems, deleteGroceryItem, quickAdd } from './data.js';

export function registerGroceryRoutes(app) {
  app.get('/api/grocery', async (req, res, next) => {
    try { res.json({ items: await listGroceryItems(req.query) }); } catch (err) { next(err); }
  });

  app.get('/api/grocery/recent', async (req, res, next) => {
    try { res.json({ items: await listRecentGroceryItems(req.query.limit) }); } catch (err) { next(err); }
  });

  app.post('/api/grocery', async (req, res, next) => {
    try { res.status(201).json({ item: await createGroceryItem(req.body) }); } catch (err) { next(err); }
  });

  app.patch('/api/grocery/:id', async (req, res, next) => {
    try { res.json({ item: await updateGroceryItem(req.params.id, req.body) }); } catch (err) { next(err); }
  });

  app.delete('/api/grocery/:id', async (req, res, next) => {
    try { res.json(await deleteGroceryItem(req.params.id)); } catch (err) { next(err); }
  });

  app.post('/api/grocery/:id/readd', async (req, res, next) => {
    try { res.status(201).json({ item: await readdGroceryItem(req.params.id) }); } catch (err) { next(err); }
  });

  app.post('/api/grocery/clear-checked', async (_req, res, next) => {
    try { res.json(await clearCheckedGroceryItems()); } catch (err) { next(err); }
  });

  app.post('/api/quick-add', async (req, res, next) => {
    try { res.status(201).json(await quickAdd(req.body.text, req.body)); } catch (err) { next(err); }
  });
}
