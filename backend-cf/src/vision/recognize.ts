import type { Env } from '../env';
import {
  aiGatewayChatCompletionsUrl,
  resolveAiGatewayConfig,
  resolveVisionModel,
  resolveVisionTimeoutMs,
} from '../lib/ai-gateway';
import {
  parseVisionItemsJson,
  VISION_SYSTEM_PROMPT,
  type RecognizedPantryDraft,
} from './parse';

export class VisionNotConfiguredError extends Error {
  constructor(message = 'Vision is not configured') {
    super(message);
    this.name = 'VisionNotConfiguredError';
  }
}

export class VisionProviderError extends Error {
  constructor(message = 'Vision recognition failed') {
    super(message);
    this.name = 'VisionProviderError';
  }
}

/** Workers-safe base64 (no Node Buffer). */
export function arrayBufferToBase64(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < view.length; i += chunk) {
    binary += String.fromCharCode(...view.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export async function recognizePantryFromImage(
  env: Env,
  input: { mime: string; bytes: ArrayBuffer },
): Promise<RecognizedPantryDraft[]> {
  const gateway = resolveAiGatewayConfig(env);
  const apiKey = (env.OPENAI_API_KEY || '').trim();
  if (!gateway || !apiKey) {
    throw new VisionNotConfiguredError();
  }

  const url = aiGatewayChatCompletionsUrl(gateway, 'openai');
  const model = resolveVisionModel(env);
  const timeoutMs = resolveVisionTimeoutMs(env);
  const dataUrl = `data:${input.mime};base64,${arrayBufferToBase64(input.bytes)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: VISION_SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Identify grocery items in this image and estimate quantities.',
              },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new VisionProviderError('Vision recognition timed out');
    }
    throw new VisionProviderError('Vision recognition failed');
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new VisionProviderError('Vision recognition failed');
  }

  const body = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = body.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new VisionProviderError('Vision recognition returned empty content');
  }

  return parseVisionItemsJson(content);
}
