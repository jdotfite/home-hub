import test from 'node:test';
import assert from 'node:assert/strict';
import { resetForTests } from '../src/db.js';
import { createGroceryItem, listGroceryItems, updateGroceryItem, clearCheckedGroceryItems, quickAdd } from '../src/grocery.js';

test('grocery items can be created, listed, checked, and cleared', () => {
  resetForTests();
  const milk = createGroceryItem({ title: 'milk', store: 'walmart', quantity: '2' });
  createGroceryItem({ title: 'bananas', category: 'produce' });

  let items = listGroceryItems();
  assert.equal(items.length, 2);
  assert.equal(items[0].title, 'milk');
  assert.equal(items[0].store, 'walmart');
  assert.equal(items[0].quantity, '2');
  assert.equal(items[0].checked, false);

  const checked = updateGroceryItem(milk.id, { checked: true });
  assert.equal(checked.checked, true);

  const cleared = clearCheckedGroceryItems();
  assert.equal(cleared.removed, 1);
  items = listGroceryItems();
  assert.deepEqual(items.map(i => i.title), ['bananas']);
});

test('quickAdd routes grocery and walmart text to grocery items', () => {
  resetForTests();

  const walmart = quickAdd('walmart 2 paper towels');
  const grocery = quickAdd('grocery bananas');
  const todo = quickAdd('tomorrow call dentist');

  assert.equal(walmart.type, 'grocery');
  assert.equal(walmart.item.store, 'walmart');
  assert.equal(walmart.item.quantity, '2');
  assert.equal(walmart.item.title, 'paper towels');
  assert.equal(grocery.item.title, 'bananas');
  assert.equal(todo.type, 'task');
  assert.equal(todo.task.title, 'call dentist');
  assert.ok(todo.task.dueDate);
});
