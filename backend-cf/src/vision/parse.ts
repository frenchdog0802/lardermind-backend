export const VISION_SYSTEM_PROMPT = `You are a kitchen inventory estimator for LarderMind.
Look at the food photo and list visible grocery / ingredient items.
Return ONLY valid JSON with this shape:
{"items":[{"category":"produce|dairy|meat|seafood|pantry|frozen|beverage|other","name":"ingredient name","quantity":number,"unit":"g|kg|ml|L|pcs|tbsp|tsp|cup"}]}
Rules:
- Prefer mass (g/kg) or volume when estimable; otherwise use pcs.
- Use short English or Chinese names matching what a shopper would type.
- Do not invent items that are not visible.
- If no food is visible, return {"items":[]}.
- quantity must be a non-negative number.`;

export const MAX_VISION_ITEMS = 25;

export type RecognizedPantryDraft = {
  category: string;
  name: string;
  quantity: number;
  unit: string;
};

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function parseVisionItemsJson(raw: string): RecognizedPantryDraft[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Models sometimes wrap JSON in markdown fences.
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Vision response was not valid JSON');
    parsed = JSON.parse(match[0]);
  }

  const itemsUnknown =
    parsed &&
    typeof parsed === 'object' &&
    Array.isArray((parsed as { items?: unknown }).items)
      ? (parsed as { items: unknown[] }).items
      : null;

  if (!itemsUnknown) {
    throw new Error('Vision response missing items array');
  }

  const out: RecognizedPantryDraft[] = [];
  for (const row of itemsUnknown) {
    if (!row || typeof row !== 'object') continue;
    const obj = row as Record<string, unknown>;
    const name = typeof obj.name === 'string' ? obj.name.trim() : '';
    if (!name) continue;
    const qty = asNumber(obj.quantity);
    const quantity = qty == null ? 0 : Math.max(0, qty);
    const unit =
      typeof obj.unit === 'string' && obj.unit.trim()
        ? obj.unit.trim()
        : 'pcs';
    const category =
      typeof obj.category === 'string' && obj.category.trim()
        ? obj.category.trim()
        : 'other';
    out.push({ category, name, quantity, unit });
    if (out.length >= MAX_VISION_ITEMS) break;
  }
  return out;
}
