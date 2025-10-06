import { Injectable, Logger } from '@nestjs/common';
import pdfParse from 'pdf-parse';
import * as fs from 'fs';

export interface SimplePdfParseResult {
  success: boolean;
  content: string;
  metadata: {
    totalPages: number;
    totalWords: number;
    totalCharacters: number;
    processingTime: number;
    fileSize: number;
    title?: string;
    author?: string;
    creator?: string;
    creationDate?: Date;
    modificationDate?: Date;
  };
  errors?: string[];
}

/**
 * Simple PDF Parser Service
 *
 * Provides basic PDF text extraction without complex analysis.
 * For advanced document understanding, use RagflowPdfParserService.
 */
@Injectable()
export class SimplePdfParserService {
  private readonly logger = new Logger(SimplePdfParserService.name);

  /**
   * Extract text content from PDF file
   * @param filePath Path to the PDF file
   * @returns Simple parsing result with extracted text and basic metadata
   */
  async extractTextFromPdf(filePath: string): Promise<SimplePdfParseResult> {
    const startTime = Date.now();

    this.logger.log(`Starting simple PDF text extraction for: ${filePath}`);

    try {
      // Validate file existence
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      const fileStats = fs.statSync(filePath);
      const dataBuffer = fs.readFileSync(filePath);

      // Parse PDF using pdf-parse
      const pdfData = await pdfParse(dataBuffer, {
        max: 0, // No page limit
        version: 'v1.10.100',
      });

      const content = pdfData.text || '';
      const processingTime = Date.now() - startTime;

      // Calculate basic statistics
      const totalWords = this.countWords(content);
      const totalCharacters = content.length;

      const result: SimplePdfParseResult = {
        success: true,
        content,
        metadata: {
          totalPages: pdfData.numpages || 0,
          totalWords,
          totalCharacters,
          processingTime,
          fileSize: fileStats.size,
          title: pdfData.info?.Title || undefined,
          author: pdfData.info?.Author || undefined,
          creator: pdfData.info?.Creator || undefined,
          creationDate: pdfData.info?.CreationDate || undefined,
          modificationDate: pdfData.info?.ModDate || undefined,
        },
      };

      this.logger.log(
        `PDF text extraction completed. Extracted ${totalWords} words from ${pdfData.numpages} pages in ${processingTime}ms`,
      );

      return result;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.logger.error(
        `PDF text extraction failed: ${error.message}`,
        error.stack,
      );

      return {
        success: false,
        content: '',
        metadata: {
          totalPages: 0,
          totalWords: 0,
          totalCharacters: 0,
          processingTime,
          fileSize: 0,
        },
        errors: [error.message],
      };
    }
  }

  /**
   * Extract text content from PDF buffer
   * @param buffer PDF file buffer
   * @returns Simple parsing result with extracted text and basic metadata
   */
  async extractTextFromBuffer(buffer: Buffer): Promise<SimplePdfParseResult> {
    const startTime = Date.now();

    this.logger.log('Starting simple PDF text extraction from buffer');

    try {
      // Parse PDF using pdf-parse
      const pdfData = await pdfParse(buffer, {
        max: 0, // No page limit
        version: 'v1.10.100',
      });

      const content = pdfData.text || '';
      const processingTime = Date.now() - startTime;

      // Calculate basic statistics
      const totalWords = this.countWords(content);
      const totalCharacters = content.length;

      const result: SimplePdfParseResult = {
        success: true,
        content,
        metadata: {
          totalPages: pdfData.numpages || 0,
          totalWords,
          totalCharacters,
          processingTime,
          fileSize: buffer.length,
          title: pdfData.info?.Title || undefined,
          author: pdfData.info?.Author || undefined,
          creator: pdfData.info?.Creator || undefined,
          creationDate: pdfData.info?.CreationDate || undefined,
          modificationDate: pdfData.info?.ModDate || undefined,
        },
      };

      this.logger.log(
        `PDF text extraction completed. Extracted ${totalWords} words from ${pdfData.numpages} pages in ${processingTime}ms`,
      );

      return result;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.logger.error(
        `PDF text extraction failed: ${error.message}`,
        error.stack,
      );

      return {
        success: false,
        content: '',
        metadata: {
          totalPages: 0,
          totalWords: 0,
          totalCharacters: 0,
          processingTime,
          fileSize: buffer.length,
        },
        errors: [error.message],
      };
    }
  }

  /**
   * Count words in text content
   * @param text The text to count words in
   * @returns Number of words
   */
  private countWords(text: string): number {
    if (!text || text.trim().length === 0) {
      return 0;
    }

    return text
      .trim()
      .split(/\s+/)
      .filter((word) => word.length > 0).length;
  }
}
