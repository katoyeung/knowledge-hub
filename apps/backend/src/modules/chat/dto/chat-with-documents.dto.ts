import {
  IsString,
  IsArray,
  IsOptional,
  IsUUID,
  IsEnum,
  IsNumber,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { LLMProvider } from '../services/model-config.service';
import { RerankerType } from '../../dataset/dto/create-dataset-step.dto';

export class ChatWithDocumentsDto {
  @IsString()
  message: string;

  @IsUUID()
  datasetId: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  documentIds?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  segmentIds?: string[];

  @IsEnum(LLMProvider)
  @IsOptional()
  llmProvider?: LLMProvider = LLMProvider.DASHSCOPE;

  @IsString()
  @IsOptional()
  model?: string;

  @IsNumber()
  @Min(1)
  @Max(20)
  @IsOptional()
  maxChunks?: number = 10;

  @IsNumber()
  @Min(0)
  @Max(1)
  @IsOptional()
  temperature?: number = 0.7;

  @IsUUID()
  @IsOptional()
  conversationId?: string;

  @IsString()
  @IsOptional()
  conversationTitle?: string;

  @IsEnum(RerankerType)
  @IsOptional()
  rerankerType?: RerankerType = RerankerType.MATHEMATICAL;
}
