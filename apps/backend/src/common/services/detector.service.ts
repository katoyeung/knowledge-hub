import { Injectable, Logger } from '@nestjs/common';
import * as iconv from 'iconv-lite';
import * as jschardet from 'jschardet';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface FileTypeDetection {
  type: string;
  mimeType: string;
  extension: string;
  confidence: number;
}

export interface ContentDetection {
  language: string;
  isChinese: boolean;
  isEnglish: boolean;
  textType: 'plain' | 'structured' | 'code' | 'markup';
  encoding: string;
  confidence: number;
}

export interface EncodingDetection {
  encoding: string;
  confidence: number;
  isValid: boolean;
  convertedText?: string;
}

export interface FileDetectionResult {
  fileType: FileTypeDetection;
  content: ContentDetection;
  encoding: EncodingDetection;
  isValid: boolean;
  errors: string[];
}

@Injectable()
export class DetectorService {
  private readonly logger = new Logger(DetectorService.name);

  /**
   * Comprehensive file detection including type, content, and encoding
   */
  async detectFile(filePath: string): Promise<FileDetectionResult> {
    const errors: string[] = [];
    let isValid = true;

    try {
      // Read file as buffer for analysis
      const buffer = await fs.readFile(filePath);

      // Detect file type
      const fileType = await this.detectFileType(filePath, buffer);

      // Detect encoding
      const encoding = await this.detectEncoding(buffer);

      // Detect content (only if encoding is valid)
      let content: ContentDetection;
      if (encoding.isValid && encoding.convertedText) {
        content = this.detectContent(encoding.convertedText, encoding.encoding);
      } else {
        content = this.createDefaultContentDetection();
        errors.push('Could not detect valid encoding for content analysis');
        isValid = false;
      }

      return {
        fileType,
        content,
        encoding,
        isValid,
        errors,
      };
    } catch (error) {
      this.logger.error(`Failed to detect file ${filePath}:`, error);
      errors.push(`File detection failed: ${error.message}`);
      return {
        fileType: this.createDefaultFileTypeDetection(filePath),
        content: this.createDefaultContentDetection(),
        encoding: this.createDefaultEncodingDetection(),
        isValid: false,
        errors,
      };
    }
  }

  /**
   * Detect file type based on extension and content
   */
  async detectFileType(
    filePath: string,
    buffer?: Buffer,
  ): Promise<FileTypeDetection> {
    const extension = path.extname(filePath).toLowerCase();
    const fileName = path.basename(filePath);

    // File type mapping
    const typeMap: Record<
      string,
      { type: string; mimeType: string; confidence: number }
    > = {
      '.pdf': { type: 'pdf', mimeType: 'application/pdf', confidence: 0.9 },
      '.txt': { type: 'text', mimeType: 'text/plain', confidence: 0.8 },
      '.md': { type: 'markdown', mimeType: 'text/markdown', confidence: 0.9 },
      '.doc': { type: 'word', mimeType: 'application/msword', confidence: 0.8 },
      '.docx': {
        type: 'word',
        mimeType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        confidence: 0.9,
      },
      '.rtf': { type: 'rtf', mimeType: 'application/rtf', confidence: 0.8 },
      '.html': { type: 'html', mimeType: 'text/html', confidence: 0.9 },
      '.htm': { type: 'html', mimeType: 'text/html', confidence: 0.9 },
      '.xml': { type: 'xml', mimeType: 'application/xml', confidence: 0.8 },
      '.json': { type: 'json', mimeType: 'application/json', confidence: 0.9 },
      '.csv': { type: 'csv', mimeType: 'text/csv', confidence: 0.8 },
      '.xlsx': {
        type: 'excel',
        mimeType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        confidence: 0.9,
      },
      '.pptx': {
        type: 'powerpoint',
        mimeType:
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        confidence: 0.9,
      },
    };

    const detected = typeMap[extension] || {
      type: 'unknown',
      mimeType: 'application/octet-stream',
      confidence: 0.1,
    };

    // If we have buffer content, try to validate the file type
    if (buffer && detected.confidence < 0.9) {
      const contentValidation = this.validateFileTypeByContent(
        buffer,
        detected.type,
      );
      detected.confidence = Math.max(
        detected.confidence,
        contentValidation.confidence,
      );
    }

    return {
      type: detected.type,
      mimeType: detected.mimeType,
      extension,
      confidence: detected.confidence,
    };
  }

