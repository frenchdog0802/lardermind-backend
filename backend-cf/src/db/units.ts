/**
 * App unit list (mirrors the web app's src/utils/units.ts), alias mapping,
 * standard conversions, and ingredient-name matching helpers.
 *
 * Kept dependency-free so db/meal-plan.ts and the agent tools can share it.
 */

export const WEIGHT_UNITS = ['g', 'kg', 'oz', 'lb'] as const;
export const VOLUME_UNITS = ['ml', 'l', 'tsp', 'tbsp', 'cup'] as const;
export const COUNT_UNITS = [
  'pcs',
  'clove',
  'can',
  'slice',
  'stalk',
  'bunch',
] as const;
export const APP_UNITS: readonly string[] = [
  ...WEIGHT_UNITS,
  ...VOLUME_UNITS,
  ...COUNT_UNITS,
];

export type UnitKind = 'weight' | 'volume' | 'count';

const ALIASES: Record<string, string> = {
  gram: 'g', grams: 'g', gr: 'g',
  kilogram: 'kg', kilograms: 'kg', kgs: 'kg',
  ounce: 'oz', ounces: 'oz',
  pound: 'lb', pounds: 'lb', lbs: 'lb',
  milliliter: 'ml', milliliters: 'ml', millilitre: 'ml', millilitres: 'ml', mls: 'ml',
  liter: 'l', liters: 'l', litre: 'l', litres: 'l',
  teaspoon: 'tsp', teaspoons: 'tsp', tsps: 'tsp',
  tablespoon: 'tbsp', tablespoons: 'tbsp', tbsps: 'tbsp', tb: 'tbsp',
  cups: 'cup',
  pc: 'pcs', piece: 'pcs', pieces: 'pcs', ea: 'pcs', each: 'pcs', unit: 'pcs', units: 'pcs',
  cloves: 'clove', cans: 'can', slices: 'slice', stalks: 'stalk', bunches: 'bunch',
  '大匙': 'tbsp', '湯匙': 'tbsp', '汤匙': 'tbsp',
  '小匙': 'tsp', '茶匙': 'tsp',
  '杯': 'cup',
  '克': 'g', '公克': 'g',
  '公斤': 'kg',
  '毫升': 'ml',
  '升': 'l', '公升': 'l',
  '顆': 'pcs', '颗': 'pcs', '個': 'pcs', '个': 'pcs', '塊': 'pcs', '块': 'pcs',
  '條': 'pcs', '条': 'pcs', '根': 'pcs',
  '片': 'slice',
  '瓣': 'clove',
  '罐': 'can',
  '把': 'bunch', '束': 'bunch',
};

/** Alias-resolved unit when it is one of the app's units; otherwise null. */
export function canonicalUnit(raw: string | null | undefined): string | null {
  const key = raw?.trim().toLowerCase();
  if (!key) return null;
  const mapped = ALIASES[key] ?? key;
  return APP_UNITS.includes(mapped) ? mapped : null;
}

export function unitKind(unit: string | null | undefined): UnitKind | null {
  const u = canonicalUnit(unit);
  if (!u) return null;
  if ((WEIGHT_UNITS as readonly string[]).includes(u)) return 'weight';
  if ((VOLUME_UNITS as readonly string[]).includes(u)) return 'volume';
  return 'count';
}

const TO_BASE: Record<string, number> = {
  g: 1, kg: 1000, oz: 28.3495, lb: 453.592,
  ml: 1, l: 1000, tsp: 5, tbsp: 15, cup: 240,
};

/**
 * Convert within one measurement family (weight <-> weight, volume <-> volume).
 * Count units only convert to themselves. Returns null when not convertible.
 */
export function standardConvert(
  qty: number,
  fromUnit: string | null | undefined,
  toUnit: string | null | undefined,
): number | null {
  const from = canonicalUnit(fromUnit);
  const to = canonicalUnit(toUnit);
  if (!from || !to || !Number.isFinite(qty)) return null;
  if (from === to) return qty;
  const kind = unitKind(from);
  if (kind === 'count' || kind !== unitKind(to)) return null;
  return (qty * TO_BASE[from]!) / TO_BASE[to]!;
}

