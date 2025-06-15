import { z } from "zod";

// Auth User Schema
export const AuthUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  roles: z.array(z.string()).optional(),
});

// Login Response Schema
export const LoginResponseSchema = z.object({
  access_token: z.string(),
  token_type: z.string().default("Bearer"),
  expires_in: z.number(),
  user: AuthUserSchema,
});

// Login Request Schema
export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string(),
  remember: z.boolean().optional(),
});

// Register Request Schema
export const RegisterRequestSchema = z.object({
  email: z.string().email(),
  password: z.string(),
  name: z.string().optional(),
});

// Auth Error Schema
export const AuthErrorSchema = z.object({
  message: z.string(),
  code: z.string().optional(),
  statusCode: z.number().optional(),
});

// Type exports
export type AuthUser = z.infer<typeof AuthUserSchema>;
export type LoginResponse = z.infer<typeof LoginResponseSchema>;
export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;
export type AuthError = z.infer<typeof AuthErrorSchema>;

// Token payload type (for JWT decoding if needed)
export interface TokenPayload {
  email: string;
  sub: string; // user id
  iat: number; // issued at
  exp: number; // expires at
}
