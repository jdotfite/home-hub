import { nanoid } from 'nanoid';
import { nowIso, readStore, writeStore } from '../../db.js';

const shiftTypes = new Set(['day', 'night', 'double', 'weekend', 'other']);

function normalizeTipEntry(row) {
  if (!row) return null;
  return {
    id: row.id,
    profileId: row.profileId || 'wife',
    date: row.date,
    shiftType: shiftTypes.has(row.shiftType) ? row.shiftType : 'other',
    location: row.location || '',
    cashTips: Number(row.cashTips) || 0,
    cardTips: Number(row.cardTips) || 0,
    hours: row.hours != null ? Number(row.hours) : null,
    notes: row.notes || '',
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function validDateString(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day;
}

function validateEntry(input) {
  if (!validDateString(input.date)) {
    return 'date must be a valid YYYY-MM-DD string';
  }
  const cashTips = Number(input.cashTips);
  if (input.cashTips !== undefined && (!Number.isFinite(cashTips) || cashTips < 0)) {
    return 'cashTips must be a non-negative number';
  }
  const cardTips = Number(input.cardTips);
  if (input.cardTips !== undefined && (!Number.isFinite(cardTips) || cardTips < 0)) {
    return 'cardTips must be a non-negative number';
  }
  if (input.hours != null) {
    const hours = Number(input.hours);
    if (!Number.isFinite(hours) || hours <= 0) return 'hours must be a positive number';
  }
  return null;
}

function apiError(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

export async function createTipEntry(input = {}) {
  const errMsg = validateEntry(input);
  if (errMsg) throw apiError(errMsg, 400);

  const timestamp = nowIso();
  const entry = normalizeTipEntry({
    id: nanoid(12),
    profileId: 'wife',
    date: input.date,
    shiftType: input.shiftType || 'other',
    location: input.location || '',
    cashTips: Number(input.cashTips) || 0,
    cardTips: Number(input.cardTips) || 0,
    hours: input.hours != null ? Number(input.hours) : null,
    notes: input.notes || '',
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  const store = await readStore();
  store.tipEntries.push(entry);
  await writeStore(store);
  return entry;
}

export async function listTipEntries(query = {}) {
  const store = await readStore();
  let entries = (store.tipEntries || [])
    .map(normalizeTipEntry)
    .filter(Boolean)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  if (query.month) entries = entries.filter(e => e.date.startsWith(query.month));
  return entries;
}

export async function updateTipEntry(id, input = {}) {
  const store = await readStore();
  const index = store.tipEntries.findIndex(e => e.id === id);
  if (index === -1) throw apiError('Tip entry not found', 404);

  const current = store.tipEntries[index];
  const merged = { ...current, ...input };
  const errMsg = validateEntry(merged);
  if (errMsg) throw apiError(errMsg, 400);

  const updated = normalizeTipEntry({ ...merged, id: current.id, profileId: 'wife', updatedAt: nowIso() });
  store.tipEntries[index] = updated;
  await writeStore(store);
  return updated;
}

export async function deleteTipEntry(id) {
  const store = await readStore();
  const before = store.tipEntries.length;
  store.tipEntries = store.tipEntries.filter(e => e.id !== id);
  if (store.tipEntries.length === before) throw apiError('Tip entry not found', 404);
  await writeStore(store);
  return { removed: 1 };
}

export async function getTipSummary() {
  const entries = await listTipEntries();
  const today = new Date().toISOString().slice(0, 10);
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  const weekStart = d.toISOString().slice(0, 10);
  const monthPrefix = today.slice(0, 7);

  const shiftTotal = e => (Number(e.cashTips) || 0) + (Number(e.cardTips) || 0);
  const sum = arr => arr.reduce((s, e) => s + shiftTotal(e), 0);
  const round2 = n => Math.round(n * 100) / 100;

  const allTotal = sum(entries);
  return {
    total: round2(allTotal),
    thisWeek: round2(sum(entries.filter(e => e.date >= weekStart))),
    thisMonth: round2(sum(entries.filter(e => e.date.startsWith(monthPrefix)))),
    avgPerShift: round2(entries.length ? allTotal / entries.length : 0),
    entryCount: entries.length,
  };
}
