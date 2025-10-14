import {
  IsOptional,
  IsString,
  IsNumber,
  IsUUID,
  IsBoolean,
  Min,
  Max,
} from 'class-validator';

export class UpdateChatSettingsDto {
  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsNumber({}, { message: 'Temperature must be a number' })
  @Min(0, { message: 'Temperature must be at least 0' })
  @Max(2, { message: 'Temperature must not exceed 2' })
  temperature?: number;

  @IsOptional()
  @IsNumber({}, { message: 'Max chunks must be a number' })
  @Min(1, { message: 'Max chunks must be at least 1' })
  @Max(20, { message: 'Max chunks must not exceed 20' })
  maxChunks?: number;

  @IsOptional()
  @IsUUID(4, { message: 'Prompt ID must be a valid UUID' })
  promptId?: string;

  // 🆕 Search Weight Configuration
  @IsOptional()
  @IsNumber({}, { message: 'BM25 weight must be a number' })
  @Min(0, { message: 'BM25 weight must be at least 0' })
  @Max(1, { message: 'BM25 weight must not exceed 1' })
  bm25Weight?: number;

  @IsOptional()
  @IsNumber({}, { message: 'Embedding weight must be a number' })
  @Min(0, { message: 'Embedding weight must be at least 0' })
  @Max(1, { message: 'Embedding weight must not exceed 1' })
  embeddingWeight?: number;

  @IsOptional()
  @IsBoolean({ message: 'Enable conversation history must be a boolean' })
  enableConversationHistory?: boolean;

  @IsOptional()
  @IsBoolean({ message: 'Include conversation history must be a boolean' })
  includeConversationHistory?: boolean;

  @IsOptional()
  @IsNumber({}, { message: 'Conversation history limit must be a number' })
  @Min(1, { message: 'Conversation history limit must be at least 1' })
  @Max(50, { message: 'Conversation history limit must not exceed 50' })
  conversationHistoryLimit?: number;
}
