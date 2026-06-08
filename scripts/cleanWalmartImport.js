// Removes all walmart-import items from the store to reduce DB blob size.
// Run after Neon quota resets or plan is upgraded:
//   node --env-file=.env scripts/cleanWalmartImport.js
import { readStore, writeStore } from '../src/db.js';

const store = await readStore();
const before = store.groceryItems?.length ?? 0;
store.groceryItems = (store.groceryItems || []).filter(i => i.source !== 'walmart-import');
const after = store.groceryItems.length;
await writeStore(store);
console.log(`Removed ${before - after} walmart-import items. Store now has ${after} grocery items.`);
