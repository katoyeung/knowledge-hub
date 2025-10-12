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

  @IsNumber()
  @Min(1)
  @Max(20)
  @IsOptional()
  maxChunks?: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  @IsOptional()
  temperature?: number;

  @IsUUID()
  @IsOptional()
  conversationId?: string;

  @IsString()
  @IsOptional()
  conversationTitle?: string;

  @IsEnum(RerankerType)
  @IsOptional()
  rerankerType?: RerankerType = RerankerType.NONE;
}
