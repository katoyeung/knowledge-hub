import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  Min,
  Max,
} from 'class-validator';

export class EntityConstraint {
  @IsString()
  entityType: string;

  @IsString()
  canonicalName: string;

  @IsArray()
  @IsString({ each: true })
  aliases: string[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number;

  @IsOptional()
  @IsString()
  description?: string;
}

export class EntityConstraintsDto {
  @IsArray()
  entities: EntityConstraint[];

  @IsOptional()
  @IsString()
  context?: string; // Additional context for the constraints

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  threshold?: number; // Minimum confidence for using constraints
}
