import {
  IsString,
  IsOptional,
  IsArray,
  IsEnum,
  IsDateString,
  IsNumber,
  Min,
  Max,
  IsBoolean,
  IsObject,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { NodeType } from './create-graph-node.dto';
import { EdgeType } from './create-graph-edge.dto';

export class GraphQueryDto {
  @IsOptional()
  @IsArray()
  @IsEnum(NodeType, { each: true })
  nodeTypes?: NodeType[];

  @IsOptional()
  @IsArray()
  @IsEnum(EdgeType, { each: true })
  edgeTypes?: EdgeType[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  labels?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  brands?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  authors?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  topics?: string[];

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  minWeight?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  maxWeight?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(1000)
  @Type(() => Number)
  limit?: number = 100;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  offset?: number = 0;

  @IsOptional()
  @IsString()
  searchTerm?: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  includeProperties?: boolean = true;

  @IsOptional()
  @IsObject()
  propertiesFilter?: Record<string, any>;

  @IsOptional()
  @IsString()
  sortBy?: 'createdAt' | 'updatedAt' | 'weight' | 'label';

  @IsOptional()
  @IsEnum(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC' = 'DESC';
}

export class GraphStatsDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  brands?: string[];

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  includeTemporalData?: boolean = false;
}
