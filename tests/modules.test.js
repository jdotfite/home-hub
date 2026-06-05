import test from 'node:test';
import assert from 'node:assert/strict';
import { modules, findModuleById, appPageRoutes } from '../src/modules/registry.js';
import { calendarEvents } from '../src/modules/calendar/data.js';
import { registerCalendarRoutes } from '../src/modules/calendar/api.js';
import { listDocuments } from '../src/modules/documents/data.js';
import { registerDocumentRoutes } from '../src/modules/documents/api.js';
import { registerTaskRoutes } from '../src/modules/tasks/api.js';
import { registerGroceryRoutes } from '../src/modules/grocery/api.js';

test('static household modules registry describes existing first-party modules', () => {
  const ids = modules.map(module => module.id);
  assert.deepEqual(ids, ['home', 'tasks', 'calendar', 'grocery', 'documents']);

  const calendar = findModuleById('calendar');
  assert.equal(calendar.label, 'Calendar');
  assert.equal(calendar.href, '/calendar');
  assert.equal(calendar.apiBase, '/api/calendar');
  assert.deepEqual(calendar.profiles, ['family', 'justin', 'wife']);

  const documents = findModuleById('documents');
  assert.equal(documents.navLabel, 'Docs');
  assert.deepEqual(documents.routes, ['/documents']);
  assert.ok(appPageRoutes.includes('/documents'));
  assert.ok(appPageRoutes.includes('/today'));

  const tasks = findModuleById('tasks');
  assert.equal(tasks.apiBase, '/api/tasks');
  assert.deepEqual(tasks.routes, ['/inbox', '/today', '/future', '/projects', '/done']);

  const grocery = findModuleById('grocery');
  assert.equal(grocery.apiBase, '/api/grocery');
  assert.deepEqual(grocery.routes, ['/grocery']);
});

test('calendar module owns calendar data and route registration', async () => {
  const previousIcalUrl = process.env.GOOGLE_CALENDAR_ICAL_URL;
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10).replace(/-/g, '');
  const ics = `BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:module-calendar-1\nDTSTART;VALUE=DATE:${tomorrow}\nSUMMARY:Module calendar event\nEND:VEVENT\nEND:VCALENDAR\n`;

  process.env.GOOGLE_CALENDAR_ICAL_URL = `data:text/calendar,${encodeURIComponent(ics)}`;

  try {
    const events = await calendarEvents({ respectEnabled: false });
    assert.equal(events.length, 1);
    assert.equal(events[0].id, 'module-calendar-1');
    assert.equal(events[0].summary, 'Module calendar event');
    assert.equal(typeof registerCalendarRoutes, 'function');
  } finally {
    if (previousIcalUrl === undefined) delete process.env.GOOGLE_CALENDAR_ICAL_URL; else process.env.GOOGLE_CALENDAR_ICAL_URL = previousIcalUrl;
  }
});

test('documents module owns placeholder data and route registration', () => {
  const docs = listDocuments();
  assert.ok(docs.length >= 5);
  assert.ok(docs.every(doc => doc.source === 'placeholder'));
  assert.ok(docs.some(doc => doc.category === 'Insurance Cards'));
  assert.equal(typeof registerDocumentRoutes, 'function');
});

test('tasks and grocery modules expose API route registration wrappers', () => {
  assert.equal(typeof registerTaskRoutes, 'function');
  assert.equal(typeof registerGroceryRoutes, 'function');
});

