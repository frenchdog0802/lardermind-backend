import { describe, expect, it } from 'vitest';
import type { Env } from '../env';
import { checkoutReturnUrls } from './stripe';

describe('checkoutReturnUrls', () => {
  it('returns to the SPA with ?subscription=success / cancelled', () => {
    const urls = checkoutReturnUrls({ FRONTEND_URL: 'https://lardermind.com/' } as Env);
    expect(urls.successUrl).toBe('https://lardermind.com/?subscription=success');
    expect(urls.cancelUrl).toBe('https://lardermind.com/?subscription=cancelled');
  });
});
