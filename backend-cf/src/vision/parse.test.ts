import { describe, expect, it } from 'vitest';
import { MAX_VISION_ITEMS, parseVisionItemsJson } from './parse';

describe('vision parse', () => {
  it('parses and truncates items', () => {
    const items = Array.from({ length: 30 }, (_, i) => ({
      category: 'produce',
      name: `item-${i}`,
      quantity: i,
      unit: 'pcs',
    }));
    const parsed = parseVisionItemsJson(JSON.stringify({ items }));
    expect(parsed).toHaveLength(MAX_VISION_ITEMS);
    expect(parsed[0]?.name).toBe('item-0');
  });

  it('skips blank names and clamps quantity', () => {
    const parsed = parseVisionItemsJson(
      JSON.stringify({
        items: [
          { category: 'dairy', name: '  milk ', quantity: -2, unit: 'ml' },
          { category: 'x', name: '   ', quantity: 1, unit: 'pcs' },
          { name: 'eggs', quantity: '3', unit: '' },
        ],
      }),
    );
    expect(parsed).toEqual([
      { category: 'dairy', name: 'milk', quantity: 0, unit: 'ml' },
      { category: 'other', name: 'eggs', quantity: 3, unit: 'pcs' },
    ]);
  });

  it('accepts fenced JSON', () => {
    const parsed = parseVisionItemsJson(
      '```json\n{"items":[{"name":"tomato","quantity":2,"unit":"pcs","category":"produce"}]}\n```',
    );
    expect(parsed).toEqual([
      { category: 'produce', name: 'tomato', quantity: 2, unit: 'pcs' },
    ]);
  });
});
