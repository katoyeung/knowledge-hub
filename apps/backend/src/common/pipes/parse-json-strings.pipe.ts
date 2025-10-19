import { PipeTransform, Injectable, ArgumentMetadata } from '@nestjs/common';

@Injectable()
export class ParseJsonStringsPipe implements PipeTransform {
  transform(value: any, metadata: ArgumentMetadata) {
    if (value && typeof value === 'object') {
      // Parse JSON strings for specific fields
      if (
        value.csvFieldMappings &&
        typeof value.csvFieldMappings === 'string'
      ) {
        try {
          value.csvFieldMappings = JSON.parse(value.csvFieldMappings);
        } catch (error) {
          // If parsing fails, keep the original value
          console.warn('Failed to parse csvFieldMappings:', error.message);
        }
      }

      if (
        value.csvSearchableColumns &&
        typeof value.csvSearchableColumns === 'string'
      ) {
        try {
          value.csvSearchableColumns = JSON.parse(value.csvSearchableColumns);
        } catch (error) {
          // If parsing fails, keep the original value
          console.warn('Failed to parse csvSearchableColumns:', error.message);
        }
      }
    }

    return value;
  }
}
