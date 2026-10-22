import { z } from 'zod';

export const chatSendBodySchema = z.object({
  message: z.string().optional(),
  sessionId: z.string().optional(),
  clientLocalDate: z.string().optional(),
});

export const chatResumeBodySchema = z.object({
  sessionId: z.string().trim().min(1),
  decision: z.enum(['approve', 'reject']),
  note: z.string().optional(),
  interruptId: z.string().trim().min(1).max(200).optional(),
});

export type ChatResumeBody = z.infer<typeof chatResumeBodySchema>;
export type ChatSendBody = z.infer<typeof chatSendBodySchema>;
