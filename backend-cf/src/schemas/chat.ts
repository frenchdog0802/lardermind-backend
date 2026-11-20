import { z } from 'zod';

export const chatSendBodySchema = z.object({
  message: z.string().optional(),
  sessionId: z.string().optional(),
  clientLocalDate: z.string().optional(),
  /**
   * Optional reply language from the app UI: en | zh | es | fr | de | ja (locale tags such as
   * 'zh-TW', 'es-MX', 'en-US' are accepted by prefix; unknown values are ignored).
   * When absent the server detects it from the conversation.
   */
  language: z.string().max(35).optional(),
});

export const chatResumeBodySchema = z.object({
  sessionId: z.string().trim().min(1),
  decision: z.enum(['approve', 'reject']),
  note: z.string().optional(),
  interruptId: z.string().trim().min(1).max(200).optional(),
  /** Optional reply language, same rules as chat send. */
  language: z.string().max(35).optional(),
});

export type ChatResumeBody = z.infer<typeof chatResumeBodySchema>;
export type ChatSendBody = z.infer<typeof chatSendBodySchema>;
