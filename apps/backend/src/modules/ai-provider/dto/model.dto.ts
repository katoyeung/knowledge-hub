import {
  IsString,
  IsOptional,
  IsNumber,
  IsObject,
  ValidateNested,
  MinLength,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class PricingDto {
  @IsNumber()
  input: number;

  @IsNumber()
  output: number;
}

export class ModelDto {
  @IsString()
  @MinLength(1, { message: 'Model ID is required' })
  @MaxLength(255, { message: 'Model ID must not exceed 255 characters' })
  id: string;

  @IsString()
  @MinLength(1, { message: 'Model name is required' })
  @MaxLength(255, { message: 'Model name must not exceed 255 characters' })
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'Description must not exceed 1000 characters' })
  description?: string;

  @IsOptional()
  @IsNumber()
  maxTokens?: number;

  @IsOptional()
  @IsNumber()
  contextWindow?: number;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => PricingDto)
  pricing?: PricingDto;
}

export class AddModelDto extends ModelDto {}

export class UpdateModelDto {
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Model name must not exceed 255 characters' })
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'Description must not exceed 1000 characters' })
  description?: string;

  @IsOptional()
  @IsNumber()
  maxTokens?: number;

  @IsOptional()
  @IsNumber()
  contextWindow?: number;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => PricingDto)
  pricing?: PricingDto;
}
