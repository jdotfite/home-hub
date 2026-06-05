import { listGroceryItems } from './grocery.js';
import { calendarEvents } from './modules/calendar/data.js';

const FACT_CACHE_MS = Number(process.env.EINK_FACT_CACHE_MS || 60 * 60 * 1000);

let factCache = null;

function todayLocalDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}


function cleanFactText(text, max = 170) {
  const cleaned = String(text || '').replace(/\s+/g, ' ').replace(/\[[^\]]+\]/g, '').trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'family-eink-dashboard/1.0' } });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function onThisDay() {
  try {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const data = await fetchJson(`https://api.wikimedia.org/feed/v1/wikipedia/en/onthisday/events/${mm}/${dd}`);
    const events = Array.isArray(data.events) ? data.events : [];
    const event = events.find(e => String(e.text || '').length >= 40 && String(e.text || '').length <= 180) || events[0];
    if (!event) return null;
    return { title: 'On this day', text: `${event.year} — ${cleanFactText(event.text, 160)}` };
  } catch {
    return null;
  }
}

async function randomFact() {
  try {
    const data = await fetchJson('https://uselessfacts.jsph.pl/api/v2/facts/random?language=en');
    if (data?.text) return { title: 'Random fact', text: cleanFactText(data.text, 155) };
  } catch {}
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch('http://numbersapi.com/random/trivia', { signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) return { title: 'Random fact', text: cleanFactText(await res.text(), 155) };
  } catch {}
  return null;
}

async function facts() {
  if (process.env.EINK_FACTS_ENABLED === 'false') return { onThisDay: null, randomFact: null };
  const now = Date.now();
  if (factCache && now - factCache.createdAt < FACT_CACHE_MS) return factCache.value;
  const value = { onThisDay: await onThisDay(), randomFact: await randomFact() };
  factCache = { createdAt: now, value };
  return value;
}

export async function einkDashboard() {
  const [groceryItems, events, factData] = await Promise.all([
    listGroceryItems({ checked: 'false' }),
    calendarEvents(),
    facts(),
  ]);
  return {
    generatedAt: new Date().toISOString(),
    date: todayLocalDate(),
    calendar: events,
    grocery: groceryItems.slice(0, 12).map(item => ({
      id: item.id,
      title: item.title,
      quantity: item.quantity,
      category: item.category,
      store: item.store,
    })),
    ...factData,
  };
}

