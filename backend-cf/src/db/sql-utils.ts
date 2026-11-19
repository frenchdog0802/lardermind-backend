/** D1 allows at most 100 bound parameters per statement; stay a little under. */
export const D1_IN_CHUNK = 90;

export function chunkArray<T>(items: readonly T[], size = D1_IN_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function placeholders(n: number): string {
  return new Array(n).fill('?').join(', ');
}

/**
 * Run `SELECT ... WHERE <column> IN (...)` over `values` in chunks of D1_IN_CHUNK (extra bound
 * params, e.g. a user id, count against the limit and are passed via `extraBinds`).
 * `sqlForChunk(placeholderList)` must return the full statement.
 */
export async function selectInChunks<T>(
  db: D1Database,
  values: readonly string[],
  sqlForChunk: (placeholderList: string) => string,
  extraBinds: unknown[] = [],
  trailingBinds: unknown[] = [],
): Promise<T[]> {
  const unique = [...new Set(values)];
  if (!unique.length) return [];
  const size = Math.max(1, D1_IN_CHUNK - extraBinds.length - trailingBinds.length);
  const chunks = chunkArray(unique, size);
  const results = await Promise.all(
    chunks.map((chunk) =>
      db
        .prepare(sqlForChunk(placeholders(chunk.length)))
        .bind(...extraBinds, ...chunk, ...trailingBinds)
        .all<T>(),
    ),
  );
  return results.flatMap((r) => r.results ?? []);
}

export type PageParams = { limit: number; offset: number };

export const MAX_PAGE_LIMIT = 200;

/**
 * Optional `limit` + `cursor` (numeric offset) query params. Both absent => `value: null`
 * (callers return everything, exactly as before).
 */
export function parsePage(
  limitRaw: string | undefined,
  cursorRaw: string | undefined,
): { ok: true; value: PageParams | null } | { ok: false; message: string } {
  if (limitRaw === undefined && cursorRaw === undefined) return { ok: true, value: null };
  let limit = MAX_PAGE_LIMIT;
  if (limitRaw !== undefined) {
    const n = Number(limitRaw);
    if (!Number.isInteger(n) || n < 1) return { ok: false, message: 'Invalid limit' };
    limit = Math.min(n, MAX_PAGE_LIMIT);
  }
  let offset = 0;
  if (cursorRaw !== undefined && cursorRaw !== '') {
    const n = Number(cursorRaw);
    if (!Number.isInteger(n) || n < 0) return { ok: false, message: 'Invalid cursor' };
    offset = n;
  }
  return { ok: true, value: { limit, offset } };
}
