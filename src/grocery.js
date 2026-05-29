import { nanoid } from 'nanoid';
import { nowIso, readStore, todayIsoDate, writeStore } from './db.js';
import { createTask } from './tasks.js';

function normalizeItem(item) {
  if (!item) return null;
  return {
    id: item.id,
    title: item.title,
    quantity: item.quantity || '',
    store: item.store || 'walmart',
    category: item.category || 'uncategorized',
    checked: Boolean(item.checked),
    addedBy: item.addedBy || '',
    source: item.source || 'app',
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    checkedAt: item.checkedAt || null,
  };
}

function ensureGrocery(store) {
  if (!Array.isArray(store.groceryItems)) store.groceryItems = [];
  return store.groceryItems;
}

function parseQuantity(title) {
  const match = String(title).trim().match(/^(\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten)\s+(.+)$/i);
  if (!match) return { quantity: '', title: String(title).trim() };
  const words = { one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10' };
  return { quantity: words[match[1].toLowerCase()] || match[1], title: match[2].trim() };
}

function guessCategory(title) {
  const s = title.toLowerCase();
  if (/banana|apple|lettuce|tomato|onion|potato|berry|berries|produce/.test(s)) return 'produce';
  if (/milk|cheese|yogurt|butter|cream|egg/.test(s)) return 'dairy';
  if (/towel|toilet|soap|detergent|trash|bag|foil|paper/.test(s)) return 'household';
  if (/dog|cat|pet/.test(s)) return 'pets';
  if (/nugget|pizza|frozen|ice cream/.test(s)) return 'frozen';
  return 'uncategorized';
}

export function createGroceryItem(input) {
  const parsed = parseQuantity(input.title || '');
  const title = String(parsed.title || '').trim();
  if (!title) throw Object.assign(new Error('Grocery item title is required'), { status: 400 });
  const timestamp = nowIso();
  const item = {
    id: nanoid(12),
    title,
    quantity: String(input.quantity || parsed.quantity || '').trim(),
    store: String(input.store || 'walmart').trim().toLowerCase() || 'walmart',
    category: String(input.category || guessCategory(title)).trim().toLowerCase() || 'uncategorized',
    checked: Boolean(input.checked),
    addedBy: String(input.addedBy || '').trim(),
    source: String(input.source || 'app').trim().toLowerCase() || 'app',
    createdAt: timestamp,
    updatedAt: timestamp,
    checkedAt: input.checked ? timestamp : null,
  };
  const store = readStore();
  ensureGrocery(store).push(item);
  writeStore(store);
  return normalizeItem(item);
}

export function listGroceryItems(filters = {}) {
  let items = ensureGrocery(readStore()).map(normalizeItem);
  if (filters.checked !== undefined) items = items.filter(i => i.checked === (filters.checked === true || filters.checked === 'true'));
  if (filters.store) items = items.filter(i => i.store === String(filters.store).toLowerCase());
  if (filters.category) items = items.filter(i => i.category === String(filters.category).toLowerCase());
  return items.sort((a, b) => Number(a.checked) - Number(b.checked) || a.category.localeCompare(b.category) || a.createdAt.localeCompare(b.createdAt));
}

export function updateGroceryItem(id, patch) {
  const store = readStore();
  const items = ensureGrocery(store);
  const item = items.find(i => i.id === id);
  if (!item) throw Object.assign(new Error('Grocery item not found'), { status: 404 });
  for (const key of ['title', 'quantity', 'store', 'category', 'addedBy', 'source']) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) item[key] = String(patch[key] || '').trim().toLowerCase();
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'title')) item.title = String(patch.title || '').trim();
  if (Object.prototype.hasOwnProperty.call(patch, 'checked')) {
    item.checked = Boolean(patch.checked);
    item.checkedAt = item.checked ? nowIso() : null;
  }
  item.updatedAt = nowIso();
  writeStore(store);
  return normalizeItem(item);
}

export function clearCheckedGroceryItems() {
  const store = readStore();
  const before = ensureGrocery(store).length;
  store.groceryItems = store.groceryItems.filter(i => !i.checked);
  writeStore(store);
  return { removed: before - store.groceryItems.length };
}

function tomorrow() {
  const d = new Date(`${todayIsoDate()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function quickAdd(text, options = {}) {
  let raw = String(text || '').trim();
  if (!raw) throw Object.assign(new Error('Text is required'), { status: 400 });
  const lower = raw.toLowerCase();
  if (lower.startsWith('walmart ') || lower.startsWith('grocery ')) {
    const store = lower.startsWith('walmart ') ? 'walmart' : (options.store || 'walmart');
    raw = raw.replace(/^(walmart|grocery)\s+/i, '');
    return { type: 'grocery', item: createGroceryItem({ title: raw, store, source: options.source || 'quick-add', addedBy: options.addedBy || '' }) };
  }
  let dueDate = null;
  if (lower.startsWith('tomorrow ')) {
    raw = raw.replace(/^tomorrow\s+/i, '');
    dueDate = tomorrow();
  }
  return { type: 'task', task: createTask({ title: raw, dueDate, project: options.project || 'inbox' }) };
}
