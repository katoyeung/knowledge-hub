import { Injectable, Logger } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import * as fs from 'fs';
import { DetectorService } from '../../../common/services/detector.service';
import { CsvConnectorTemplateService } from './csv-connector-template.service';
import {
  CsvParseResult,
  CsvRowData,
  CsvSegmentData,
  CsvConfig,
} from '../interfaces/csv-connector.interface';

@Injectable()
export class CsvParserService {
  private readonly logger = new Logger(CsvParserService.name);

  constructor(
    private readonly detectorService: DetectorService,
    private readonly templateService: CsvConnectorTemplateService,
  ) {}

  /**
   * Parse CSV file and return structured data
   */
  async parseCsvFile(filePath: string): Promise<CsvParseResult> {
    try {
      this.logger.log(`Parsing CSV file: ${filePath}`);

      // Detect file encoding and content
      const detection = await this.detectorService.detectFile(filePath);

      if (!detection.isValid || !detection.encoding.convertedText) {
        return {
          success: false,
          headers: [],
          rows: [],
          totalRows: 0,
          errors: ['Failed to detect valid encoding for CSV file'],
        };
      }

      // Parse CSV content
      const csvContent = detection.encoding.convertedText;
      const parseOptions = {
        columns: true, // Use first row as headers
        skip_empty_lines: true,
        trim: true,
        delimiter: ',',
        quote: '"',
        escape: '"',
      };

      let parsedData: any[];
      try {
        parsedData = parse(csvContent, parseOptions);
      } catch (parseError) {
        this.logger.error(`CSV parsing failed: ${parseError.message}`);
        return {
          success: false,
          headers: [],
          rows: [],
          totalRows: 0,
          errors: [`CSV parsing failed: ${parseError.message}`],
        };
      }

      if (parsedData.length === 0) {
        return {
          success: false,
          headers: [],
          rows: [],
          totalRows: 0,
          errors: ['CSV file is empty or has no valid data rows'],
        };
      }

      // Extract headers from first row
      const headers = Object.keys(parsedData[0]);
      const rows: CsvRowData[] = parsedData.map((row, index) => {
        const processedRow: CsvRowData = {};
        for (const [key, value] of Object.entries(row)) {
          // Convert string numbers to numbers where appropriate
          if (
            typeof value === 'string' &&
            !isNaN(Number(value)) &&
            value.trim() !== ''
          ) {
            processedRow[key] = Number(value);
          } else {
            processedRow[key] = (value as string | number | null) || null;
          }
        }
        return processedRow;
      });

      this.logger.log(
        `Successfully parsed CSV: ${headers.length} columns, ${rows.length} rows`,
      );

      return {
        success: true,
        headers,
        rows,
        totalRows: rows.length,
      };
    } catch (error) {
      this.logger.error(`Failed to parse CSV file ${filePath}:`, error);
      return {
        success: false,
        headers: [],
        rows: [],
        totalRows: 0,
        errors: [`Failed to parse CSV file: ${error.message}`],
      };
    }
  }

  /**
   * Generate segment data from CSV rows using connector configuration
   */
  generateSegmentData(rows: CsvRowData[], config: CsvConfig): CsvSegmentData[] {
    const segments: CsvSegmentData[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      // Combine searchable columns into content
      const contentParts: string[] = [];
      for (const column of config.searchableColumns) {
        const value = row[column];
        if (value && typeof value === 'string' && value.trim()) {
          contentParts.push(value.trim());
        }
      }

      const content = contentParts.join('\n\n');

      // Create segment data
      const segmentData: CsvSegmentData = {
        content,
        csvRow: row,
        position: i + 1, // 1-based position
      };

      segments.push(segmentData);
    }

    this.logger.log(`Generated ${segments.length} segments from CSV data`);
    return segments;
  }

  /**
   * Parse CSV file and create configuration from template
   */
  async parseCsvWithTemplate(
    filePath: string,
    templateName: string,
  ): Promise<{
    parseResult: CsvParseResult;
    config: CsvConfig | null;
  }> {
    const parseResult = await this.parseCsvFile(filePath);

    if (!parseResult.success) {
      return {
        parseResult,
        config: null,
      };
    }

    const config = this.templateService.createConfigFromTemplate(
      templateName,
      parseResult.headers,
    );

    if (config) {
      config.totalRows = parseResult.totalRows;
    }

    return {
      parseResult,
      config,
    };
  }

  /**
   * Parse CSV file with custom configuration
   */
  async parseCsvWithCustomConfig(
    filePath: string,
    fieldMappings: Record<string, string>,
    searchableColumns: string[],
  ): Promise<{
    parseResult: CsvParseResult;
    config: CsvConfig | null;
  }> {
    const parseResult = await this.parseCsvFile(filePath);

    if (!parseResult.success) {
      return {
        parseResult,
        config: null,
      };
    }

    const config = this.templateService.createCustomConfig(
      fieldMappings,
      searchableColumns,
      parseResult.headers,
    );

    config.totalRows = parseResult.totalRows;

    return {
      parseResult,
      config,
    };
  }

  /**
   * Validate CSV structure for a specific template
   */
  async validateCsvForTemplate(
    filePath: string,
    templateName: string,
  ): Promise<{
    isValid: boolean;
    parseResult: CsvParseResult;
    validation: {
      missingColumns: string[];
      extraColumns: string[];
    };
  }> {
    const parseResult = await this.parseCsvFile(filePath);

    if (!parseResult.success) {
      return {
        isValid: false,
        parseResult,
        validation: {
          missingColumns: [],
          extraColumns: [],
        },
      };
    }

    const validation = this.templateService.validateHeaders(
      templateName,
      parseResult.headers,
    );

    return {
      isValid: validation.isValid,
      parseResult,
      validation,
    };
  }
}
