import { z } from "zod";
import {
  router,
  publicProcedure,
  UserSchema,
  ArticleSchema,
  CategorySchema,
  PaginationSchema,
  PaginatedResponseSchema,
  ApiResponseSchema,
} from "./index";

// User router procedures
export const userRouter = router({
  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .output(ApiResponseSchema(UserSchema))
    .query(async ({ input: _ }) => {
      // Implementation will be in the backend
      throw new Error("Not implemented");
    }),

  getAll: publicProcedure
    .input(PaginationSchema)
    .output(PaginatedResponseSchema(UserSchema))
    .query(async ({ input: _ }) => {
      throw new Error("Not implemented");
    }),

  create: publicProcedure
    .input(UserSchema.omit({ id: true, createdAt: true, updatedAt: true }))
    .output(ApiResponseSchema(UserSchema))
    .mutation(async ({ input: _ }) => {
      throw new Error("Not implemented");
    }),

  update: publicProcedure
    .input(
      z.object({
        id: z.string(),
        data: UserSchema.omit({
          id: true,
          createdAt: true,
          updatedAt: true,
        }).partial(),
      })
    )
    .output(ApiResponseSchema(UserSchema))
    .mutation(async ({ input: _ }) => {
      throw new Error("Not implemented");
    }),

  delete: publicProcedure
    .input(z.object({ id: z.string() }))
    .output(ApiResponseSchema(z.boolean()))
    .mutation(async ({ input: _ }) => {
      throw new Error("Not implemented");
    }),
});

// Article router procedures
export const articleRouter = router({
  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .output(ApiResponseSchema(ArticleSchema))
    .query(async ({ input: _ }) => {
      throw new Error("Not implemented");
    }),

  getAll: publicProcedure
    .input(
      PaginationSchema.extend({
        status: z.enum(["draft", "published", "archived"]).optional(),
        authorId: z.string().optional(),
        tags: z.array(z.string()).optional(),
      })
    )
    .output(PaginatedResponseSchema(ArticleSchema))
    .query(async ({ input: _ }) => {
      throw new Error("Not implemented");
    }),

  create: publicProcedure
    .input(ArticleSchema.omit({ id: true, createdAt: true, updatedAt: true }))
    .output(ApiResponseSchema(ArticleSchema))
    .mutation(async ({ input: _ }) => {
      throw new Error("Not implemented");
    }),

  update: publicProcedure
    .input(
      z.object({
        id: z.string(),
        data: ArticleSchema.omit({
          id: true,
          createdAt: true,
          updatedAt: true,
        }).partial(),
      })
    )
    .output(ApiResponseSchema(ArticleSchema))
    .mutation(async ({ input: _ }) => {
      throw new Error("Not implemented");
    }),

  delete: publicProcedure
    .input(z.object({ id: z.string() }))
    .output(ApiResponseSchema(z.boolean()))
    .mutation(async ({ input: _ }) => {
      throw new Error("Not implemented");
    }),

  publish: publicProcedure
    .input(z.object({ id: z.string() }))
    .output(ApiResponseSchema(ArticleSchema))
    .mutation(async ({ input: _ }) => {
      throw new Error("Not implemented");
    }),

  archive: publicProcedure
    .input(z.object({ id: z.string() }))
    .output(ApiResponseSchema(ArticleSchema))
    .mutation(async ({ input: _ }) => {
      throw new Error("Not implemented");
    }),
});

// Category router procedures
export const categoryRouter = router({
  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .output(ApiResponseSchema(CategorySchema))
    .query(async ({ input: _ }) => {
      throw new Error("Not implemented");
    }),

  getAll: publicProcedure
    .input(
      PaginationSchema.extend({
        parentId: z.string().optional(),
      })
    )
    .output(PaginatedResponseSchema(CategorySchema))
    .query(async ({ input: _ }) => {
      throw new Error("Not implemented");
    }),

  create: publicProcedure
    .input(CategorySchema.omit({ id: true, createdAt: true, updatedAt: true }))
    .output(ApiResponseSchema(CategorySchema))
    .mutation(async ({ input: _ }) => {
      throw new Error("Not implemented");
    }),

  update: publicProcedure
    .input(
      z.object({
        id: z.string(),
        data: CategorySchema.omit({
          id: true,
          createdAt: true,
          updatedAt: true,
        }).partial(),
      })
    )
    .output(ApiResponseSchema(CategorySchema))
    .mutation(async ({ input: _ }) => {
      throw new Error("Not implemented");
    }),

  delete: publicProcedure
    .input(z.object({ id: z.string() }))
    .output(ApiResponseSchema(z.boolean()))
    .mutation(async ({ input: _ }) => {
      throw new Error("Not implemented");
    }),
});

// Root app router
export const appRouter = router({
  user: userRouter,
  article: articleRouter,
  category: categoryRouter,
});

export type AppRouter = typeof appRouter;
