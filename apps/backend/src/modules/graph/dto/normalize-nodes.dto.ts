import {
  IsString,
  IsOptional,
  IsArray,
  IsNumber,
  IsEnum,
  Min,
  Max,
} from 'class-validator';
import { NormalizationMethod } from '../entities/entity-normalization-log.entity';

export class NormalizeNodesDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  nodeIds?: string[];

  @IsOptional()
  @IsString()
  entityType?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  similarityThreshold?: number;

  @IsOptional()
  @IsEnum(NormalizationMethod)
  method?: NormalizationMethod;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidenceThreshold?: number;

  @IsOptional()
  @IsString()
  keyNodeId?: string; // Specific node to use as normalization target
}
