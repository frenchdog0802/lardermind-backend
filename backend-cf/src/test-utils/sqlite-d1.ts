// Test-only: a tiny D1Database look-alike backed by node:sqlite so tests can run the real
// migrations and real SQL (not string-matching fakes). Excluded from the Worker typecheck.
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), '../../migrations');

type Bound = unknown[];

export function createSqliteD1(opts: { migrate?: boolean } = {}) {
  const sqlite = new DatabaseSync(':memory:');
  if (opts.migrate !== false) {
    for (const f of readdirSync(MIGRATIONS).sort()) {
      sqlite.exec(readFileSync(join(MIGRATIONS, f), 'utf8'));
    }
  }
  const log: string[] = [];
  const batches: string[][] = [];

  function stmt(sql: string, bound: Bound = []) {
    const self = {
      __sql: sql,
      bind(...args: Bound) {
        return stmt(sql, args);
      },
      async first<T>() {
        log.push(sql);
        return (sqlite.prepare(sql).get(...(bound as never[])) as T | undefined) ?? null;
      },
      async all<T>() {
        log.push(sql);
        const results = sqlite.prepare(sql).all(...(bound as never[])) as T[];
        return { results, success: true, meta: { changes: 0 } };
      },
      async run() {
        log.push(sql);
        const r = sqlite.prepare(sql).run(...(bound as never[]));
        return { success: true, meta: { changes: Number(r.changes) } };
      },
    };
    return self;
  }

  const db = {
    prepare: (sql: string) => stmt(sql),
    async batch(stmts: Array<{ __sql: string; run: () => Promise<unknown> }>) {
      batches.push(stmts.map((s) => s.__sql));
      const out: unknown[] = [];
      sqlite.exec('BEGIN');
      try {
        for (const s of stmts) out.push(await s.run());
        sqlite.exec('COMMIT');
      } catch (e) {
        sqlite.exec('ROLLBACK');
        throw e;
      }
      return out;
    },
  };
  return { db: db as unknown as D1Database, sqlite, log, batches };
}
