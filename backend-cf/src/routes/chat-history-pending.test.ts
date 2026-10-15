import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('GET /api/chat/history pending interrupt', () => {
  it('includes pendingInterrupt from getPendingInterrupt / pendingInterruptForHistory', () => {
    const src = readFileSync(join(root, 'src/routes/chat.ts'), 'utf8');
    expect(src).toMatch(/pendingInterruptForHistory|getPendingInterrupt/);
    expect(src).toMatch(/pendingInterrupt/);
  });
});
