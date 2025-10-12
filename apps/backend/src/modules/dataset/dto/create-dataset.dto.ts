import {
  IsString,
  IsOptional,
  MinLength,
  MaxLength,
  IsUUID,
  IsObject,
  IsEnum,
} from 'class-validator';

export enum DataSourceType {
  FILE = 'file',
  TEXT = 'text',
  WEBSITE_CRAWL = 'website_crawl',
  API = 'api',
}

export enum IndexingTechnique {
  HIGH_QUALITY = 'high_quality',
  ECONOMY = 'economy',
}

export enum Permission {
  ONLY_ME = 'only_me',
  ALL_TEAM_MEMBERS = 'all_team_members',
  PARTIAL_MEMBERS = 'partial_members',
}

export class CreateDatasetDto {
  @IsString()
  @MinLength(1, { message: 'Dataset name cannot be empty' })
  @MaxLength(255, { message: 'Dataset name must not exceed 255 characters' })
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'Description must not exceed 1000 characters' })
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Provider must not exceed 255 characters' })
  provider?: string;

  @IsOptional()
  @IsEnum(Permission)
  permission?: Permission;

  @IsOptional()
  @IsEnum(DataSourceType)
  dataSourceType?: DataSourceType;

  @IsOptional()
  @IsEnum(IndexingTechnique)
  indexingTechnique?: IndexingTechnique;

  @IsOptional()
  @IsString()
  indexStruct?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Embedding model must not exceed 255 characters' })
  embeddingModel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255, {
    message: 'Embedding model provider must not exceed 255 characters',
  })
  embeddingModelProvider?: string;

  @IsOptional()
  @IsUUID(4, { message: 'Collection binding ID must be a valid UUID' })
  collectionBindingId?: string;

  @IsOptional()
  @IsObject()
  retrievalModel?: object;

  @IsOptional()
  @IsObject()
  settings?: object;
}
