export const MAX_RECOGNIZED_ITEMS = 25;

export const VISION_SYSTEM_PROMPT = `You are a kitchen inventory assistant. Look at the photo and identify visible food ingredients suitable for a home pantry.

For each distinct ingredient estimate:
- category: one of produce, dairy, meat, seafood, bakery, pantry, beverage, frozen, other
- name: common grocery name (singular or standard form, English unless labels clearly another language)
- quantity: approximate amount as a positive number
- unit: prefer mass (g, kg) or volume (ml, L) when estimable; otherwise pcs/count units

Return ONLY JSON matching the schema. If nothing edible is visible, return {"items":[]}.
Do not invent items that are not reasonably visible. Quantities are approximate guesses.`;

export type RecognizedPantryItem = {
  category: string;
  name: string;
  quantity: number;
  unit: string;
};

export function parseRecognizedItems(raw: unknown): RecognizedPantryItem[] {
  const root =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : null;
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray(root?.items)
      ? root.items
      : [];

  const items: RecognizedPantryItem[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    const name = String(row.name ?? '').trim();
    if (!name) continue;
    const quantityRaw = Number(row.quantity);
    const quantity = Number.isFinite(quantityRaw)
      ? Math.max(0, quantityRaw)
      : 0;
    const unit = String(row.unit ?? 'pcs').trim() || 'pcs';
    const category = String(row.category ?? 'other').trim() || 'other';
    items.push({ category, name, quantity, unit });
    if (items.length >= MAX_RECOGNIZED_ITEMS) break;
  }
  return items;
}
