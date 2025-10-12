import {
  IsString,
  IsOptional,
  IsBoolean,
  IsIn,
  IsArray,
  ValidateNested,
  MinLength,
  MaxLength,
  IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';

class ModelDto {
  @IsString()
  id: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  maxTokens?: number;

  @IsOptional()
  @IsNumber()
  contextWindow?: number;

  @IsOptional()
  pricing?: {
    input: number;
    output: number;
  };
}

export class CreateAiProviderDto {
  @IsString()
  @MinLength(1, { message: 'Name is required' })
  @MaxLength(255, { message: 'Name must not exceed 255 characters' })
  name: string;

  @IsString()
  @IsIn(
    ['openai', 'anthropic', 'openrouter', 'dashscope', 'perplexity', 'custom'],
    {
      message:
        'Type must be one of: openai, anthropic, openrouter, dashscope, perplexity, custom',
    },
  )
  type:
    | 'openai'
    | 'anthropic'
    | 'openrouter'
    | 'dashscope'
    | 'perplexity'
    | 'custom';

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'API key must not exceed 500 characters' })
  apiKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Base URL must not exceed 500 characters' })
  baseUrl?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean = true;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ModelDto)
  models?: ModelDto[];
}
