import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  IsObject,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum CsvConnectorType {
  SOCIAL_MEDIA_POST = 'social_media_post',
  NEWS_ARTICLE = 'news_article',
  CUSTOM = 'custom',
}

export class CsvUploadConfigDto {
  @IsOptional()
  @IsEnum(CsvConnectorType, { message: 'Invalid CSV connector type' })
  connectorType?: CsvConnectorType;

  @IsOptional()
  @IsObject()
  fieldMappings?: Record<string, string>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  searchableColumns?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  metadataColumns?: string[];
}
