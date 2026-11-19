import { describe, expect, it } from 'vitest';
import {
  isAffirmativeReply,
  isNegativeReply,
  looksLikeConfirmingWriteOffer,
  looksLikeFalseMutationSuccess,
  looksLikeMutatingUserRequest,
} from './mutating-intent';

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

  it('does not flag draft grocery / shopping list planning asks', () => {
    expect(
      looksLikeMutatingUserRequest('make a grocery list of missing items'),
    ).toBe(false);
    expect(
      looksLikeMutatingUserRequest('create a shopping list for the week'),
    ).toBe(false);
    expect(
      looksLikeMutatingUserRequest('what should I buy for this week?'),
    ).toBe(false);
    expect(
      looksLikeMutatingUserRequest('Plan a week + grocery list of missing items'),
    ).toBe(false);
    expect(looksLikeMutatingUserRequest('幫我列一個購物清單')).toBe(false);
  });

  it('still flags explicit save-to-shopping writes', () => {
    expect(
      looksLikeMutatingUserRequest('add the missing items to my shopping list'),
    ).toBe(true);
    expect(
      looksLikeMutatingUserRequest(
        'make a grocery list of missing items and add them to my shopping list',
      ),
    ).toBe(true);
  });
});

describe('looksLikeFalseMutationSuccess', () => {
  it('detects Chinese false pantry write claims', () => {
    expect(
      looksLikeFalseMutationSuccess(
        '好的，我幫你記下：豬肉 3 份已加入庫存 ✅',
      ),
    ).toBe(true);
  });

  it('allows planning text without write claims', () => {
    expect(
      looksLikeFalseMutationSuccess(
        'Here is a draft grocery list of missing items for the week.',
      ),
    ).toBe(false);
  });
});

describe('looksLikeConfirmingWriteOffer', () => {
  const offer = 'Here is a recipe. Would you like me to save it to your recipes?';

  it('treats a bare yes after a save offer as a write request', () => {
    expect(looksLikeConfirmingWriteOffer('yes', offer)).toBe(true);
    expect(looksLikeConfirmingWriteOffer('Yes, please!', offer)).toBe(true);
    expect(looksLikeConfirmingWriteOffer('save it', offer)).toBe(true);
    expect(looksLikeConfirmingWriteOffer('好', '要不要幫你儲存這個食譜？')).toBe(true);
  });

  it('ignores confirmations without a prior write offer', () => {
    expect(looksLikeConfirmingWriteOffer('yes', 'Chicken pairs well with lemon.')).toBe(
      false,
    );
    expect(looksLikeConfirmingWriteOffer('yes', undefined)).toBe(false);
  });

  it('ignores non-confirmation replies', () => {
    expect(looksLikeConfirmingWriteOffer('what about pasta instead?', offer)).toBe(false);
  });
});

describe('isAffirmativeReply / isNegativeReply', () => {
  it('matches natural affirmatives, including multi-phrase', () => {
    for (const t of ['yes', 'yes, save it', 'Yes please', 'ok', 'approve', 'save it', 'go ahead', '好', '好的', '確認', '好，謝謝']) {
      expect(isAffirmativeReply(t), t).toBe(true);
      expect(isNegativeReply(t), t).toBe(false);
    }
  });

  it('matches natural negatives', () => {
    for (const t of ['no', 'No thanks', 'cancel', 'reject', "don't save it", '不要', '取消', '不用了']) {
      expect(isNegativeReply(t), t).toBe(true);
      expect(isAffirmativeReply(t), t).toBe(false);
    }
  });

  it('rejects mixed or unrelated text', () => {
    for (const t of ['no, save it', 'yes but make it 3', 'add milk too', 'what can I cook?', '']) {
      expect(isAffirmativeReply(t), t).toBe(false);
      expect(isNegativeReply(t), t).toBe(false);
    }
  });

  it('confirming-write-offer now matches "yes, save it"', () => {
    expect(
      looksLikeConfirmingWriteOffer('yes, save it', 'Would you like me to save this to your pantry?'),
    ).toBe(true);
  });
});
