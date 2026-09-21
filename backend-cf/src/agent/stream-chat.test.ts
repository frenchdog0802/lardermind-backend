import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const wranglerToml = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../wrangler.toml'),
  'utf8',
);

describe('Workers AI chat deprecation guard', () => {
  it('does not configure a Workers AI model id for chat', () => {
    expect(wranglerToml).not.toMatch(
      /AI_MODEL\s*=\s*"@cf\/meta\/llama-3\.1-8b-instruct/,
    );
    expect(wranglerToml).toMatch(/LLM_MODEL\s*=\s*"deepseek-chat"/);
    expect(wranglerToml).toMatch(/CF_ACCOUNT_ID\s*=/);
    expect(wranglerToml).toMatch(/AI_GATEWAY_ID\s*=\s*"default"/);
  });
});
