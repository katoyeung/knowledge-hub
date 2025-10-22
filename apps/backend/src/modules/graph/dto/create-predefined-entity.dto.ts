import {
  IsString,
  IsOptional,
  IsNumber,
  IsEnum,
  IsObject,
  Min,
  Max,
} from 'class-validator';
import { EntitySource } from '../entities/predefined-entity.entity';

export class CreatePredefinedEntityDto {
  @IsString()
  entityType: string;

  @IsString()
  canonicalName: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidenceScore?: number;

  @IsOptional()
  @IsEnum(EntitySource)
  source?: EntitySource;

  @IsOptional()
  @IsObject()
  metadata?: {
    description?: string;
    category?: string;
    tags?: string[];
    extraction_patterns?: string[];
    [key: string]: any;
  };

  @IsOptional()
  @IsString({ each: true })
  aliases?: string[];
}
