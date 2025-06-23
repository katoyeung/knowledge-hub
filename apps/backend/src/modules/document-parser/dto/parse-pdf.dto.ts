import { IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { RagflowParseOptions } from '../services/ragflow-pdf-parser.service';

export class ParsePdfDto {
  @IsOptional()
  @IsString()
  filePath?: string;

  @IsOptional()
  @Transform(({ value }) => {
    // Handle undefined or null values
    if (value === undefined || value === null || value === '') {
      return undefined;
    }

    // Handle JSON string conversion from form data
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        // If parsing fails, return undefined to make it optional
        return undefined;
      }
    }
    return value;
  })
  options?: RagflowParseOptions;
}
