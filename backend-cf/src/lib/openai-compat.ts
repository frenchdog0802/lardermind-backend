/**
 * Extract text deltas from an OpenAI-compatible chat.completions SSE body.
 * Yields content strings as they appear in `choices[0].delta.content`.
 */
export function extractDeltaContent(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return '';
  const delta = (choices[0] as { delta?: { content?: unknown } })?.delta;
  if (!delta) return '';
  const content = delta.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && 'text' in part) {
          const text = (part as { text?: unknown }).text;
          return typeof text === 'string' ? text : '';
        }
        return '';
      })
      .join('');
  }
  return '';
}

/**
 * Parse a chunk of OpenAI-compatible SSE text; return concatenated delta texts.
 * Leaves any incomplete trailing line in `carry` for the next chunk.
 */
export function consumeOpenAiCompatSse(
  chunk: string,
  carry: string,
): { texts: string[]; carry: string } {
  const combined = carry + chunk;
  const lines = combined.split(/\r?\n/);
  const nextCarry = lines.pop() ?? '';
  const texts: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;
    const data = trimmed.slice(5).trim();
    if (!data || data === '[DONE]') continue;
    try {
      const parsed = JSON.parse(data) as unknown;
      const text = extractDeltaContent(parsed);
      if (text) texts.push(text);
    } catch {
      // ignore malformed SSE frames
    }
  }

  return { texts, carry: nextCarry };
}

export async function* iterateOpenAiCompatStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let carry = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    const result = consumeOpenAiCompatSse(chunk, carry);
    carry = result.carry;
    for (const text of result.texts) {
      yield text;
    }
  }

  if (carry.trim()) {
    const result = consumeOpenAiCompatSse('\n', carry);
    for (const text of result.texts) {
      yield text;
    }
  }
}
