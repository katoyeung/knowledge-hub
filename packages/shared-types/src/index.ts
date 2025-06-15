import { z } from "zod";
import { initTRPC } from "@trpc/server";

// Base tRPC setup
export const t = initTRPC.create();

// Shared schemas
export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  role: z.enum(["admin", "user", "editor"]),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const ArticleSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  authorId: z.string(),
  status: z.enum(["draft", "published", "archived"]),
  tags: z.array(z.string()),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const CategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  parentId: z.string().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

// Type exports
export type User = z.infer<typeof UserSchema>;
export type Article = z.infer<typeof ArticleSchema>;
export type Category = z.infer<typeof CategorySchema>;

// Common API response types
export const ApiResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.boolean(),
    data: dataSchema.optional(),
    message: z.string().optional(),
    error: z.string().optional(),
  });

export type ApiResponse<T> = {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
};

// Pagination types
export const PaginationSchema = z.object({
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(10),
  sortBy: z.string().optional(),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});

export const PaginatedResponseSchema = <T extends z.ZodTypeAny>(
  dataSchema: T
) =>
  z.object({
    data: z.array(dataSchema),
    pagination: z.object({
      page: z.number(),
      limit: z.number(),
      total: z.number(),
      totalPages: z.number(),
    }),
  });

export type Pagination = z.infer<typeof PaginationSchema>;
export type PaginatedResponse<T> = {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

// Export common TRPC utilities
export const router = t.router;
export const publicProcedure = t.procedure;
export const middleware = t.middleware;

// Export tRPC router types (explicit exports that work reliably)
export { appRouter } from "./routers";
export type { AppRouter } from "./routers";

// Export auth types
export {
  AuthUserSchema,
  LoginResponseSchema,
  LoginRequestSchema,
  RegisterRequestSchema,
  AuthErrorSchema,
} from "./auth-types";
export type {
  AuthUser,
  LoginResponse,
  LoginRequest,
  RegisterRequest,
  AuthError,
  TokenPayload,
} from "./auth-types";
