import { z } from 'zod';

export const signupBodySchema = z.object({
  first_name: z.string().trim().min(1).max(100),
  last_name: z.string().trim().min(1).max(100),
  email: z.string().trim().min(1).max(320),
  password: z.string().min(1).max(256),
  guest_token: z.string().optional(),
});

export const signinBodySchema = z.object({
  email: z.string().trim().min(1).max(320),
  password: z.string().min(1).max(256),
  guest_token: z.string().optional(),
});

export const googleLoginBodySchema = z.object({
  token: z.string().trim().min(1),
  guest_token: z.string().optional(),
});

export const claimGuestBodySchema = z.object({
  guest_token: z.string().trim().min(1),
});

export type SignupBody = z.infer<typeof signupBodySchema>;
export type SigninBody = z.infer<typeof signinBodySchema>;
export type GoogleLoginBody = z.infer<typeof googleLoginBodySchema>;