  /**
   * Detect file encoding with automatic conversion
   */
  async detectEncoding(buffer: Buffer): Promise<EncodingDetection> {
    try {
      // Use jschardet to detect encoding
      const detected = jschardet.detect(buffer);
      this.logger.log(
        `🔍 Detected encoding: ${detected.encoding} (confidence: ${detected.confidence})`,
      );

      // Try detected encoding first
      if (detected.encoding && detected.confidence > 0.7) {
        try {
          const decoded = iconv.decode(buffer, detected.encoding);
          if (this.isValidText(decoded)) {
            this.logger.log(
              `✅ Successfully decoded using detected encoding: ${detected.encoding}`,
            );
            return {
              encoding: detected.encoding,
              confidence: detected.confidence,
              isValid: true,
              convertedText: decoded,
            };
          }
        } catch (error) {
          this.logger.warn(
            `Failed to decode with detected encoding ${detected.encoding}:`,
            error,
          );
        }
      }

      // Fallback: try UTF-8
      try {
        const utf8Text = buffer.toString('utf-8');
        if (this.isValidText(utf8Text)) {
          this.logger.log('✅ Successfully decoded using UTF-8');
          return {
            encoding: 'utf-8',
            confidence: 0.8,
            isValid: true,
            convertedText: utf8Text,
          };
        }
      } catch (error) {
        // Continue to other encodings
      }

      // Try common encodings
      this.logger.log('🔍 Trying alternative encodings...');
      const encodings = [
        'gbk',
        'gb2312',
        'big5',
        'euc-cn',
        'gb18030',
        'latin1',
        'windows-1252',
      ];

      for (const encoding of encodings) {
        try {
          const decoded = iconv.decode(buffer, encoding);
          if (this.isValidText(decoded)) {
            this.logger.log(
              `✅ Successfully decoded using ${encoding} encoding`,
            );
            return {
              encoding,
              confidence: 0.7,
              isValid: true,
              convertedText: decoded,
            };
          }
        } catch (error) {
          continue;
        }
      }

      this.logger.warn(
        '⚠️ Could not find suitable encoding, using UTF-8 fallback',
      );
      return {
        encoding: 'utf-8',
        confidence: 0.1,
        isValid: false,
        convertedText: buffer.toString('utf-8'),
      };
    } catch (error) {
      this.logger.error('Encoding detection failed:', error);
      return {
        encoding: 'utf-8',
        confidence: 0.0,
        isValid: false,
        convertedText: buffer.toString('utf-8'),
      };
    }
  }

  /**
   * Detect content characteristics
   */
  detectContent(text: string, encoding: string): ContentDetection {
    const language = this.detectLanguage(text);
    const isChinese = this.isChineseText(text);
    const isEnglish = this.isEnglishText(text);
    const textType = this.detectTextType(text);

    return {
      language,
      isChinese,
      isEnglish,
      textType,
      encoding,
      confidence: this.calculateContentConfidence(text, language, textType),
    };
  }

  /**
   * Detect text language
   */
  private detectLanguage(text: string): string {
    const chineseCount = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || [])
      .length;
    const englishCount = (text.match(/[a-zA-Z]/g) || []).length;
    const totalLength = text.length;

