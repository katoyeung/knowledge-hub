import { z } from "zod";
import {
  router,
  publicProcedure,
  UserSchema,
  ArticleSchema,
  CategorySchema,
  DatasetSchema,
  DocumentSchema,
  PaginationSchema,
  PaginatedResponseSchema,
  ApiResponseSchema,
  DataSourceTypeEnum,
  PermissionEnum,
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

// Dataset router procedures
export const datasetRouter = router({
  getById: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .output(ApiResponseSchema(DatasetSchema))
    .query(async ({ input: _ }) => {
      throw new Error("Not implemented");
    }),

  getAll: publicProcedure
    .input(
      PaginationSchema.extend({
        ownerId: z.string().uuid().optional(),
        permission: PermissionEnum.optional(),
        dataSourceType: DataSourceTypeEnum.optional(),
      })
    )
    .output(PaginatedResponseSchema(DatasetSchema))
    .query(async ({ input: _ }) => {
      throw new Error("Not implemented");
    }),

  create: publicProcedure
    .input(
      DatasetSchema.omit({
        id: true,
        createdAt: true,
        updatedAt: true,
        owner: true,
      })
    )
    .output(ApiResponseSchema(DatasetSchema))
    .mutation(async ({ input: _ }) => {
      throw new Error("Not implemented");
    }),

  update: publicProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        data: DatasetSchema.omit({
          id: true,
          createdAt: true,
          updatedAt: true,
          owner: true,
        }).partial(),
      })
    )
    .output(ApiResponseSchema(DatasetSchema))
    .mutation(async ({ input: _ }) => {
      throw new Error("Not implemented");
    }),

  delete: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .output(ApiResponseSchema(z.boolean()))
    .mutation(async ({ input: _ }) => {
      throw new Error("Not implemented");
    }),

  getWithDetails: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .output(ApiResponseSchema(DatasetSchema))
    .query(async ({ input: _ }) => {
      throw new Error("Not implemented");
    }),

  getByUser: publicProcedure
    .input(z.object({ userId: z.string().uuid() }))
    .output(ApiResponseSchema(z.array(DatasetSchema)))
    .query(async ({ input: _ }) => {
      throw new Error("Not implemented");
    }),
});

// Document router procedures
export const documentRouter = router({
  getById: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .output(ApiResponseSchema(DocumentSchema))
    .query(async ({ input: _ }) => {
      throw new Error("Not implemented");
    }),

  getAll: publicProcedure
    .input(
      PaginationSchema.extend({
        datasetId: z.string().uuid().optional(),
        indexingStatus: z.string().optional(),
        enabled: z.boolean().optional(),
      })
    )
    .output(PaginatedResponseSchema(DocumentSchema))
    .query(async ({ input: _ }) => {
      throw new Error("Not implemented");
    }),

  create: publicProcedure
    .input(
      DocumentSchema.omit({
        id: true,
        createdAt: true,
        updatedAt: true,
        creator: true,
        dataset: true,
      })
    )
    .output(ApiResponseSchema(DocumentSchema))
    .mutation(async ({ input: _ }) => {
      throw new Error("Not implemented");
    }),

  update: publicProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        data: DocumentSchema.omit({
          id: true,
          createdAt: true,
          updatedAt: true,
          creator: true,
          dataset: true,
        }).partial(),
      })
    )
    .output(ApiResponseSchema(DocumentSchema))
    .mutation(async ({ input: _ }) => {
      throw new Error("Not implemented");
    }),

  delete: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .output(ApiResponseSchema(z.boolean()))
    .mutation(async ({ input: _ }) => {
      throw new Error("Not implemented");
    }),

  updateStatus: publicProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        status: z.string(),
      })
    )
    .output(ApiResponseSchema(DocumentSchema))
    .mutation(async ({ input: _ }) => {
      throw new Error("Not implemented");
    }),

  getByDataset: publicProcedure
    .input(z.object({ datasetId: z.string().uuid() }))
    .output(ApiResponseSchema(z.array(DocumentSchema)))
    .query(async ({ input: _ }) => {
      throw new Error("Not implemented");
    }),
});

// Root app router
export const appRouter = router({
  user: userRouter,
  article: articleRouter,
  category: categoryRouter,
  dataset: datasetRouter,
  document: documentRouter,
});

export type AppRouter = typeof appRouter;
