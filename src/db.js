import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export const dbPath = resolve(process.env.TODO_DB || './data/todo.json');
mkdirSync(dirname(dbPath), { recursive: true });

function emptyStore() {
  return { tasks: [] };
}

export function migrate() {
  mkdirSync(dirname(dbPath), { recursive: true });
  if (!existsSync(dbPath)) writeStore(emptyStore());
}

export function readStore() {
  migrate();
  try {
    const parsed = JSON.parse(readFileSync(dbPath, 'utf8'));
    if (!parsed || !Array.isArray(parsed.tasks)) return emptyStore();
    return parsed;
  } catch {
    return emptyStore();
  }
}

export function writeStore(store) {
  mkdirSync(dirname(dbPath), { recursive: true });
  const tmp = `${dbPath}.tmp`;
  writeFileSync(tmp, JSON.stringify(store, null, 2));
  writeFileSync(dbPath, JSON.stringify(store, null, 2));
}

export function resetForTests() {
  writeStore(emptyStore());
}

export function nowIso() {
  return new Date().toISOString();
}

export function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

migrate();
