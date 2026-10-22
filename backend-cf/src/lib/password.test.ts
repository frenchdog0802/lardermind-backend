import { describe, expect, it } from 'vitest';
import {
  encryptPassword,
  hashPassword,
  PBKDF2_ITERATIONS,
  timingSafeEqual,
  verifyPassword,
} from './password';
import { signInUser } from '../db/users';
import type { Env } from '../env';

describe('timingSafeEqual', () => {
  it('matches equal strings and rejects different lengths without throwing', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
    expect(timingSafeEqual('abc', 'abcd')).toBe(false);
    expect(timingSafeEqual('', 'x')).toBe(false);
  });
});

describe('password hashes', () => {
  it('verifies a legacy HMAC-SHA1 hash and asks for a rehash', async () => {
    const legacy = await encryptPassword('correct horse', 'salt-1');
    const check = await verifyPassword('correct horse', legacy, 'salt-1');
    expect(check.ok).toBe(true);
    expect(check.needsRehash).toBe(true);
    const wrong = await verifyPassword('nope', legacy, 'salt-1');
    expect(wrong.ok).toBe(false);
    expect(wrong.needsRehash).toBe(false);
  });

  it('round-trips PBKDF2 and rehashes when iterations are low', async () => {
    const stored = await hashPassword('s3cret', 1000);
    expect(stored.startsWith('pbkdf2-sha256$1000$')).toBe(true);
    const check = await verifyPassword('s3cret', stored, null, {
      targetIterations: PBKDF2_ITERATIONS,
    });
    expect(check.ok).toBe(true);
    expect(check.needsRehash).toBe(true);
    const wrong = await verifyPassword('other', stored, null);
    expect(wrong.ok).toBe(false);
  });

  it('uses the default iteration count in new hashes', async () => {
    const stored = await hashPassword('s3cret');
    expect(stored.startsWith(`pbkdf2-sha256$${PBKDF2_ITERATIONS}$`)).toBe(true);
    const check = await verifyPassword('s3cret', stored, null);
    expect(check).toEqual({ ok: true, needsRehash: false });
  });
});

describe('signInUser rehash', () => {
  it('replaces a legacy hash with PBKDF2 after a successful login', async () => {
    const legacy = await encryptPassword('s3cret', 'salt-1');
    let stored = legacy;
    const db = {
      prepare(sql: string) {
        let bound: unknown[] = [];
        const stmt = {
          bind(...args: unknown[]) {
            bound = args;
            return stmt;
          },
          async first<T>() {
            if (sql.includes('FROM users') && sql.includes('email')) {
              return {
                id: 'user-1',
                first_name: 'A',
                last_name: 'B',
                name: 'A B',
                email: 'a@example.com',
                hashed_password: stored,
                salt: 'salt-1',
                role: 'user',
                google_id: null,
                picture: null,
                created_at: 1,
                updated_at: 1,
                is_guest: 0,
              } as T;
            }
            return null;
          },
          async run() {
            if (sql.includes('UPDATE users SET hashed_password')) {
              stored = String(bound[0]);
            }
            return { meta: { changes: 1 } };
          },
        };
        return stmt;
      },
    };

    const user = await signInUser({ DB: db } as Env, {
      email: 'a@example.com',
      password: 's3cret',
    });
    expect(user.hashed_password?.startsWith('pbkdf2-sha256$')).toBe(true);
    expect(stored.startsWith('pbkdf2-sha256$')).toBe(true);
    const again = await verifyPassword('s3cret', stored, 'salt-1');
    expect(again.ok).toBe(true);
    expect(again.needsRehash).toBe(false);
  });
});
