import {
  IsString,
  IsOptional,
  IsUUID,
  MaxLength,
  IsEnum,
  IsObject,
  IsArray,
  IsDateString,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { CsvConnectorType } from '../../csv-connector/dto/csv-upload-config.dto';
import { PostSearchFilters } from '../../posts/posts.service';

export class UploadDocumentDto {
  @IsOptional()
  @IsUUID(4, { message: 'Dataset ID must be a valid UUID' })
  datasetId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Dataset name must not exceed 255 characters' })
  datasetName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, {
    message: 'Dataset description must not exceed 500 characters',
  })
  datasetDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255, {
    message: 'Data source type must not exceed 255 characters',
  })
  dataSourceType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Batch must not exceed 255 characters' })
  batch?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Created from must not exceed 255 characters' })
  createdFrom?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40, { message: 'Doc type must not exceed 40 characters' })
  docType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Doc form must not exceed 255 characters' })
  docForm?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Doc language must not exceed 255 characters' })
  docLanguage?: string;

  // CSV-specific fields
  @IsOptional()
  @IsEnum(CsvConnectorType, { message: 'Invalid CSV connector type' })
  csvConnectorType?: CsvConnectorType;

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }
    return value;
  })
  @IsObject()
  csvFieldMappings?: Record<string, string>; // For custom connector

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }
    return value;
  })
  @IsArray()
  @IsString({ each: true })
  csvSearchableColumns?: string[]; // For custom connector
}

export class SyncPostsDto {
  @IsOptional()
  @IsString()
  hash?: string;

  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  metaKey?: string;

  @IsOptional()
  metaValue?: any;

  @IsOptional()
  @IsUUID(4)
  userId?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsDateString()
  postedAtStart?: string;

  @IsOptional()
  @IsDateString()
  postedAtEnd?: string;

  @IsOptional()
  page?: number;

  @IsOptional()
  limit?: number;
}