// ---------------------------------------------------------------------------
// Density (volume <-> weight) for common kitchen ingredients
// ---------------------------------------------------------------------------

/** Approx. grams per millilitre, matched against the ingredient name. */
const DENSITY_G_PER_ML: Array<[RegExp, number]> = [
  [/\b(salt)\b|鹽|盐/, 1.2],
  [/\b(brown sugar)\b/, 0.93],
  [/\b(icing sugar|powdered sugar|confectioners)\b/, 0.56],
  [/\b(sugar)\b|糖/, 0.85],
  [/\b(flour|cornflour|cornstarch|starch)\b|麵粉|面粉|澱粉|淀粉/, 0.53],
  [/\b(rice)\b|米/, 0.85],
  [/\b(butter)\b|奶油|牛油/, 0.96],
  [/\b(oats?)\b/, 0.4],
  [/\b(cocoa)\b/, 0.5],
  [/\b(baking powder|baking soda|yeast)\b/, 0.9],
  [/\b(honey|maple syrup)\b|蜂蜜/, 1.4],
  [/\b(oil)\b|油/, 0.92],
  [/\b(milk|cream)\b|牛奶|鮮奶|鲜奶/, 1.03],
  [/\b(water)\b|水/, 1],
  [
    /\b(spice|spices|pepper|cinnamon|paprika|cumin|turmeric|chili powder|curry powder|powder|seasoning)\b|胡椒|香料/,
    0.5,
  ],
];

/** Dry staples that should be weighed (g) rather than measured by volume. */
const DRY_GOOD_HINT =
  /\b(salt|sugar|flour|cornflour|cornstarch|starch|rice|butter|oats?|cocoa|baking powder|baking soda|yeast|spice|spices|pepper|cinnamon|paprika|cumin|turmeric|chili powder|curry powder|seasoning)\b|鹽|盐|糖|麵粉|面粉|澱粉|淀粉|奶油|牛油|胡椒|香料/;
const NOT_DRY_HINT = /\b(syrup|sauce|oil|vinegar|milk|juice)\b|醬油|酱油|油|醋/;

export function densityForName(name: string | null | undefined): number | null {
  const n = (name ?? '').toLowerCase();
  if (!n) return null;
  for (const [re, d] of DENSITY_G_PER_ML) if (re.test(n)) return d;
  return null;
}

export function isDryGood(name: string | null | undefined): boolean {
  const n = (name ?? '').toLowerCase();
  return DRY_GOOD_HINT.test(n) && !NOT_DRY_HINT.test(n);
}

/**
 * standardConvert, plus weight <-> volume via a small density table when the
 * ingredient name is known. Returns null when the pair is not convertible.
 */
