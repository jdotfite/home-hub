import { listThreads, createThread, updateThread, deleteThread, listMessages, postMessage, updateMessage, deleteMessage, getRecentMessages, markThreadRead } from './data.js';
import { selectedProfileId } from '../../profiles.js';

export function registerChatRoutes(app) {
  app.get('/api/chat/recent', async (req, res, next) => {
    try {
      const limit = Math.min(parseInt(req.query.limit) || 5, 20);
      res.json({ messages: await getRecentMessages(limit) });
    } catch (err) { next(err); }
  });

  app.get('/api/chat/threads', async (req, res, next) => {
    try { res.json({ threads: await listThreads({ profileId: selectedProfileId(req) }) }); } catch (err) { next(err); }
  });

  app.post('/api/chat/threads', async (req, res, next) => {
    try { res.status(201).json({ thread: await createThread(req.body) }); } catch (err) { next(err); }
  });

  app.patch('/api/chat/threads/:threadId', async (req, res, next) => {
    try { res.json({ thread: await updateThread(req.params.threadId, req.body) }); } catch (err) { next(err); }
  });

  app.post('/api/chat/threads/:threadId/read', async (req, res, next) => {
    try { res.json({ read: await markThreadRead(req.params.threadId, selectedProfileId(req), { lastReadAt: req.body?.lastReadAt }) }); } catch (err) { next(err); }
  });

  app.delete('/api/chat/threads/:threadId', async (req, res, next) => {
    try { res.json(await deleteThread(req.params.threadId)); } catch (err) { next(err); }
  });

  app.get('/api/chat/threads/:threadId/messages', async (req, res, next) => {
    try { res.json({ messages: await listMessages(req.params.threadId) }); } catch (err) { next(err); }
  });

  app.post('/api/chat/threads/:threadId/messages', async (req, res, next) => {
    try {
      const profileId = selectedProfileId(req);
      res.status(201).json({ message: await postMessage(req.params.threadId, { ...req.body, profileId }) });
    } catch (err) { next(err); }
  });

  app.patch('/api/chat/threads/:threadId/messages/:messageId', async (req, res, next) => {
    try { res.json({ message: await updateMessage(req.params.threadId, req.params.messageId, req.body) }); } catch (err) { next(err); }
  });

  app.delete('/api/chat/threads/:threadId/messages/:messageId', async (req, res, next) => {
    try { res.json(await deleteMessage(req.params.threadId, req.params.messageId)); } catch (err) { next(err); }
  });
}
