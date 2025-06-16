import {
  IsString,
  IsOptional,
  IsNumber,
  IsUUID,
  IsBoolean,
  IsDateString,
  IsObject,
  MinLength,
  MaxLength,
} from 'class-validator';

export class CreateDocumentDto {
  @IsUUID(4, { message: 'Dataset ID must be a valid UUID' })
  datasetId: string;

  @IsNumber({}, { message: 'Position must be a number' })
  position: number;

  @IsString()
  @MaxLength(255, {
    message: 'Data source type must not exceed 255 characters',
  })
  dataSourceType: string;

  @IsOptional()
  @IsString()
  dataSourceInfo?: string;

  @IsOptional()
  @IsUUID(4, { message: 'Dataset process rule ID must be a valid UUID' })
  datasetProcessRuleId?: string;

  @IsString()
  @MaxLength(255, { message: 'Batch must not exceed 255 characters' })
  batch: string;

  @IsString()
  @MinLength(1, { message: 'Document name cannot be empty' })
  @MaxLength(255, { message: 'Document name must not exceed 255 characters' })
  name: string;

  @IsString()
  @MaxLength(255, { message: 'Created from must not exceed 255 characters' })
  createdFrom: string;

  @IsOptional()
  @IsUUID(4, { message: 'Created API request ID must be a valid UUID' })
  createdApiRequestId?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Processing started at must be a valid date' })
  processingStartedAt?: Date;

  @IsOptional()
  @IsString()
  fileId?: string;

  @IsOptional()
  @IsNumber({}, { message: 'Word count must be a number' })
  wordCount?: number;

  @IsOptional()
  @IsDateString({}, { message: 'Parsing completed at must be a valid date' })
  parsingCompletedAt?: Date;

  @IsOptional()
  @IsDateString({}, { message: 'Cleaning completed at must be a valid date' })
  cleaningCompletedAt?: Date;

  @IsOptional()
  @IsDateString({}, { message: 'Splitting completed at must be a valid date' })
  splittingCompletedAt?: Date;

  @IsOptional()
  @IsNumber({}, { message: 'Tokens must be a number' })
  tokens?: number;

  @IsOptional()
  @IsNumber({}, { message: 'Indexing latency must be a number' })
  indexingLatency?: number;

  @IsOptional()
  @IsDateString({}, { message: 'Completed at must be a valid date' })
  completedAt?: Date;

  @IsOptional()
  @IsBoolean()
  isPaused?: boolean;

  @IsOptional()
  @IsUUID(4, { message: 'Paused by must be a valid UUID' })
  pausedBy?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Paused at must be a valid date' })
  pausedAt?: Date;

  @IsOptional()
  @IsString()
  error?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Stopped at must be a valid date' })
  stoppedAt?: Date;

  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Indexing status must not exceed 255 characters' })
  indexingStatus?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsDateString({}, { message: 'Disabled at must be a valid date' })
  disabledAt?: Date;

  @IsOptional()
  @IsUUID(4, { message: 'Disabled by must be a valid UUID' })
  disabledBy?: string;

  @IsOptional()
  @IsBoolean()
  archived?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Archived reason must not exceed 255 characters' })
  archivedReason?: string;

  @IsOptional()
  @IsUUID(4, { message: 'Archived by must be a valid UUID' })
  archivedBy?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Archived at must be a valid date' })
  archivedAt?: Date;

  @IsOptional()
  @IsString()
  @MaxLength(40, { message: 'Doc type must not exceed 40 characters' })
  docType?: string;

  @IsOptional()
  @IsObject()
  docMetadata?: object;

  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Doc form must not exceed 255 characters' })
  docForm?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Doc language must not exceed 255 characters' })
  docLanguage?: string;

  @IsUUID(4, { message: 'Creator ID must be a valid UUID' })
  creatorId: string;
}
