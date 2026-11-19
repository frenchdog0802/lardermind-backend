/** Reply language of a chat turn. 'zh' = Traditional Chinese, 'en' = English. */
export type ChatLanguage = 'zh' | 'en';

export const DEFAULT_CHAT_LANGUAGE: ChatLanguage = 'en';

/** A message needs at least this many letters / CJK chars to set the language. */
export const MIN_LANGUAGE_LETTERS = 4;

/**
 * Normalise a client-supplied language tag by prefix: 'zh', 'zh-TW', 'zh_Hant',
 * 'ZH-cn' → 'zh'; 'en', 'en-US', 'EN_gb' → 'en'. Anything else → undefined
 * (ignored, so a bad value never fails the request).
 */
export function normalizeChatLanguage(raw: unknown): ChatLanguage | undefined {
  if (typeof raw !== 'string') return undefined;
  const tag = raw.trim().toLowerCase();
  if (/^zh(?:$|[-_])/.test(tag)) return 'zh';
  if (/^en(?:$|[-_])/.test(tag)) return 'en';
  return undefined;
}

const CJK_RE = /[㐀-䶿一-鿿豈-﫿]/g;
const LATIN_RE = /[A-Za-z]/g;

/**
 * Language of one message, or null when it is too short to tell (e.g. "A",
 * "ok", 「好」). A CJK character carries roughly a word, so it is weighted 3×
 * against Latin letters ("請把 salt 加入購物清單" → zh; "Add 排骨 to pantry" → en).
 */
export function detectMessageLanguage(text: string): ChatLanguage | null {
  const cjk = text.match(CJK_RE)?.length ?? 0;
  const latin = text.match(LATIN_RE)?.length ?? 0;
  if (cjk + latin < MIN_LANGUAGE_LETTERS) return null;
  return cjk * 3 >= latin ? 'zh' : 'en';
}

/**
 * Conversation language from user messages (oldest → newest): the newest
 * message with enough letters wins; short replies fall back to earlier ones;
 * default English.
 */
export function detectConversationLanguage(
  userMessages: readonly string[],
): ChatLanguage {
  for (let i = userMessages.length - 1; i >= 0; i--) {
    const found = detectMessageLanguage(userMessages[i] ?? '');
    if (found) return found;
  }
  return DEFAULT_CHAT_LANGUAGE;
}

/** Explicit (valid) client language wins; otherwise detect from the conversation. */
export function resolveChatLanguage(
  explicit: unknown,
  userMessages: readonly string[],
): ChatLanguage {
  return normalizeChatLanguage(explicit) ?? detectConversationLanguage(userMessages);
}

/** User-role text contents of LLM / history messages (oldest → newest). */
export function userTextsOf(
  messages: ReadonlyArray<{ role?: unknown; content?: unknown }>,
): string[] {
  return messages
    .filter((m) => m.role === 'user' && typeof m.content === 'string')
    .map((m) => m.content as string);
}

export function languageDisplayName(language: ChatLanguage): string {
  return language === 'zh' ? 'Traditional Chinese' : 'English';
}

/** Hard-coded server strings shown to the user, by reply language. */
const STRINGS = {
  approvalNeeded: {
    en: 'I need your approval before making these changes.',
    zh: '這些變更需要你先確認，我才會執行。',
  },
  pendingReminder: {
    en: 'There is a pending action waiting for your approval. Approve or reject it first.',
    zh: '有一個操作正在等你確認，請先核准或拒絕。',
  },
  meals: { en: 'meals', zh: '道菜' },
  more: { en: 'more', zh: '道' },
  remove: { en: 'remove', zh: '刪除' },
  update: { en: 'update', zh: '更新' },
  on: { en: 'on', zh: '於' },
  items: { en: 'item(s)', zh: '項' },
  updates: { en: 'update(s)', zh: '項更新' },
  missingIngredients: { en: 'missing ingredients', zh: '缺少的食材' },
  updatePreferences: { en: 'update preferences', zh: '更新偏好設定' },
  recipe: { en: 'recipe', zh: '食譜' },
  meal: { en: 'meal', zh: '餐點' },
} as const;

export type ServerStringKey = keyof typeof STRINGS;

export function t(key: ServerStringKey, language: ChatLanguage = DEFAULT_CHAT_LANGUAGE): string {
  return STRINGS[key][language];
}
