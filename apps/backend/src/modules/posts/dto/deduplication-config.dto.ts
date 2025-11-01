import { IsArray, IsString, IsOptional, IsBoolean } from 'class-validator';

export class DeduplicationFieldMapping {
  @IsString()
  field: 'title' | 'content' | `meta.${string}`; // e.g., 'title', 'content', 'meta.site', 'meta.channel'

  @IsOptional()
  @IsBoolean()
  normalize?: boolean; // Whether to normalize (trim, lowercase) the field value
}

export class DeduplicationConfigDto {
  @IsArray()
  @IsString({ each: true })
  fields: string[]; // Array of field paths: ['title', 'content', 'meta.site', 'meta.channel']
}
