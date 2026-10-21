import { normalizeName } from './names';

/** System-level staples; not user-editable in v1. */
export const DEFAULT_SEASONINGS = [
  '油',
  '鹽',
  '醬油',
  '糖',
  '白胡椒',
  '米酒',
  '蒜',
  '薑',
] as const;

const DEFAULT_SEASONING_KEYS = new Set(
  DEFAULT_SEASONINGS.map((s) => normalizeName(s)),
);

export type CookStatus =
  | 'cookable'
  | 'conditionally_cookable'
  | 'uncookable';

export function isDefaultSeasoning(name: string): boolean {
  const key = normalizeName(name);
  return key.length > 0 && DEFAULT_SEASONING_KEYS.has(key);
}

/** Non-seasoning gaps — use for uncookable narrative emphasis. */
export function missingMains(missing: string[]): string[] {
  return missing.filter((m) => !isDefaultSeasoning(m));
}

export function classifyCookStatus(
  missing: string[],
  assumeBasicSeasonings: boolean,
): CookStatus {
  if (missing.length === 0) return 'cookable';
  if (
    assumeBasicSeasonings &&
    missing.length > 0 &&
    missing.every((m) => isDefaultSeasoning(m))
  ) {
    return 'conditionally_cookable';
  }
  return 'uncookable';
}

/** Seasonings still missing when status is conditionally_cookable. */
export function conditionalSeasonings(missing: string[]): string[] {
  return missing.filter((m) => isDefaultSeasoning(m));
}
