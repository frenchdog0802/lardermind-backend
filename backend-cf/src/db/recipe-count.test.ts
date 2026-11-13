import { describe, expect, it } from 'vitest';
import { countRecipes } from './recipe';

describe('countRecipes', () => {
  it('returns COUNT(*) for the user', async () => {
    const db = {
      prepare(sql: string) {
        expect(sql).toContain('COUNT(*)');
        expect(sql).toContain('FROM recipes');
        let bound: unknown[] = [];
        return {
          bind(...args: unknown[]) {
            bound = args;
            return this;
          },
          async first<T>() {
            expect(bound[0]).toBe('user-a');
            return { n: 7 } as T;
          },
        };
      },
    } as unknown as D1Database;

    await expect(countRecipes(db, 'user-a')).resolves.toBe(7);
  });

  it('returns 0 when no row', async () => {
    const db = {
      prepare() {
        return {
          bind() {
            return this;
          },
          async first() {
            return null;
          },
        };
      },
    } as unknown as D1Database;

    await expect(countRecipes(db, 'user-b')).resolves.toBe(0);
  });
});
