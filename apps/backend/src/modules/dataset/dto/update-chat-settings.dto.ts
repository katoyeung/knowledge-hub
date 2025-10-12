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

  @IsOptional()
  @IsBoolean({ message: 'Enable conversation history must be a boolean' })
  enableConversationHistory?: boolean;
}
