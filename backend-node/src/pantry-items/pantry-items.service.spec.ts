import { PantryItemsService } from './pantry-items.service';

function createService(prisma: Record<string, unknown>): PantryItemsService {
  return new PantryItemsService(prisma as never);
}

describe('PantryItemsService.mergeAddItem', () => {
  it('creates when no existing pantry row', async () => {
    const ingredient = {
      id: 'ing-1',
      name: 'tomato',
      baseUnit: 'g',
      defaultUnit: 'g',
      unitKind: 'WEIGHT',
      defaultDisplayUnit: 'g',
    };
    const created = {
      id: 'p-1',
      userId: 'u1',
      ingredientId: 'ing-1',
      quantity: 300,
      unit: 'g',
      notes: null,
      createdAt: 1n,
      updatedAt: 1n,
      ingredient,
    };
    const prisma = {
      ingredient: {
        findFirst: jest.fn().mockResolvedValue(ingredient),
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      pantryItem: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(created),
        update: jest.fn(),
      },
    };

    const service = createService(prisma);
    const result = await service.mergeAddItem('u1', {
      name: 'tomato',
      quantity: 300,
      unit: 'g',
    });

    expect(result.merged).toBe(false);
    expect(result.item.quantity).toBe(300);
    expect(prisma.pantryItem.create).toHaveBeenCalled();
  });

  it('adds quantity for same unit', async () => {
    const ingredient = {
      id: 'ing-1',
      name: 'tomato',
      baseUnit: 'g',
      defaultUnit: 'g',
      unitKind: 'WEIGHT',
      defaultDisplayUnit: 'g',
    };
    const existing = {
      id: 'p-1',
      userId: 'u1',
      ingredientId: 'ing-1',
      quantity: 200,
      unit: 'g',
      notes: null,
      createdAt: 1n,
      updatedAt: 1n,
      ingredient,
    };
    const updated = { ...existing, quantity: 500, updatedAt: 2n };
    const prisma = {
      ingredient: {
        findFirst: jest.fn().mockResolvedValue(ingredient),
      },
      pantryItem: {
        findFirst: jest.fn().mockResolvedValue(existing),
        create: jest.fn(),
        update: jest.fn().mockResolvedValue(updated),
      },
    };

    const service = createService(prisma);
    const result = await service.mergeAddItem('u1', {
      name: 'tomato',
      quantity: 300,
      unit: 'g',
    });

    expect(result.merged).toBe(true);
    expect(prisma.pantryItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ quantity: 500, unit: 'g' }),
      }),
    );
  });

  it('converts kg to g before adding when kinds match', async () => {
    const ingredient = {
      id: 'ing-1',
      name: 'flour',
      baseUnit: 'g',
      defaultUnit: 'g',
      unitKind: 'WEIGHT',
      defaultDisplayUnit: 'g',
    };
    const existing = {
      id: 'p-1',
      userId: 'u1',
      ingredientId: 'ing-1',
      quantity: 500,
      unit: 'g',
      notes: null,
      createdAt: 1n,
      updatedAt: 1n,
      ingredient,
    };
    const updated = { ...existing, quantity: 1500, updatedAt: 2n };
    const prisma = {
      ingredient: {
        findFirst: jest.fn().mockResolvedValue(ingredient),
      },
      pantryItem: {
        findFirst: jest.fn().mockResolvedValue(existing),
        update: jest.fn().mockResolvedValue(updated),
      },
    };

    const service = createService(prisma);
    await service.mergeAddItem('u1', {
      name: 'flour',
      quantity: 1,
      unit: 'kg',
    });

    expect(prisma.pantryItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ quantity: 1500, unit: 'g' }),
      }),
    );
  });
});
