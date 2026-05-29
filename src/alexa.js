import { createGroceryItem, listGroceryItems, quickAdd } from './grocery.js';
import { listTasks } from './tasks.js';

function speech(text, shouldEndSession = true) {
  return {
    version: '1.0',
    response: {
      shouldEndSession,
      outputSpeech: { type: 'PlainText', text },
    },
  };
}

function slot(intent, name) {
  return intent?.slots?.[name]?.value?.trim() || '';
}

function requireAlexaToken(req) {
  const expected = process.env.ALEXA_API_TOKEN;
  if (!expected) return true;
  const provided = req.get('x-alexa-token') || req.query.token;
  return provided === expected;
}

function listForSpeech(items, noun) {
  if (!items.length) return `Your ${noun} list is empty.`;
  const names = items.slice(0, 8).map(item => item.quantity ? `${item.quantity} ${item.title}` : item.title);
  return `Your ${noun} list has ${names.join(', ')}.`;
}

export async function handleAlexaRequest(body = {}) {
  const request = body.request || {};
  if (request.type === 'LaunchRequest') {
    return speech('Todo is ready. You can say add milk to grocery, or what is on my todo list.', false);
  }

  const intent = request.intent || {};
  if (request.type === 'IntentRequest' && intent.name === 'AddGroceryItemIntent') {
    const item = slot(intent, 'Item');
    const quantity = slot(intent, 'Quantity');
    if (!item) return speech('What grocery item should I add?', false);
    const grocery = await createGroceryItem({ title: item, quantity, store: 'walmart', source: 'alexa' });
    return speech(`Added ${grocery.quantity ? grocery.quantity + ' ' : ''}${grocery.title} to your grocery list.`);
  }

  if (request.type === 'IntentRequest' && intent.name === 'AddTodoIntent') {
    const task = slot(intent, 'Task') || slot(intent, 'Item');
    if (!task) return speech('What todo should I add?', false);
    const result = await quickAdd(task, { source: 'alexa' });
    return speech(result.type === 'grocery' ? `Added ${result.item.title} to your grocery list.` : `Added ${result.task.title} to your todo list.`);
  }

  if (request.type === 'IntentRequest' && intent.name === 'ListGroceryIntent') {
    return speech(listForSpeech(await listGroceryItems({ checked: false }), 'grocery'));
  }

  if (request.type === 'IntentRequest' && intent.name === 'ListTodosIntent') {
    return speech(listForSpeech(await listTasks({ view: 'today', status: 'open' }), 'todo'));
  }

  return speech('I can add todos, add groceries, or read your lists.', false);
}

export async function alexaRoute(req, res) {
  if (!requireAlexaToken(req)) return res.status(401).json({ error: 'Unauthorized' });
  res.json(await handleAlexaRequest(req.body));
}
