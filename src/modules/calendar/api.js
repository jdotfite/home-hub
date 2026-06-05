import { calendarEvents } from './data.js';

export function registerCalendarRoutes(app) {
  app.get('/api/calendar', async (_req, res, next) => {
    try {
      res.json({ events: await calendarEvents({ respectEnabled: false }) });
    } catch (err) {
      next(err);
    }
  });
}