export function convertQty(
  qty: number,
  fromUnit: string | null | undefined,
  toUnit: string | null | undefined,
  name?: string | null,
): number | null {
  const direct = standardConvert(qty, fromUnit, toUnit);
  if (direct != null) return direct;
  const from = canonicalUnit(fromUnit);
  const to = canonicalUnit(toUnit);
  if (!from || !to || !Number.isFinite(qty)) return null;
  const kf = unitKind(from);
  const kt = unitKind(to);
  const density = densityForName(name);
  if (density == null) return null;
  if (kf === 'volume' && kt === 'weight') {
    return (qty * TO_BASE[from]! * density) / TO_BASE[to]!;
  }
  if (kf === 'weight' && kt === 'volume') {
    return (qty * TO_BASE[from]!) / density / TO_BASE[to]!;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Name matching
// ---------------------------------------------------------------------------

const NAME_NOISE = new Set([
  'fresh', 'large', 'small', 'medium', 'whole', 'organic', 'ripe', 'raw',
  'extra', 'virgin', 'pure', 'plain', 'free-range', 'freerange', 'big',
]);

function singularToken(t: string): string {
  if (t.length <= 3 || /[^a-z]/.test(t)) return t;
  if (t.endsWith('ies') && t.length > 4) return `${t.slice(0, -3)}y`;
  if (/(oes|ches|shes|xes|sses)$/.test(t)) return t.slice(0, -2);
  if (t.endsWith('s') && !t.endsWith('ss') && !t.endsWith('us')) {
    return t.slice(0, -1);
  }
  return t;
}

/**
 * Comparison key for an ingredient / pantry name: lowercase, no parentheticals
 * or filler adjectives, singular tokens ("Eggs" == "egg", "Tomatoes" == "tomato").
 */
export function ingredientNameKey(name: string | null | undefined): string {
  const base = (name ?? '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[,;]+/g, ' ')
    .trim();
  const tokens = base
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => !NAME_NOISE.has(t))
    .map(singularToken);
  return tokens.join(' ');
}

export function namesMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const ka = ingredientNameKey(a);
  return ka !== '' && ka === ingredientNameKey(b);
}

// ---------------------------------------------------------------------------
// Tool-side unit constraint (the assistant must only use app units)
// ---------------------------------------------------------------------------

const LIQUID_HINT =
  /\b(milk|juice|oil|water|vinegar|broth|stock|cream|wine|sauce|syrup|soda|beer|coffee|tea|yogurt drink)\b|牛奶|鮮奶|鲜奶|果汁|油|醋|醬油|酱油|高湯|高汤|水/;
const WEIGHT_HINT =
  /\b(flour|sugar|rice|salt|butter|cheese|beef|pork|chicken|lamb|fish|salmon|shrimp|pasta|noodle|noodles|oats|lentil|lentils|beans|nuts|powder|mince|meat|tofu)\b|麵粉|面粉|糖|米|鹽|盐|奶油|起司|牛肉|豬肉|猪肉|雞肉|鸡肉/;

/** Reasonable app unit for a name + quantity when no usable unit was supplied. */
export function defaultUnitForItem(
  name: string | null | undefined,
  quantity?: number,
  context: 'stock' | 'recipe' = 'stock',
): string {
  const n = (name ?? '').toLowerCase();
  const qty = typeof quantity === 'number' && Number.isFinite(quantity) ? quantity : 1;
  if (LIQUID_HINT.test(n)) {
    if (qty >= 20) return 'ml';
    // Recipe lines like "2 oil" are spoonfuls; pantry / shopping lines are litres.
    return context === 'recipe' ? 'tbsp' : 'l';
  }
  if (WEIGHT_HINT.test(n)) return qty >= 20 ? 'g' : 'pcs';
  return 'pcs';
}

/**
 * Map whatever unit the model produced onto the app unit list.
 * - Known unit / alias -> canonical app unit.
 * - Invented container units (bottle, carton, loaf, pack, ...) or empty ->
 *   a sensible app unit for that item (milk -> l/ml, bread -> pcs, ...).
 */
export function normalizeToolUnit(
  name: string | null | undefined,
  rawUnit: string | null | undefined,
  quantity?: number,
  context: 'stock' | 'recipe' = 'stock',
): string {
  const canon = canonicalUnit(rawUnit);
  if (canon) return canon;
  const raw = rawUnit?.trim().toLowerCase() ?? '';
  const n = (name ?? '').toLowerCase();
  // A bottle / carton / jug of a liquid is roughly a litre.
  if (
    /^(bottles?|cartons?|jugs?|gallons?|pints?|quarts?|glass(es)?)$/.test(raw) &&
    LIQUID_HINT.test(n)
  ) {
    return 'l';
  }
  return defaultUnitForItem(name, quantity, context);
}

/**
 * Normalize a model-supplied quantity + unit into stored app units: dry goods
 * measured by volume (tsp / tbsp / cup / ml) become grams, so the model cannot
 * persist odd values such as "Sugar 10 ml". Liquids keep their volume unit.
 */
export function normalizeToolQuantity(
  name: string | null | undefined,
  rawQuantity: number,
  rawUnit: string | null | undefined,
  context: 'stock' | 'recipe' = 'stock',
): { quantity: number; unit: string } {
  const unit = normalizeToolUnit(name, rawUnit, rawQuantity, context);
  if (unitKind(unit) === 'volume' && isDryGood(name)) {
    const grams = convertQty(rawQuantity, unit, 'g', name);
    if (grams != null) {
      return { quantity: Math.round(grams * 10) / 10, unit: 'g' };
    }
  }
  return { quantity: rawQuantity, unit };
}
