import {
  IsOptional,
  IsString,
  IsArray,
  IsObject,
  IsEnum,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum HashAlgorithm {
  SHA256 = 'sha256',
  SHA512 = 'sha512',
  MD5 = 'md5',
}

export class HashConfigDto {
  @IsEnum(HashAlgorithm)
  algorithm: HashAlgorithm = HashAlgorithm.SHA256;

  @IsArray()
  @IsString({ each: true })
  fields: string[]; // Fields to use for hash calculation (e.g., ['title', 'meta.content', 'meta.post_link'])

  @IsOptional()
  @IsString()
  separator?: string; // Separator between fields (default: '|')

  @IsOptional()
  @IsString()
  prefix?: string; // Optional prefix to add before hashing
}

export class FieldMappingDto {
  @IsString()
  from: string; // Source field path (e.g., 'thread_title', 'meta.headline')

  @IsString()
  to: string; // Target field path (e.g., 'title', 'meta.custom_field')

  @IsOptional()
  @IsString()
  transform?: string; // Optional transformation (e.g., 'trim', 'lowercase', 'uppercase')
}

export class UpsertConfigDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => HashConfigDto)
  hashConfig?: HashConfigDto; // How to calculate hash from source data

  @IsOptional()
  @IsString()
  titleMapping?: string; // Which field maps to title (e.g., 'thread_title', 'meta.headline')

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FieldMappingDto)
  fieldMappings?: FieldMappingDto[]; // Field mappings for meta and other fields

  @IsOptional()
  @IsObject()
  defaultMeta?: Record<string, any>; // Default values to merge into meta
}
