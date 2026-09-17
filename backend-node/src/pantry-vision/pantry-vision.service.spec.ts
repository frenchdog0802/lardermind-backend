import { parseRecognizedItems } from './openai-vision.prompt';
import { PantryVisionService } from './pantry-vision.service';

describe('parseRecognizedItems', () => {
  it('parses items and drops blank names', () => {
    const items = parseRecognizedItems({
      items: [
        { category: 'produce', name: 'tomato', quantity: 300, unit: 'g' },
        { category: 'other', name: '  ', quantity: 1, unit: 'pcs' },
        { name: 'milk', quantity: '2', unit: 'L' },
      ],
    });
    expect(items).toEqual([
      { category: 'produce', name: 'tomato', quantity: 300, unit: 'g' },
      { category: 'other', name: 'milk', quantity: 2, unit: 'L' },
    ]);
  });

  it('truncates to 25 items', () => {
    const raw = {
      items: Array.from({ length: 40 }, (_, i) => ({
        name: `item-${i}`,
        quantity: 1,
        unit: 'pcs',
        category: 'other',
      })),
    };
    expect(parseRecognizedItems(raw)).toHaveLength(25);
  });

  it('returns empty for non-food / empty payload', () => {
    expect(parseRecognizedItems({ items: [] })).toEqual([]);
    expect(parseRecognizedItems(null)).toEqual([]);
  });
});

describe('PantryVisionService.apply', () => {
  it('merge-adds cleaned items and counts added vs merged', async () => {
    const pantryItemsService = {
      mergeAddItem: jest
        .fn()
        .mockResolvedValueOnce({
          item: { id: '1', name: 'tomato', quantity: 300 },
          merged: false,
        })
        .mockResolvedValueOnce({
          item: { id: '2', name: 'milk', quantity: 3 },
          merged: true,
        }),
    };
    const service = new PantryVisionService(
      {} as never,
      {} as never,
      pantryItemsService as never,
    );

    const result = await service.apply('user-1', [
      { name: 'tomato', quantity: 300, unit: 'g', category: 'produce' },
      { name: '  ', quantity: 1, unit: 'pcs' },
      { name: 'milk', quantity: 1, unit: 'L' },
    ]);

    expect(pantryItemsService.mergeAddItem).toHaveBeenCalledTimes(2);
    expect(result.added).toBe(1);
    expect(result.merged).toBe(1);
    expect(result.items).toHaveLength(2);
  });

  it('rejects when all names blank', async () => {
    const service = new PantryVisionService(
      {} as never,
      {} as never,
      { mergeAddItem: jest.fn() } as never,
    );
    await expect(
      service.apply('user-1', [{ name: '  ', quantity: 1, unit: 'pcs' }]),
    ).rejects.toThrow('At least one item with a name is required');
  });
});
