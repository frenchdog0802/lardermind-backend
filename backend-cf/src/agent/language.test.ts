import { describe, expect, it } from 'vitest';
import {
  detectConversationLanguage,
  detectMessageLanguage,
  normalizeChatLanguage,
  resolveChatLanguage,
  t,
  userTextsOf,
} from './language';

describe('normalizeChatLanguage', () => {
  it('accepts zh / en and locale tags by prefix, case-insensitively', () => {
    for (const tag of ['zh', 'zh-TW', 'zh-CN', 'zh_Hant', 'ZH-hk', ' zh ']) {
      expect(normalizeChatLanguage(tag)).toBe('zh');
    }
    for (const tag of ['en', 'en-US', 'en_GB', 'EN']) {
      expect(normalizeChatLanguage(tag)).toBe('en');
    }
  });

  it('ignores missing or unknown values', () => {
    for (const tag of [undefined, null, '', 'fr', 'japanese', 'zhx', 'eng', 42]) {
      expect(normalizeChatLanguage(tag)).toBeUndefined();
    }
  });
});

describe('detectMessageLanguage', () => {
  it('detects CJK and English messages', () => {
    expect(detectMessageLanguage('幫我規劃五天的晚餐')).toBe('zh');
    expect(detectMessageLanguage('請把 salt 加入購物清單')).toBe('zh');
    expect(detectMessageLanguage('Plan five dinners for me')).toBe('en');
    expect(detectMessageLanguage('Add 排骨 to my pantry please')).toBe('en');
  });

  it('returns null for short replies that must not override the language', () => {
    for (const short of ['A', 'ok', 'OK!', '好', '好的', 'B)', '1', '👍', 'yes']) {
      expect(detectMessageLanguage(short)).toBeNull();
    }
  });
});

describe('detectConversationLanguage', () => {
  it('a short reply falls back to the previous substantive user message', () => {
    expect(detectConversationLanguage(['幫我規劃五天晚餐，每天一道主菜加一道青菜', 'A'])).toBe('zh');
    expect(detectConversationLanguage(['幫我規劃晚餐', 'ok'])).toBe('zh');
    expect(detectConversationLanguage(['Plan five dinners with a side each', '好'])).toBe('en');
  });

  it('the newest substantive message wins', () => {
    expect(detectConversationLanguage(['幫我規劃晚餐', 'Actually, answer in English please'])).toBe('en');
    expect(detectConversationLanguage(['Plan dinners', '我想改成中文回答'])).toBe('zh');
  });

  it('defaults to English', () => {
    expect(detectConversationLanguage([])).toBe('en');
    expect(detectConversationLanguage(['A', 'ok'])).toBe('en');
  });
});

describe('resolveChatLanguage', () => {
  it('an explicit client language wins over detection', () => {
    expect(resolveChatLanguage('zh-TW', ['Plan five dinners'])).toBe('zh');
    expect(resolveChatLanguage('en-US', ['幫我規劃晚餐'])).toBe('en');
  });

  it('absent or invalid field falls back to the conversation', () => {
    expect(resolveChatLanguage(undefined, ['幫我規劃晚餐', 'A'])).toBe('zh');
    expect(resolveChatLanguage('klingon', ['幫我規劃晚餐'])).toBe('zh');
  });

  it('userTextsOf keeps only user string contents in order', () => {
    expect(
      userTextsOf([
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'one' },
        { role: 'assistant', content: 'two' },
        { role: 'tool', content: '{}' },
        { role: 'user', content: 'three' },
        { role: 'user', content: null },
      ]),
    ).toEqual(['one', 'three']);
  });
});

describe('server strings', () => {
  it('localises the approval message', () => {
    expect(t('approvalNeeded', 'en')).toBe('I need your approval before making these changes.');
    expect(t('approvalNeeded', 'zh')).toMatch(/確認/);
    expect(t('approvalNeeded')).toBe(t('approvalNeeded', 'en'));
  });
});
