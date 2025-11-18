import {
  IsString,
  IsOptional,
  IsArray,
  IsObject,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateAliasDto } from './create-entity.dto';

export class BulkImportEntityDto {
  @IsOptional()
  @IsString()
  // Note: Using IsString instead of IsUrl to support URI references like "wikidata:Q123"
  entityId?: string;

  @IsString()
  entityType: string;

  @IsString()
  canonicalName: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateAliasDto)
  aliases?: CreateAliasDto[];

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;

  @IsOptional()
  @IsObject()
  equivalentEntities?: Record<string, string>;

  @IsOptional()
  @IsObject()
  provenance?: {
    sources?: string[];
    dataProvider?: string;
  };
}

export class BulkImportEntitiesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkImportEntityDto)
  entities: BulkImportEntityDto[];

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsObject()
  options?: {
    skipDuplicates?: boolean;
    updateExisting?: boolean;
    defaultConfidence?: number;
  };
}
