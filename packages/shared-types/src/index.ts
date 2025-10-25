import { z } from "zod";
import { initTRPC } from "@trpc/server";

// Base tRPC setup
export const t = initTRPC.create();

// Common schemas
export const BaseEntitySchema = z.object({
  id: z.string().uuid(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const PaginationSchema = z.object({
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(10),
  search: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(["ASC", "DESC"]).default("DESC"),
});

export const PaginatedResponseSchema = <T extends z.ZodTypeAny>(
  itemSchema: T
) =>
  z.object({
    data: z.array(itemSchema),
    total: z.number(),
    page: z.number(),
    limit: z.number(),
    totalPages: z.number(),
  });

export const ApiResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.boolean(),
    data: dataSchema,
    message: z.string().optional(),
  });

// Chat Settings schema
export const ChatSettingsSchema = z.object({
  provider: z.string().optional(),
  model: z.string().optional(),
  promptId: z.string().optional(),
  temperature: z.number().min(0).max(1).optional(),
  maxChunks: z.number().min(1).max(20).optional(),
  // 🆕 Search Weight Configuration
  bm25Weight: z.number().min(0).max(1).optional(),
  embeddingWeight: z.number().min(0).max(1).optional(),
  // Conversation History Settings
  includeConversationHistory: z.boolean().optional(),
  conversationHistoryLimit: z.number().min(1).max(50).optional(),
});

// Graph Settings schema
export const GraphSettingsSchema = z.object({
  aiProviderId: z.string().uuid().optional(),
  model: z.string().optional(),
  promptId: z.string().uuid().optional(),
  temperature: z.number().min(0).max(2).optional(),
});

// User Settings schema
export const UserSettingsSchema = z.object({
  chat_settings: ChatSettingsSchema.optional(),
  graph_settings: GraphSettingsSchema.optional(),
});

// User schema
export const UserSchema = BaseEntitySchema.extend({
  name: z.string().optional(),
  email: z.string().email(),
  settings: UserSettingsSchema.optional(),
  roles: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
      })
    )
    .optional(),
});

// Article schema
export const ArticleSchema = BaseEntitySchema.extend({
  title: z.string(),
  content: z.string(),
  excerpt: z.string().optional(),
  status: z.enum(["draft", "published", "archived"]),
  authorId: z.string().uuid(),
  tags: z.array(z.string()).optional(),
  publishedAt: z.date().optional(),
});

// Category schema
export const CategorySchema = BaseEntitySchema.extend({
  name: z.string(),
  description: z.string().optional(),
  parentId: z.string().uuid().optional(),
  slug: z.string(),
});

// Dataset schemas
export const DataSourceTypeEnum = z.enum([
  "file",
  "text",
  "website_crawl",
  "api",
]);
export const IndexingTechniqueEnum = z.enum(["high_quality", "economy"]);
export const PermissionEnum = z.enum([
  "only_me",
  "all_team_members",
  "partial_members",
]);

export const DatasetSchema = BaseEntitySchema.extend({
  name: z.string(),
  description: z.string().optional(),
  provider: z.string().default("vendor"),
  permission: PermissionEnum.default("only_me"),
  dataSourceType: DataSourceTypeEnum.optional(),
  indexingTechnique: IndexingTechniqueEnum.optional(),
  indexStruct: z.string().optional(),
  embeddingModel: z.string().optional(),
  embeddingModelProvider: z.string().optional(),
  collectionBindingId: z.string().uuid().optional(),
  retrievalModel: z.record(z.any()).optional(),
  ownerId: z.string().uuid(),
  owner: UserSchema.optional(),
});

export const DocumentSchema = BaseEntitySchema.extend({
  datasetId: z.string().uuid(),
  position: z.number(),
  dataSourceType: z.string(),
  dataSourceInfo: z.string().optional(),
  datasetProcessRuleId: z.string().uuid().optional(),
  batch: z.string(),
  name: z.string(),
  createdFrom: z.string(),
  createdApiRequestId: z.string().uuid().optional(),
  processingStartedAt: z.date().optional(),
  fileId: z.string().optional(),
  wordCount: z.number().optional(),
  parsingCompletedAt: z.date().optional(),
  cleaningCompletedAt: z.date().optional(),
  splittingCompletedAt: z.date().optional(),
  tokens: z.number().optional(),
  indexingLatency: z.number().optional(),
  completedAt: z.date().optional(),
  isPaused: z.boolean().optional(),
  pausedBy: z.string().uuid().optional(),
  pausedAt: z.date().optional(),
  error: z.string().optional(),
  stoppedAt: z.date().optional(),
  indexingStatus: z.string().default("waiting"),
  enabled: z.boolean().default(true),
  disabledAt: z.date().optional(),
  disabledBy: z.string().uuid().optional(),
  archived: z.boolean().default(false),
  archivedReason: z.string().optional(),
  archivedBy: z.string().uuid().optional(),
  archivedAt: z.date().optional(),
  docType: z.string().optional(),
  docMetadata: z.record(z.any()).optional(),
  docForm: z.string().default("text_model"),
  docLanguage: z.string().optional(),
  creatorId: z.string().uuid(),
  creator: UserSchema.optional(),
  dataset: DatasetSchema.optional(),
});

export const DocumentSegmentSchema = BaseEntitySchema.extend({
  datasetId: z.string().uuid(),
  documentId: z.string().uuid(),
  position: z.number(),
  content: z.string(),
  answer: z.string().optional(),
  wordCount: z.number(),
  tokens: z.number(),
  keywords: z.record(z.any()).optional(),
  indexNodeId: z.string().optional(),
  indexNodeHash: z.string().optional(),
  hitCount: z.number().default(0),
  enabled: z.boolean().default(true),
  disabledAt: z.date().optional(),
  disabledBy: z.string().uuid().optional(),
  status: z.string().default("waiting"),
  indexingAt: z.date().optional(),
  completedAt: z.date().optional(),
  error: z.string().optional(),
  stoppedAt: z.date().optional(),
  creatorId: z.string().uuid(),
  creator: UserSchema.optional(),
  dataset: DatasetSchema.optional(),
  document: DocumentSchema.optional(),
});

// Export common TRPC utilities
export const router = t.router;
export const procedure = t.procedure;
export const publicProcedure = t.procedure;

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
  ApiKey,
  ApiKeyCreateResponse,
} from "./auth-types";

// Export settings types
export type ChatSettings = z.infer<typeof ChatSettingsSchema>;
export type GraphSettings = z.infer<typeof GraphSettingsSchema>;
export type UserSettings = z.infer<typeof UserSettingsSchema>;