    if (chineseCount > totalLength * 0.3) return 'zh';
    if (englishCount > totalLength * 0.3) return 'en';
    return 'unknown';
  }

  /**
   * Detect text type
   */
  private detectTextType(
    text: string,
  ): 'plain' | 'structured' | 'code' | 'markup' {
    // Check for markup
    if (
      text.includes('<html>') ||
      text.includes('<div>') ||
      text.includes('<p>')
    ) {
      return 'markup';
    }

    // Check for code
    if (
      text.includes('function') ||
      text.includes('class ') ||
      text.includes('import ') ||
      text.includes('def ')
    ) {
      return 'code';
    }

    // Check for structured data
    if (
      (text.includes('{') && text.includes('}')) ||
      (text.includes('[') && text.includes(']'))
    ) {
      return 'structured';
    }

    return 'plain';
  }

  /**
   * Validate file type by content analysis
   */
  private validateFileTypeByContent(
    buffer: Buffer,
    detectedType: string,
  ): { confidence: number } {
    // PDF validation
    if (detectedType === 'pdf') {
      const header = buffer.toString('ascii', 0, 4);
      return { confidence: header === '%PDF' ? 0.95 : 0.3 };
    }

    // JSON validation
    if (detectedType === 'json') {
      try {
        JSON.parse(buffer.toString('utf-8'));
        return { confidence: 0.95 };
      } catch {
        return { confidence: 0.3 };
      }
    }

    // HTML validation
    if (detectedType === 'html') {
      const content = buffer.toString('utf-8', 0, 1000);
      return {
        confidence:
          content.includes('<html') || content.includes('<div') ? 0.9 : 0.3,
      };
    }

    return { confidence: 0.5 };
  }

  /**
   * Check if text is valid (not garbled)
   */
  private isValidText(text: string): boolean {
    const garbledPatterns = [
      /[^\x00-\x7F\u4e00-\u9fff\u3400-\u4dbf\s\p{P}]/u,
      /[À-ÿ]{3,}/,
      /[Ωπµ∑©æ™±%]{3,}/,
      /[◊~'fl:]{3,}/,
      /[^\x20-\x7E\u4e00-\u9fff\u3400-\u4dbf\s]/g,
    ];

    const garbledCount = garbledPatterns.reduce((count, pattern) => {
      const matches = text.match(pattern);
      return count + (matches ? matches.length : 0);
    }, 0);

    const totalLength = text.length;
    const garbledRatio = garbledCount / totalLength;

    return garbledRatio < 0.2;
  }

  /**
   * Check if text contains Chinese characters
   */
  private isChineseText(text: string): boolean {
    const chinesePattern = /[\u4e00-\u9fff\u3400-\u4dbf]/;
    const chineseCount = (text.match(chinesePattern) || []).length;
    const totalLength = text.length;
    return chineseCount > totalLength * 0.1;
  }

  /**
   * Check if text contains English characters
   */
  private isEnglishText(text: string): boolean {
    const englishPattern = /[a-zA-Z]/;
    const englishCount = (text.match(englishPattern) || []).length;
    const totalLength = text.length;
    return englishCount > totalLength * 0.3;
  }

  /**
   * Calculate content detection confidence
   */
  private calculateContentConfidence(
    text: string,
    language: string,
    textType: string,
  ): number {
    let confidence = 0.5;

    // Language confidence
    if (language !== 'unknown') confidence += 0.3;

    // Text type confidence
    if (textType !== 'plain') confidence += 0.2;

    // Text quality confidence
    if (this.isValidText(text)) confidence += 0.2;

    return Math.min(confidence, 1.0);
  }

  /**
   * Create default file type detection
   */
  private createDefaultFileTypeDetection(filePath: string): FileTypeDetection {
    const extension = path.extname(filePath).toLowerCase();
    return {
      type: 'unknown',
      mimeType: 'application/octet-stream',
      extension,
      confidence: 0.1,
    };
  }

  /**
   * Create default content detection
   */
  private createDefaultContentDetection(): ContentDetection {
    return {
      language: 'unknown',
      isChinese: false,
      isEnglish: false,
      textType: 'plain',
      encoding: 'utf-8',
      confidence: 0.1,
    };
  }

  /**
   * Create default encoding detection
   */
  private createDefaultEncodingDetection(): EncodingDetection {
    return {
      encoding: 'utf-8',
      confidence: 0.1,
      isValid: false,
    };
  }
}
