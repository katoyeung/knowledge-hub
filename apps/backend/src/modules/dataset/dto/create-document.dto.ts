import {
  IsString,
  IsOptional,
  IsUUID,
  IsNumber,
  IsBoolean,
  IsObject,
  IsArray,
  MaxLength,
} from 'class-validator';

export class CreateDocumentDto {
  @IsUUID()
  datasetId: string;

  @IsNumber()
  position: number;

  @IsString()
  @MaxLength(255)
  dataSourceType: string;

  @IsOptional()
  @IsString()
  dataSourceInfo?: string;

  @IsOptional()
  @IsUUID()
  datasetProcessRuleId?: string;

  @IsString()
  @MaxLength(255)
  batch: string;

  @IsString()
  @MaxLength(255)
  name: string;

  @IsString()
  @MaxLength(255)
  createdFrom: string;

  @IsOptional()
  @IsUUID()
  createdApiRequestId?: string;

  @IsOptional()
  @IsString()
  fileId?: string;

  @IsOptional()
  @IsNumber()
  wordCount?: number;

  @IsOptional()
  @IsNumber()
  tokens?: number;

  @IsOptional()
  @IsNumber()
  indexingLatency?: number;

  @IsOptional()
  @IsBoolean()
  isPaused?: boolean;

  @IsOptional()
  @IsUUID()
  pausedBy?: string;

  @IsOptional()
  @IsString()
  error?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  indexingStatus?: string;

  @IsOptional()
  @IsObject()
  processingMetadata?: object;

  @IsOptional()
  @IsObject()
  stageProgress?: object;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  activeJobIds?: string[];

  @IsOptional()
  @IsObject()
  lastError?: object;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsUUID()
  disabledBy?: string;

  @IsOptional()
  @IsBoolean()
  archived?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  archivedReason?: string;

  @IsOptional()
  @IsUUID()
  archivedBy?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  docType?: string;

  @IsOptional()
  @IsObject()
  docMetadata?: object;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  docForm?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  docLanguage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  embeddingModel?: string;

  @IsOptional()
  @IsNumber()
  embeddingDimensions?: number;

  @IsUUID()
  userId: string;
}
