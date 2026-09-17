import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/env.schema';
import { ServiceUnavailableError } from '../common/errors/http-errors';
import {
  parseRecognizedItems,
  VISION_SYSTEM_PROMPT,
  type RecognizedPantryItem,
} from './openai-vision.prompt';

const DEFAULT_MODEL = 'gpt-4o';
const DEFAULT_TIMEOUT_MS = 60_000;

type OpenAiChatResponse = {
  choices?: Array<{
    message?: { content?: string | null };
  }>;
  error?: { message?: string };
};

@Injectable()
export class OpenAiVisionClient {
  private readonly logger = new Logger(OpenAiVisionClient.name);

  constructor(private readonly configService: ConfigService) {}

  async recognizeImage(
    buffer: Buffer,
    mimeType: string,
  ): Promise<RecognizedPantryItem[]> {
    const app = this.configService.get<AppConfig>('app')!;
    const apiKey = app.optional.openaiApiKey;
    if (!apiKey) {
      throw new ServiceUnavailableError('Vision is not configured');
    }

    const model = app.optional.openaiVisionModel ?? DEFAULT_MODEL;
    const timeoutMs =
      app.optional.openaiVisionTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    const dataUrl = `data:${mimeType};base64,${buffer.toString('base64')}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
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
                  text: 'Identify pantry ingredients in this image. Respond with JSON: {"items":[{"category":"...","name":"...","quantity":0,"unit":"..."}]}',
                },
                {
                  type: 'image_url',
                  image_url: { url: dataUrl, detail: 'low' },
                },
              ],
            },
          ],
        }),
      });

      const payload = (await res.json()) as OpenAiChatResponse;
      if (!res.ok) {
        this.logger.warn(
          `OpenAI vision failed: ${res.status} ${payload.error?.message ?? ''}`,
        );
        throw new ServiceUnavailableError(
          'Image recognition is temporarily unavailable',
        );
      }

      const content = payload.choices?.[0]?.message?.content;
      if (!content || typeof content !== 'string') {
        return [];
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        this.logger.warn('OpenAI vision returned non-JSON content');
        throw new ServiceUnavailableError(
          'Image recognition returned an invalid response',
        );
      }

      return parseRecognizedItems(parsed);
    } catch (err) {
      if (err instanceof ServiceUnavailableError) {
        throw err;
      }
      this.logger.warn(
        `OpenAI vision error: ${err instanceof Error ? err.message : 'unknown'}`,
      );
      throw new ServiceUnavailableError(
        'Image recognition is temporarily unavailable',
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
