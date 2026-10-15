import { describe, expect, it } from 'vitest';
import { looksLikeMutatingUserRequest } from './mutating-intent';

describe('looksLikeMutatingUserRequest', () => {
  it('detects Chinese add-to-inventory requests', () => {
    expect(looksLikeMutatingUserRequest('幫我新增三份豬肉到庫存')).toBe(true);
    expect(looksLikeMutatingUserRequest('把雞蛋加入庫存')).toBe(true);
  });

  it('detects English pantry / shopping mutations', () => {
    expect(looksLikeMutatingUserRequest('add 3 portions of pork to my pantry')).toBe(
      true,
    );
    expect(looksLikeMutatingUserRequest('remove milk from inventory')).toBe(true);
    expect(looksLikeMutatingUserRequest('add eggs to shopping list')).toBe(true);
  });

  it('detects Chinese delete / reduce pantry amounts', () => {
    expect(looksLikeMutatingUserRequest('幫我刪除 10 包排骨')).toBe(true);
    expect(looksLikeMutatingUserRequest('排骨減 3 包')).toBe(true);
    expect(looksLikeMutatingUserRequest('從庫存刪除排骨')).toBe(true);
  });

  it('detects calendar schedule phrases', () => {
    expect(looksLikeMutatingUserRequest('幫我加到行事曆')).toBe(true);
    expect(looksLikeMutatingUserRequest('排進菜單')).toBe(true);
  });

  it('does not flag read-only pantry questions', () => {
    expect(looksLikeMutatingUserRequest('what is in my pantry?')).toBe(false);
    expect(looksLikeMutatingUserRequest('目前庫存有什麼')).toBe(false);
    expect(looksLikeMutatingUserRequest('我庫存有什麼')).toBe(false);
    expect(looksLikeMutatingUserRequest('suggest a recipe')).toBe(false);
  });
});
