import { listDocuments } from './data.js';

export function registerDocumentRoutes(app) {
  app.get('/api/documents', (_req, res) => {
    res.json({ documents: listDocuments() });
  });
}
