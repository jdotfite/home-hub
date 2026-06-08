import OpenAI from 'openai';

let client;
function getClient() {
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

const VISION_PROMPT = `Identify the grocery product(s) in this image.
Return JSON: {"items":[{"title":"string","quantity":"string","store":"walmart","category":"string"}]}
title: product name only. quantity: package size like "32 oz", "1 lb", "6 pack", or empty string.
store: "walmart" (default) or "household".
category: produce, dairy, meat, frozen, beverages, snacks, household, personal care, pets, or uncategorized.
If multiple distinct products are visible, include each one.`;

function categoryFromTags(tags) {
  const s = (tags || []).join(' ').toLowerCase();
  if (/dairy|milk|cheese|yogurt|butter/.test(s)) return 'dairy';
  if (/produce|fruit|vegetable|fresh/.test(s)) return 'produce';
  if (/meat|poultry|seafood|beef|chicken/.test(s)) return 'meat';
  if (/frozen/.test(s)) return 'frozen';
  if (/beverage|drink|water|juice|soda|coffee|tea/.test(s)) return 'beverages';
  if (/snack|chip|cracker|cookie|candy/.test(s)) return 'snacks';
  if (/household|cleaning|detergent|paper|trash/.test(s)) return 'household';
  if (/personal|hygiene|beauty|soap|shampoo|cosmetic/.test(s)) return 'personal care';
  if (/pet/.test(s)) return 'pets';
  return 'uncategorized';
}

async function lookupBarcode(barcode) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'home-hub-grocery/1.0' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== 1 || !data.product?.product_name) return null;
    const p = data.product;
    return [{
      title: p.product_name,
      quantity: p.quantity || '',
      store: 'walmart',
      category: categoryFromTags(p.categories_tags),
    }];
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function scanWithVision(imageDataUrl) {
  const result = await getClient().chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    messages: [{
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: imageDataUrl, detail: 'low' } },
        { type: 'text', text: VISION_PROMPT },
      ],
    }],
    max_tokens: 256,
  });
  const parsed = JSON.parse(result.choices[0].message.content);
  return Array.isArray(parsed.items) ? parsed.items : [];
}

export async function scanGrocery({ barcode, image }) {
  if (!barcode && !image) throw Object.assign(new Error('barcode or image required'), { status: 400 });

  if (barcode) {
    const items = await lookupBarcode(barcode);
    if (items?.length) return { items };
    // barcode not found in database — fall through to vision if image provided
    if (!image) return { items: [] };
  }

  return { items: await scanWithVision(image) };
}
