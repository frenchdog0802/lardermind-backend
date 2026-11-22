import { describe, expect, it } from 'vitest';
import { looksLikeMealPlanRequest } from './plan-intent';

describe('looksLikeMealPlanRequest', () => {
  it.each([
    'Plan my meals for the week',
    'can you plan dinners for next week?',
    'Make a weekly meal plan with chicken',
    'schedule 5 days of dinners',
    '幫我排一週的菜單',
    '安排本週晚餐',
    '規劃三天的餐點',
  ])('matches %s', (t) => expect(looksLikeMealPlanRequest(t)).toBe(true));

  it.each([
    'hello',
    'add 2 eggs to my pantry',
    'what can I cook with rice?',
    '加 3 顆蛋到庫存',
    '',
    null,
  ])('does not match %s', (t) => expect(looksLikeMealPlanRequest(t)).toBe(false));
});
