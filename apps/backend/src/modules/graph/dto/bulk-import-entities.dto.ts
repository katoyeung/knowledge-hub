import {
  IsString,
  IsOptional,
  IsArray,
  IsObject,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class BulkImportEntityDto {
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
  @IsString({ each: true })
  aliases?: string[];

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
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
