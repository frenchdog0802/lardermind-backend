/** Reply languages the assistant supports. 'zh' = Traditional Chinese. */
export const CHAT_LANGUAGES = ['en', 'zh', 'es', 'fr', 'de', 'ja'] as const;

/** Reply language of a chat turn. */
export type ChatLanguage = (typeof CHAT_LANGUAGES)[number];

export const DEFAULT_CHAT_LANGUAGE: ChatLanguage = 'en';

/** A message needs at least this many letters / CJK chars to set the language. */
export const MIN_LANGUAGE_LETTERS = 4;

/**
 * Normalise a client-supplied language tag by primary subtag: 'zh', 'zh-TW', 'zh_Hant',
 * 'ZH-cn' → 'zh'; 'en-US' → 'en'; likewise es / fr / de / ja. Anything else → undefined
 * (ignored, so a bad value never fails the request).
 */
export function normalizeChatLanguage(raw: unknown): ChatLanguage | undefined {
  if (typeof raw !== 'string') return undefined;
  const tag = raw.trim().toLowerCase();
  const m = /^([a-z]{2})(?:$|[-_])/.exec(tag);
  if (!m) return undefined;
  return (CHAT_LANGUAGES as readonly string[]).includes(m[1]) ? (m[1] as ChatLanguage) : undefined;
}

const CJK_RE = /[㐀-䶿一-鿿豈-﫿]/g;
const KANA_RE = /[぀-ヿ]/g;
const LATIN_RE = /[A-Za-z]/g;

/**
 * Language of one message, or null when it is too short to tell (e.g. "A",
 * "ok", 「好」). A CJK character carries roughly a word, so it is weighted 3×
 * against Latin letters ("請把 salt 加入購物清單" → zh; "Add 排骨 to pantry" → en).
 */
export function detectMessageLanguage(text: string): ChatLanguage | null {
  // Hiragana / katakana only occur in Japanese; a few kana are enough to tell it from Chinese.
  const kana = text.match(KANA_RE)?.length ?? 0;
  if (kana >= 2) return 'ja';
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

const DISPLAY_NAMES: Record<ChatLanguage, string> = {
  en: 'English',
  zh: 'Traditional Chinese',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  ja: 'Japanese',
};

export function languageDisplayName(language: ChatLanguage): string {
  return DISPLAY_NAMES[language];
}

/** Hard-coded server strings shown to the user, by reply language. */
const STRINGS = {
  approvalNeeded: {
    en: 'I need your approval before making these changes.',
    zh: '這些變更需要你先確認，我才會執行。',
    es: 'Necesito tu aprobación antes de hacer estos cambios.',
    fr: "J'ai besoin de ton accord avant d'effectuer ces modifications.",
    de: 'Ich brauche deine Zustimmung, bevor ich diese Änderungen vornehme.',
    ja: 'これらの変更を行う前に、あなたの承認が必要です。',
  },
  pendingReminder: {
    en: 'There is a pending action waiting for your approval. Approve or reject it first.',
    zh: '有一個操作正在等你確認，請先核准或拒絕。',
    es: 'Hay una acción pendiente de tu aprobación. Apruébala o recházala primero.',
    fr: "Une action attend ton approbation. Approuve-la ou refuse-la d'abord.",
    de: 'Eine Aktion wartet auf deine Freigabe. Bestätige oder lehne sie zuerst ab.',
    ja: '承認待ちの操作があります。先に承認または却下してください。',
  },
  meals: { en: 'meals', zh: '道菜', es: 'comidas', fr: 'repas', de: 'Gerichte', ja: '食' },
  more: { en: 'more', zh: '道', es: 'más', fr: 'de plus', de: 'weitere', ja: '件' },
  remove: { en: 'remove', zh: '刪除', es: 'eliminar', fr: 'supprimer', de: 'entfernen', ja: '削除' },
  update: { en: 'update', zh: '更新', es: 'actualizar', fr: 'mettre à jour', de: 'aktualisieren', ja: '更新' },
  on: { en: 'on', zh: '於', es: 'el', fr: 'le', de: 'am', ja: '：' },
  items: { en: 'item(s)', zh: '項', es: 'artículo(s)', fr: 'article(s)', de: 'Artikel', ja: '個' },
  updates: { en: 'update(s)', zh: '項更新', es: 'actualización(es)', fr: 'mise(s) à jour', de: 'Aktualisierung(en)', ja: '件の更新' },
  missingIngredients: { en: 'missing ingredients', zh: '缺少的食材', es: 'ingredientes que faltan', fr: 'ingrédients manquants', de: 'fehlende Zutaten', ja: '足りない食材' },
  updatePreferences: { en: 'update preferences', zh: '更新偏好設定', es: 'actualizar preferencias', fr: 'mettre à jour les préférences', de: 'Einstellungen aktualisieren', ja: '設定を更新' },
  recipe: { en: 'recipe', zh: '食譜', es: 'receta', fr: 'recette', de: 'Rezept', ja: 'レシピ' },
  meal: { en: 'meal', zh: '餐點', es: 'comida', fr: 'repas', de: 'Mahlzeit', ja: '食事' },
} as const;

export type ServerStringKey = keyof typeof STRINGS;

export function t(key: ServerStringKey, language: ChatLanguage = DEFAULT_CHAT_LANGUAGE): string {
  return STRINGS[key][language];
}
