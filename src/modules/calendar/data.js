import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const GOOGLE_API = process.env.GOOGLE_API_SCRIPT || `${process.env.HERMES_HOME || `${process.env.HOME}/.hermes`}/skills/productivity/google-workspace/scripts/google_api.py`;
const FAMILY_CALENDAR_ID = process.env.FAMILY_CALENDAR_ID || 'family12925651382350424080@group.calendar.google.com';
const CALENDAR_DAYS = Number(process.env.EINK_CALENDAR_DAYS || 14);
const CALENDAR_MAX = Number(process.env.EINK_CALENDAR_MAX || 8);

function addDays(date, days) {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

function localIso(date) {
  const off = -date.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  const tz = `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:00${tz}`;
}

function eventDateKey(event) {
  const raw = event.start?.dateTime || event.start?.date || event.start || '';
  return String(raw).slice(0, 10);
}

function eventTimeLabel(event) {
  const start = event.start?.dateTime || event.start || '';
  if (!start || event.start?.date || /^\d{4}-\d{2}-\d{2}$/.test(String(start))) return 'All day';
  const d = new Date(start);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(' ', '').toLowerCase();
}

function unfoldIcs(text) {
  return String(text || '').replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
}

function parseIcsDate(value) {
  const raw = String(value || '').trim();
  if (/^\d{8}$/.test(raw)) {
    const year = raw.slice(0, 4);
    const month = raw.slice(4, 6);
    const day = raw.slice(6, 8);
    return { date: `${year}-${month}-${day}`, allDay: true, startMs: Date.parse(`${year}-${month}-${day}T00:00:00`) };
  }
  const normalized = raw.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/, '$1-$2-$3T$4:$5:$6$7');
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return null;
  return { date: d.toISOString().slice(0, 10), allDay: false, startMs: d.getTime(), iso: d.toISOString() };
}

function parseIcsCalendar(text, now = new Date(), days = CALENDAR_DAYS, max = CALENDAR_MAX) {
  const lines = unfoldIcs(text);
  const events = [];
  let current = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') current = {};
    else if (line === 'END:VEVENT') {
      if (current) events.push(current);
      current = null;
    } else if (current) {
      const [left, ...right] = line.split(':');
      const key = left.split(';')[0];
      const value = right.join(':');
      if (key === 'UID') current.id = value;
      if (key === 'SUMMARY') current.summary = value.replace(/\\,/g, ',').replace(/\\n/g, ' ');
      if (key === 'DTSTART') current.start = parseIcsDate(value);
    }
  }
  const startMs = now.getTime();
  const endMs = addDays(now, days).getTime();
  return events
    .filter(event => event.summary && event.start && event.start.startMs >= startMs && event.start.startMs <= endMs)
    .sort((a, b) => a.start.startMs - b.start.startMs)
    .slice(0, max)
    .map(event => ({
      id: event.id || `${event.start.date}:${event.summary}`,
      summary: event.summary,
      date: event.start.date,
      time: event.start.allDay ? 'All day' : eventTimeLabel({ start: { dateTime: event.start.iso } }),
    }));
}

async function calendarEventsFromIcs() {
  const url = process.env.GOOGLE_CALENDAR_ICAL_URL;
  if (!url) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'family-eink-dashboard/1.0' } });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return parseIcsCalendar(await res.text());
  } finally {
    clearTimeout(timeout);
  }
}

async function calendarEventsFromGoogleApi() {
  const now = new Date();
  const end = addDays(now, CALENDAR_DAYS);
  const { stdout } = await execFileAsync('python3', [
    GOOGLE_API,
    'calendar',
    'list',
    '--calendar', FAMILY_CALENDAR_ID,
    '--start', localIso(now),
    '--end', localIso(end),
    '--max', String(CALENDAR_MAX),
  ], { timeout: 15000, maxBuffer: 1024 * 1024 });
  const parsed = JSON.parse(stdout);
  return parsed.map(event => ({
    id: event.id,
    summary: event.summary || '(untitled)',
    date: eventDateKey(event),
    time: eventTimeLabel(event),
  })).filter(event => event.summary);
}

export async function calendarEvents({ respectEnabled = true } = {}) {
  try {
    if (respectEnabled && process.env.EINK_CALENDAR_ENABLED === 'false') return [];
    const icsEvents = await calendarEventsFromIcs();
    if (icsEvents) return icsEvents;
    return await calendarEventsFromGoogleApi();
  } catch (err) {
    return [];
  }
}
