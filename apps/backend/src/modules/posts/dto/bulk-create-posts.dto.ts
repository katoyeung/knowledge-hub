import {
  IsArray,
  ValidateNested,
  IsString,
  IsOptional,
  IsObject,
  MaxLength,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';

class BulkPostItemDto {
  @IsString()
  @MaxLength(255)
  hash: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  provider?: string; // e.g., "google api", "lenx api"

  @IsOptional()
  @IsString()
  @MaxLength(255)
  source?: string; // e.g., "facebook", "twitter"

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsObject()
  meta?: Record<string, any>; // Content should be stored in meta.content

  @IsOptional()
  @IsUUID()
  userId?: string;
}

export class BulkCreatePostsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkPostItemDto)
  posts: BulkPostItemDto[];
}
