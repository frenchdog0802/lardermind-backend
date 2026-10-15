import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('agent-loop interrupt persistence', () => {
  it('inserts an assistant interrupt message when turn is interrupt', () => {
    const src = readFileSync(join(root, 'src/agent/agent-loop.ts'), 'utf8');
    expect(src).toMatch(
      /turn\.kind === 'interrupt'[\s\S]*?insertMessage\([\s\S]*?responseType:\s*['"]interrupt['"]/,
    );
  });
});
