import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as pdfParse from 'pdf-parse';
import * as fs from 'fs';
import * as path from 'path';
import * as natural from 'natural';
import { v4 as uuidv4 } from 'uuid';
import { Document } from '../../dataset/entities/document.entity';
import { DocumentSegment } from '../../dataset/entities/document-segment.entity';
import {
  EmbeddingModel,
  TextSplitter,
} from '../../dataset/dto/create-dataset-step.dto';
import { ChineseTextPreprocessorService } from './chinese-text-preprocessor.service';

export interface RagflowParseResult {
  success: boolean;
  content: string;
  segments: ParsedSegment[];
  tables: TableStructure[];
  metadata: DocumentMetadata;
  errors?: string[];
  processingMetadata?: Record<string, any>;
}

export interface ParsedSegment {
  id: string;
  content: string;
  type: 'text' | 'title' | 'paragraph' | 'list' | 'footer' | 'header';
  position: number;
  pageNumber: number;
  boundingBox?: BoundingBox;
  confidence: number;
  keywords: string[];
  wordCount: number;
  tokenCount: number;
  // 🆕 Parent-Child Chunking Support
  parentId?: string;
  segmentType?: 'parent' | 'child' | 'chunk';
  hierarchyLevel?: number;
  childOrder?: number;
  childCount?: number;
  hierarchyMetadata?: Record<string, any>;
}

export interface TableStructure {
  id: string;
  pageNumber: number;
  boundingBox: BoundingBox;
  rows: number;
  columns: number;
  content: string[][];
  htmlContent: string;
  confidence: number;
}

export interface DocumentMetadata {
  title?: string;
  author?: string;
  creator?: string;
  creationDate?: Date;
  modificationDate?: Date;
  totalPages: number;
  totalWords: number;
  totalTokens: number;
  language?: string;
  fileSize: number;
  processingTime: number;
  extractionMethod: 'deepdoc' | 'naive' | 'hybrid';
}

export interface BoundingBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  width: number;
  height: number;
}

export interface EmbeddingOptimizedConfig {
  model: EmbeddingModel;
  customModelName?: string;
  provider: string;
  textSplitter: TextSplitter;
  chunkSize: number;
  chunkOverlap: number;
  separators?: string[];
  confidenceThreshold?: number;
  enableTableExtraction?: boolean;
  enableImageExtraction?: boolean;
}

export interface RagflowParseOptions {
  extractionMethod?: 'deepdoc' | 'naive' | 'hybrid';
  enableTableExtraction?: boolean;
  enableImageExtraction?: boolean;
  segmentationStrategy?: 'paragraph' | 'sentence' | 'semantic' | 'hybrid';
  maxSegmentLength?: number;
  minSegmentLength?: number;
  overlapRatio?: number;
  confidenceThreshold?: number;
  embeddingConfig?: EmbeddingOptimizedConfig;
}

type RequiredRagflowParseOptions = Required<
  Omit<RagflowParseOptions, 'embeddingConfig'>
> & {
  embeddingConfig?: EmbeddingOptimizedConfig;
};

@Injectable()
export class RagflowPdfParserService {
  private readonly logger = new Logger(RagflowPdfParserService.name);
  private readonly defaultOptions: Required<
    Omit<RagflowParseOptions, 'embeddingConfig'>
  > = {
    extractionMethod: 'hybrid',
    enableTableExtraction: true,
    enableImageExtraction: false,
    segmentationStrategy: 'hybrid',
    maxSegmentLength: 2000,
    minSegmentLength: 50,
    overlapRatio: 0.15,
    confidenceThreshold: 0.7,
  };

  constructor(
    @InjectRepository(Document)
    private readonly documentRepository: Repository<Document>,
    @InjectRepository(DocumentSegment)
    private readonly segmentRepository: Repository<DocumentSegment>,
    private readonly chineseTextPreprocessorService: ChineseTextPreprocessorService,
  ) {}

  /**
   * Parse PDF document using RAGFlow-inspired deep document understanding
   * References RAGFlow's DeepDoc architecture for advanced PDF parsing
   */
  async parsePdf(
    filePath: string,
    options?: RagflowParseOptions,
  ): Promise<RagflowParseResult> {
    const startTime = Date.now();
    const mergedOptions = { ...this.defaultOptions, ...options };

    this.logger.log(`Starting RAGFlow-inspired PDF parsing for: ${filePath}`);

    try {
      // Validate file existence
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      const fileStats = fs.statSync(filePath);
      const dataBuffer = fs.readFileSync(filePath);

      // Primary PDF parsing with error handling
      let pdfData: any;
      try {
        pdfData = await pdfParse(dataBuffer, {
          // Enhanced parsing options inspired by RAGFlow
          max: 0, // No page limit
          version: 'v1.10.100',
        });
      } catch (error) {
        this.logger.error(`PDF parsing failed: ${error.message}`);
        return {
          success: false,
          content: '',
          segments: [],
          tables: [],
          metadata: this.createEmptyMetadata(
            fileStats.size,
            Date.now() - startTime,
          ),
          errors: [`PDF parsing failed: ${error.message}`],
        };
      }

      // Extract basic content
      const rawContent = pdfData.text || '';

      // 🆕 Apply text preprocessing to ALL documents (not just Chinese)
      let processedContent = rawContent;
      const originalLength = rawContent.length;

      this.logger.log(
        `🧹 [RAGFlow DEBUG] Starting text preprocessing for ${originalLength} characters`,
      );
      this.logger.log(
        `🧹 [RAGFlow DEBUG] Content before cleaning: "${rawContent.substring(0, 200)}..."`,
      );

      // Check if it's Chinese text for specialized processing
      const isChinese =
        this.chineseTextPreprocessorService.isChineseText(rawContent);
      this.logger.log(
        `🧹 [RAGFlow DEBUG] Chinese text detection result: ${isChinese}`,
      );

      if (isChinese) {
        this.logger.log(
          `🇨🇳 [RAGFlow DEBUG] Applying Chinese-specific preprocessing to ${rawContent.length} characters`,
        );
        processedContent =
          this.chineseTextPreprocessorService.preprocessChineseText(rawContent);
        this.logger.log(`🇨🇳 [RAGFlow DEBUG] Chinese preprocessing complete`);
      } else {
        this.logger.log(
          `🌐 [RAGFlow DEBUG] Applying general text cleaning to ${rawContent.length} characters`,
        );
        processedContent = this.cleanGeneralText(rawContent);
        this.logger.log(`🌐 [RAGFlow DEBUG] General text cleaning complete`);
      }

      this.logger.log(
        `✨ [RAGFlow DEBUG] Text preprocessing complete: ${originalLength} → ${processedContent.length} characters`,
      );
      this.logger.log(
        `✨ [RAGFlow DEBUG] Content after cleaning: "${processedContent.substring(0, 200)}..."`,
      );

      // Deep document understanding - layout analysis
      const layoutAnalysis = await this.performLayoutAnalysis(
        processedContent,
        mergedOptions,
      );

      // Advanced segmentation using RAGFlow-inspired techniques
      const segments = await this.performAdvancedSegmentation(
        processedContent,
        layoutAnalysis,
        mergedOptions,
      );

      // Table extraction (RAGFlow-inspired table structure recognition)
      const tables = mergedOptions.enableTableExtraction
        ? await this.extractTables(rawContent, pdfData.numpages)
        : [];

      // Create comprehensive metadata
      const metadata = this.createMetadata(
        pdfData,
        fileStats.size,
        Date.now() - startTime,
        mergedOptions.extractionMethod,
        segments,
      );

      const result: RagflowParseResult = {
        success: true,
        content: processedContent,
        segments,
        tables,
        metadata,
      };

      this.logger.log(
        `RAGFlow PDF parsing completed. Extracted ${segments.length} segments and ${tables.length} tables in ${metadata.processingTime}ms`,
      );

      return result;
    } catch (error) {
      this.logger.error(
        `RAGFlow PDF parsing error: ${error.message}`,
        error.stack,
      );
      return {
        success: false,
        content: '',
        segments: [],
        tables: [],
        metadata: this.createEmptyMetadata(0, Date.now() - startTime),
        errors: [error.message],
      };
    }
  }

  /**
   * RAGFlow-inspired layout analysis for document structure understanding
   */
  private async performLayoutAnalysis(
    content: string,
    options: any,
  ): Promise<any> {
    this.logger.debug('Performing layout analysis...');

    // Simulate RAGFlow's layout recognition capabilities
    const lines = content.split('\n').filter((line) => line.trim().length > 0);
    const layoutStructure = {
      titles: [] as string[],
      paragraphs: [] as string[],
      lists: [] as string[],
      footers: [] as string[],
      headers: [] as string[],
    };

    for (const line of lines) {
      const trimmedLine = line.trim();

      // Title detection (inspired by RAGFlow's title recognition)
      if (this.isTitleLine(trimmedLine)) {
        layoutStructure.titles.push(trimmedLine);
      }
      // List detection
      else if (this.isListItem(trimmedLine)) {
        layoutStructure.lists.push(trimmedLine);
      }
      // Header/Footer detection
      else if (this.isHeaderFooter(trimmedLine)) {
        if (trimmedLine.length < 50) {
          layoutStructure.footers.push(trimmedLine);
        } else {
          layoutStructure.headers.push(trimmedLine);
        }
      }
      // Regular paragraph
      else if (trimmedLine.length >= options.minSegmentLength) {
        layoutStructure.paragraphs.push(trimmedLine);
      }
    }

    return layoutStructure;
  }

  /**
   * Advanced segmentation using RAGFlow-inspired techniques
   * Fixed to create meaningful segments instead of processing line by line
   */
  private async performAdvancedSegmentation(
    content: string,
    layoutAnalysis: any,
    options: any,
  ): Promise<ParsedSegment[]> {
    this.logger.debug('Performing advanced segmentation...');

    const segments: ParsedSegment[] = [];

    // First, try to segment the full content intelligently
    const chunks = this.splitByStrategy(content, options);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i].trim();

      if (chunk.length >= options.minSegmentLength) {
        // Determine content type based on content characteristics
        const type = this.determineContentType(chunk);

        const segment = await this.createSegment(
          chunk,
          type,
          i,
          1, // Page number would be determined in real implementation
          options,
        );

        if (segment) {
          segments.push(segment);
        }
      }
    }

    // If we have very few segments, try a more aggressive approach
    if (segments.length < 3 && content.length > options.maxSegmentLength) {
      this.logger.debug('Using fallback segmentation for better coverage...');
      return this.performFallbackSegmentation(content, options);
    }

    return segments;
  }

  /**
   * Determine content type based on content characteristics
   */
  private determineContentType(content: string): ParsedSegment['type'] {
    const trimmed = content.trim();

    // Check for titles (short, capitalized, no ending period)
    if (
      trimmed.length < 150 &&
      /^[A-Z0-9]/.test(trimmed) &&
      !trimmed.endsWith('.')
    ) {
      return 'title';
    }

    // Check for list items
    if (/^(\d+\.|[•\-\*]|\([a-z]\)|\([0-9]+\))\s/.test(trimmed)) {
      return 'list';
    }

    // Check for headers/footers (short with typical footer content)
    if (
      trimmed.length < 100 &&
      (/^\d+$/.test(trimmed) || /copyright|©|\d{4}|page\s*\d+/i.test(trimmed))
    ) {
      return 'footer';
    }

    // Default to paragraph for substantial content
    return 'paragraph';
  }

  /**
   * Fallback segmentation for when primary method produces too few segments
   */
  private performFallbackSegmentation(
    content: string,
    options: Required<RagflowParseOptions>,
  ): ParsedSegment[] {
    const segments: ParsedSegment[] = [];
    const paragraphs = content
      .split(/\n\s*\n/)
      .filter((p) => p.trim().length > 0);

    let position = 0;

    for (const paragraph of paragraphs) {
      if (paragraph.trim().length >= options.minSegmentLength) {
        if (paragraph.length <= options.maxSegmentLength) {
          // Paragraph fits in one segment
          const segment = this.createSegmentSync(
            paragraph.trim(),
            this.determineContentType(paragraph),
            position++,
            1,
            options,
          );
          if (segment) segments.push(segment);
        } else {
          // Split large paragraph into sentences
          const sentences = this.splitBySentence(
            paragraph,
            options.maxSegmentLength,
          );
          for (const sentence of sentences) {
            if (sentence.trim().length >= options.minSegmentLength) {
              const segment = this.createSegmentSync(
                sentence.trim(),
                'paragraph',
                position++,
                1,
                options,
              );
              if (segment) segments.push(segment);
            }
          }
        }
      }
    }

    return segments;
  }

  /**
   * Synchronous version of createSegment for fallback processing
   */
  private createSegmentSync(
    content: string,
    type: ParsedSegment['type'],
    position: number,
    pageNumber: number,
    options: Required<RagflowParseOptions>,
  ): ParsedSegment | null {
    if (content.trim().length < options.minSegmentLength) {
      return null;
    }

    const keywords = this.extractKeywords(content);
    const wordCount = content
      .split(/\s+/)
      .filter((word) => word.length > 0).length;
    const tokenCount = Math.ceil(wordCount * 0.75);

    return {
      id: uuidv4(),
      content: content.trim(),
      type,
      position,
      pageNumber,
      confidence: this.calculateConfidence(content, type),
      keywords,
      wordCount,
      tokenCount,
    };
  }

  /**
   * Segment content using various strategies inspired by RAGFlow
   */
  private async segmentContent(
    content: string,
    type: ParsedSegment['type'],
    options: Required<RagflowParseOptions>,
    basePosition: number,
  ): Promise<ParsedSegment[]> {
    const segments: ParsedSegment[] = [];

    if (content.length <= options.maxSegmentLength) {
      // Content fits in single segment
      const segment = await this.createSegment(
        content,
        type,
        basePosition,
        1,
        options,
      );
      if (segment) segments.push(segment);
    } else {
      // Split content based on strategy
      const chunks = this.splitByStrategy(content, options);

      for (let i = 0; i < chunks.length; i++) {
        const segment = await this.createSegment(
          chunks[i],
          type,
          basePosition + i,
          1, // Page number would be determined in real implementation
          options,
        );
        if (segment) segments.push(segment);
      }
    }

    return segments;
  }

  /**
   * Create a parsed segment with metadata
   */
  private async createSegment(
    content: string,
    type: ParsedSegment['type'],
    position: number,
    pageNumber: number,
    options: Required<RagflowParseOptions>,
  ): Promise<ParsedSegment | null> {
    if (content.trim().length < options.minSegmentLength) {
      return null;
    }

    // Extract keywords using NLP (inspired by RAGFlow's keyword extraction)
    const keywords = this.extractKeywords(content);
    const wordCount = content.split(/\s+/).length;
    const tokenCount = Math.ceil(wordCount * 0.75); // Rough token estimation

    return {
      id: uuidv4(),
      content: content.trim(),
      type,
      position,
      pageNumber,
      confidence: this.calculateConfidence(content, type),
      keywords,
      wordCount,
      tokenCount,
    };
  }

  /**
   * Extract tables using RAGFlow-inspired table structure recognition
   */
  private async extractTables(
    content: string,
    totalPages: number,
  ): Promise<TableStructure[]> {
    this.logger.debug('Extracting tables...');

    const tables: TableStructure[] = [];
    const lines = content.split('\n');

    // Simple table detection (in real RAGFlow, this would use computer vision)
    let tableId = 1;
    let currentTable: string[] = [];
    let inTable = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Detect table-like patterns
      if (this.isTableRow(line)) {
        if (!inTable) {
          inTable = true;
          currentTable = [];
        }
        currentTable.push(line);
      } else if (inTable && currentTable.length >= 2) {
        // End of table found
        const table = this.createTableFromRows(currentTable, tableId++, 1);
        if (table) tables.push(table);

        inTable = false;
        currentTable = [];
      } else if (inTable) {
        inTable = false;
        currentTable = [];
      }
    }

    // Handle table at end of document
    if (inTable && currentTable.length >= 2) {
      const table = this.createTableFromRows(currentTable, tableId, 1);
      if (table) tables.push(table);
    }

    return tables;
  }

  /**
   * Helper methods for content analysis
   */
  private isTitleLine(line: string): boolean {
    // Title detection heuristics inspired by RAGFlow
    return (
      line.length < 100 &&
      line.length > 5 &&
      /^[A-Z0-9]/.test(line) &&
      !line.endsWith('.') &&
      !/^\d+\./.test(line)
    );
  }

  private isListItem(line: string): boolean {
    return /^(\d+\.|[•\-\*]|\([a-z]\)|\([0-9]+\))\s/.test(line.trim());
  }

  private isHeaderFooter(line: string): boolean {
    return (
      line.length < 200 &&
      (/^\d+$/.test(line) || // Page numbers
        /^(page|p\.)\s*\d+/i.test(line) ||
        /copyright|©|\d{4}/.test(line.toLowerCase()))
    );
  }

  private isTableRow(line: string): boolean {
    // Simple table row detection
    const separators = ['\t', '|', '  ', '   '];
    return separators.some(
      (sep) =>
        line.includes(sep) &&
        line.split(sep).filter((cell) => cell.trim()).length >= 2,
    );
  }

  private splitByStrategy(
    content: string,
    options: Required<RagflowParseOptions>,
  ): string[] {
    switch (options.segmentationStrategy) {
      case 'sentence':
        return this.splitBySentence(content, options.maxSegmentLength);
      case 'semantic':
        return this.splitBySemantic(content, options.maxSegmentLength);
      case 'paragraph':
        return this.splitByParagraph(content, options.maxSegmentLength);
      case 'hybrid':
      default:
        return this.splitByHybrid(content, options.maxSegmentLength);
    }
  }

  private splitBySentence(content: string, maxLength: number): string[] {
    // Improved sentence splitting with better boundary detection
    const sentences = content
      .split(/(?<=[.!?])\s+(?=[A-Z])/) // Split on sentence boundaries
      .filter((s) => s.trim().length > 0);

    const chunks: string[] = [];
    let currentChunk = '';

    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      const potentialChunk = currentChunk
        ? `${currentChunk} ${trimmed}`
        : trimmed;

      if (potentialChunk.length <= maxLength) {
        currentChunk = potentialChunk;
      } else {
        if (currentChunk) {
          chunks.push(currentChunk);
        }
        // If single sentence is too long, split it carefully
        if (trimmed.length > maxLength) {
          const subChunks = this.splitLongSentence(trimmed, maxLength);
          chunks.push(...subChunks);
          currentChunk = '';
        } else {
          currentChunk = trimmed;
        }
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk);
    }

    return chunks.filter((chunk) => chunk.trim().length > 0);
  }

  private splitByParagraph(content: string, maxLength: number): string[] {
    // Enhanced paragraph splitting with better paragraph detection
    const paragraphs = content
      .split(/\n\s*\n/) // Split on double newlines
      .filter((p) => p.trim().length > 0)
      .map((p) => p.replace(/\s+/g, ' ').trim()); // Normalize whitespace

    const chunks: string[] = [];
    let currentChunk = '';

    for (const paragraph of paragraphs) {
      const potentialChunk = currentChunk
        ? `${currentChunk}\n\n${paragraph}`
        : paragraph;

      if (potentialChunk.length <= maxLength) {
        currentChunk = potentialChunk;
      } else {
        if (currentChunk) {
          chunks.push(currentChunk);
        }

        // If single paragraph is too long, split by sentences
        if (paragraph.length > maxLength) {
          const sentenceChunks = this.splitBySentence(paragraph, maxLength);
          chunks.push(...sentenceChunks);
          currentChunk = '';
        } else {
          currentChunk = paragraph;
        }
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk);
    }

    return chunks.filter((chunk) => chunk.trim().length > 0);
  }

  private splitBySemantic(content: string, maxLength: number): string[] {
    // Simplified semantic splitting - in real implementation, this would use NLP
    return this.splitByParagraph(content, maxLength);
  }

  private splitByHybrid(content: string, maxLength: number): string[] {
    // Enhanced hybrid approach: try paragraphs first, then sentences, then careful word splitting
    let chunks = this.splitByParagraph(content, maxLength);

    // If paragraphs are still too long, split by sentences
    const refinedChunks: string[] = [];
    for (const chunk of chunks) {
      if (chunk.length <= maxLength) {
        refinedChunks.push(chunk);
      } else {
        const sentenceChunks = this.splitBySentence(chunk, maxLength);
        refinedChunks.push(...sentenceChunks);
      }
    }

    return refinedChunks.filter((chunk) => chunk.trim().length > 0);
  }

  /**
   * Split a long sentence carefully to avoid breaking mid-word
   */
  private splitLongSentence(sentence: string, maxLength: number): string[] {
    const words = sentence.split(/\s+/);
    const chunks: string[] = [];
    let currentChunk = '';

    for (const word of words) {
      const potentialChunk = currentChunk ? `${currentChunk} ${word}` : word;

      if (potentialChunk.length <= maxLength) {
        currentChunk = potentialChunk;
      } else {
        if (currentChunk) {
          chunks.push(currentChunk);
        }
        currentChunk = word;
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk);
    }

    return chunks;
  }

  private extractKeywords(content: string): string[] {
    try {
      // Use natural library for keyword extraction (similar to RAGFlow's approach)
      const tokenizer = new natural.WordTokenizer();
      const tokens = tokenizer.tokenize(content.toLowerCase()) || [];

      // Remove stop words and short words
      const stopWords = new Set([
        'the',
        'a',
        'an',
        'and',
        'or',
        'but',
        'in',
        'on',
        'at',
        'to',
        'for',
        'of',
        'with',
        'by',
        'is',
        'are',
        'was',
        'were',
        'be',
        'been',
        'being',
        'have',
        'has',
        'had',
        'do',
        'does',
        'did',
        'will',
        'would',
        'could',
        'should',
        'may',
        'might',
        'must',
        'can',
        'this',
        'that',
        'these',
        'those',
      ]);

      const keywords = tokens
        .filter(
          (token) =>
            token.length > 2 &&
            token.length < 20 &&
            !stopWords.has(token) &&
            /^[a-zA-Z]+$/.test(token),
        )
        .reduce((acc: { [key: string]: number }, token) => {
          acc[token] = (acc[token] || 0) + 1;
          return acc;
        }, {});

      // Return top keywords by frequency
      return Object.entries(keywords)
        .sort(([, a], [, b]) => (b as number) - (a as number))
        .slice(0, 8)
        .map(([word]) => word);
    } catch (error) {
      this.logger.warn(`Keyword extraction failed: ${error.message}`);
      return [];
    }
  }

  private calculateConfidence(
    content: string,
    type: ParsedSegment['type'],
  ): number {
    // Simple confidence calculation based on content characteristics
    let confidence = 0.5;

    // Length-based confidence
    if (content.length >= 50 && content.length <= 2000) {
      confidence += 0.2;
    }

    // Type-specific confidence adjustments
    switch (type) {
      case 'title':
        if (content.length < 100 && /^[A-Z]/.test(content)) confidence += 0.2;
        break;
      case 'paragraph':
        if (content.split('.').length > 2) confidence += 0.2;
        break;
      case 'list':
        if (/^(\d+\.|[•\-\*])/.test(content)) confidence += 0.3;
        break;
    }

    return Math.min(confidence, 1.0);
  }

  private createTableFromRows(
    rows: string[],
    id: number,
    pageNumber: number,
  ): TableStructure | null {
    if (rows.length < 2) return null;

    // Parse table structure
    const tableData: string[][] = [];
    let maxColumns = 0;

    for (const row of rows) {
      const cells = row
        .split(/\t|[|]|\s{2,}/)
        .map((cell) => cell.trim())
        .filter((cell) => cell);
      if (cells.length > 0) {
        tableData.push(cells);
        maxColumns = Math.max(maxColumns, cells.length);
      }
    }

    if (tableData.length === 0 || maxColumns === 0) return null;

    // Normalize table - ensure all rows have same number of columns
    const normalizedData = tableData.map((row) => {
      const normalizedRow = [...row];
      while (normalizedRow.length < maxColumns) {
        normalizedRow.push('');
      }
      return normalizedRow.slice(0, maxColumns);
    });

    // Generate HTML representation
    const htmlContent = this.generateTableHtml(normalizedData);

    return {
      id: `table_${id}`,
      pageNumber,
      boundingBox: { x0: 0, y0: 0, x1: 100, y1: 100, width: 100, height: 100 },
      rows: normalizedData.length,
      columns: maxColumns,
      content: normalizedData,
      htmlContent,
      confidence: 0.8,
    };
  }

  private generateTableHtml(data: string[][]): string {
    if (data.length === 0) return '';

    let html = '<table border="1">\n';

    // First row as header
    if (data.length > 0) {
      html += '  <thead>\n    <tr>\n';
      for (const cell of data[0]) {
        html += `      <th>${this.escapeHtml(cell)}</th>\n`;
      }
      html += '    </tr>\n  </thead>\n';
    }

    // Remaining rows as body
    if (data.length > 1) {
      html += '  <tbody>\n';
      for (let i = 1; i < data.length; i++) {
        html += '    <tr>\n';
        for (const cell of data[i]) {
          html += `      <td>${this.escapeHtml(cell)}</td>\n`;
        }
        html += '    </tr>\n';
      }
      html += '  </tbody>\n';
    }

    html += '</table>';
    return html;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private applySegmentOverlap(
    segments: ParsedSegment[],
    options: Required<RagflowParseOptions>,
  ): ParsedSegment[] {
    if (options.overlapRatio <= 0 || segments.length <= 1) {
      return segments;
    }

    // Apply overlap between consecutive segments
    for (let i = 0; i < segments.length - 1; i++) {
      const currentSegment = segments[i];
      const nextSegment = segments[i + 1];

      const overlapLength = Math.floor(
        currentSegment.content.length * options.overlapRatio,
      );
      if (overlapLength > 0) {
        const overlapText = currentSegment.content.slice(-overlapLength);
        nextSegment.content = overlapText + ' ' + nextSegment.content;
        nextSegment.wordCount = nextSegment.content.split(/\s+/).length;
        nextSegment.tokenCount = Math.ceil(nextSegment.wordCount * 0.75);
      }
    }

    return segments;
  }

  private createMetadata(
    pdfData: any,
    fileSize: number,
    processingTime: number,
    extractionMethod: string,
    segments: ParsedSegment[],
  ): DocumentMetadata {
    const totalWords = segments.reduce(
      (sum, segment) => sum + segment.wordCount,
      0,
    );
    const totalTokens = segments.reduce(
      (sum, segment) => sum + segment.tokenCount,
      0,
    );

    return {
      title: pdfData.info?.Title || undefined,
      author: pdfData.info?.Author || undefined,
      creator: pdfData.info?.Creator || undefined,
      creationDate: pdfData.info?.CreationDate || undefined,
      modificationDate: pdfData.info?.ModDate || undefined,
      totalPages: pdfData.numpages || 1,
      totalWords,
      totalTokens,
      language: 'en', // Would be detected in real implementation
      fileSize,
      processingTime,
      extractionMethod:
        extractionMethod as DocumentMetadata['extractionMethod'],
    };
  }

  private createEmptyMetadata(
    fileSize: number,
    processingTime: number,
  ): DocumentMetadata {
    return {
      totalPages: 0,
      totalWords: 0,
      totalTokens: 0,
      fileSize,
      processingTime,
      extractionMethod: 'naive',
    };
  }

  /**
   * Parse PDF with embedding-optimized configuration
   * This method aligns chunking strategy with your RAG embedding requirements
   */
  async parsePdfWithEmbeddingConfig(
    filePath: string,
    embeddingConfig: EmbeddingOptimizedConfig,
    additionalOptions?: Partial<RagflowParseOptions>,
  ): Promise<RagflowParseResult> {
    this.logger.log(
      `🤖 Starting RAGFlow PDF parsing optimized for embedding model: ${embeddingConfig.model}`,
    );

    // Create embedding-optimized options
    const options: RagflowParseOptions = {
      ...this.defaultOptions,
      ...additionalOptions,
      // Override with embedding-optimized settings
      maxSegmentLength: embeddingConfig.chunkSize,
      minSegmentLength: Math.max(
        50,
        Math.floor(embeddingConfig.chunkSize * 0.1),
      ),
      overlapRatio: embeddingConfig.chunkOverlap / embeddingConfig.chunkSize,
      segmentationStrategy: this.mapTextSplitterToSegmentationStrategy(
        embeddingConfig.textSplitter,
      ),
      confidenceThreshold:
        embeddingConfig.confidenceThreshold ||
        this.defaultOptions.confidenceThreshold,
      enableTableExtraction:
        embeddingConfig.enableTableExtraction ??
        this.defaultOptions.enableTableExtraction,
      enableImageExtraction:
        embeddingConfig.enableImageExtraction ??
        this.defaultOptions.enableImageExtraction,
      embeddingConfig,
    };

    this.logger.log(`📊 Embedding-optimized chunking config:
       - Model: ${embeddingConfig.model}${embeddingConfig.customModelName ? ` (${embeddingConfig.customModelName})` : ''}
       - Text Splitter: ${embeddingConfig.textSplitter}
       - Chunk Size: ${embeddingConfig.chunkSize} chars
       - Chunk Overlap: ${embeddingConfig.chunkOverlap} chars (${((options.overlapRatio || 0) * 100).toFixed(1)}%)
       - Segmentation Strategy: ${options.segmentationStrategy}
       - Min/Max Segment Length: ${options.minSegmentLength}/${options.maxSegmentLength} chars`);

    return this.parsePdf(filePath, options);
  }

  /**
   * Map your TextSplitter enum to RAGFlow segmentation strategies
   */
  private mapTextSplitterToSegmentationStrategy(
    textSplitter: TextSplitter,
  ): Required<RagflowParseOptions>['segmentationStrategy'] {
    switch (textSplitter) {
      case TextSplitter.RECURSIVE_CHARACTER:
        return 'hybrid'; // Best for general content
      case TextSplitter.CHARACTER:
        return 'paragraph'; // Simple paragraph-based splitting
      case TextSplitter.TOKEN:
        return 'semantic'; // Token-aware semantic splitting
      case TextSplitter.MARKDOWN:
        return 'hybrid'; // Hybrid works well with structured content
      case TextSplitter.PYTHON_CODE:
        return 'semantic'; // Semantic for code structure
      default:
        return 'hybrid';
    }
  }

  /**
   * Enhanced segmentation that integrates with your embedding configuration
   * This method implements your TextSplitter strategies within RAGFlow architecture
   */
  private async performEmbeddingOptimizedSegmentation(
    content: string,
    embeddingConfig: EmbeddingOptimizedConfig,
    baseOptions: RagflowParseOptions,
  ): Promise<ParsedSegment[]> {
    this.logger.debug(
      `🎯 Performing embedding-optimized segmentation with ${embeddingConfig.textSplitter}`,
    );

    // 🆕 Preprocess Chinese text if detected
    let processedContent = content;
    if (this.chineseTextPreprocessorService.isChineseText(content)) {
      this.logger.debug(
        'Applying Chinese text preprocessing for embedding optimization...',
      );
      processedContent =
        this.chineseTextPreprocessorService.preprocessChineseText(content);
    }

    const segments: ParsedSegment[] = [];
    let chunks: string[] = [];

    // Apply your TextSplitter strategy
    switch (embeddingConfig.textSplitter) {
      case TextSplitter.RECURSIVE_CHARACTER:
        // 🆕 Use Chinese-aware splitting if applicable
        if (
          this.chineseTextPreprocessorService.isChineseText(processedContent)
        ) {
          chunks = this.chineseTextPreprocessorService.splitChineseText(
            processedContent,
            embeddingConfig.chunkSize,
            embeddingConfig.chunkOverlap,
          );
        } else {
          chunks = this.recursiveCharacterSplit(
            processedContent,
            embeddingConfig.chunkSize,
            embeddingConfig.chunkOverlap,
            embeddingConfig.separators,
          );
        }
        break;
      case TextSplitter.CHARACTER:
        chunks = this.characterSplit(
          processedContent,
          embeddingConfig.chunkSize,
          embeddingConfig.chunkOverlap,
        );
        break;
      case TextSplitter.TOKEN:
        chunks = this.tokenSplit(
          processedContent,
          embeddingConfig.chunkSize,
          embeddingConfig.chunkOverlap,
        );
        break;
      case TextSplitter.MARKDOWN:
        chunks = this.markdownSplit(
          processedContent,
          embeddingConfig.chunkSize,
          embeddingConfig.chunkOverlap,
        );
        break;
      case TextSplitter.PYTHON_CODE:
        chunks = this.pythonCodeSplit(
          processedContent,
          embeddingConfig.chunkSize,
          embeddingConfig.chunkOverlap,
        );
        break;
      default:
        chunks = this.recursiveCharacterSplit(
          processedContent,
          embeddingConfig.chunkSize,
          embeddingConfig.chunkOverlap,
        );
    }

    this.logger.debug(
      `✂️ Text splitting produced ${chunks.length} chunks using ${embeddingConfig.textSplitter}`,
    );

    // Create segments from chunks with RAGFlow enhancements
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i].trim();

      if (chunk.length >= (baseOptions.minSegmentLength || 50)) {
        const type = this.determineContentType(chunk);
        const keywords = this.extractKeywords(chunk);
        const confidence = this.calculateConfidence(chunk, type);

        // Only include segments above confidence threshold
        if (confidence >= (embeddingConfig.confidenceThreshold || 0.7)) {
          const segment: ParsedSegment = {
            id: uuidv4(),
            content: chunk,
            type,
            position: i,
            pageNumber: 1, // Would be dynamic in real implementation
            confidence,
            keywords,
            wordCount: chunk.split(/\s+/).length,
            tokenCount: Math.ceil(chunk.length / 4), // Rough estimation
          };

          segments.push(segment);
        }
      }
    }

    this.logger.debug(
      `🎯 Created ${segments.length} embedding-optimized segments`,
    );
    return segments;
  }

  /**
   * Recursive character text splitter - matches your dataset service implementation
   */
  private recursiveCharacterSplit(
    text: string,
    chunkSize: number,
    chunkOverlap: number,
    separators?: string[],
  ): string[] {
    const defaultSeparators = separators || ['\n\n', '\n', ' ', ''];
    return this.splitTextRecursively(
      text,
      chunkSize,
      chunkOverlap,
      defaultSeparators,
    );
  }

  /**
   * Character-based text splitter
   */
  private characterSplit(
    text: string,
    chunkSize: number,
    chunkOverlap: number,
  ): string[] {
    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      const chunk = text.slice(start, end);
      chunks.push(chunk);

      start = end - chunkOverlap;
      if (start >= text.length) break;
    }

    return chunks.filter((chunk) => chunk.trim().length > 0);
  }

  /**
   * Token-aware text splitter
   */
  private tokenSplit(
    text: string,
    chunkSize: number,
    chunkOverlap: number,
  ): string[] {
    // Rough token estimation: 1 token ≈ 4 characters
    const charChunkSize = chunkSize * 4;
    const charOverlap = chunkOverlap * 4;

    return this.characterSplit(text, charChunkSize, charOverlap);
  }

  /**
   * Markdown-aware text splitter
   */
  private markdownSplit(
    text: string,
    chunkSize: number,
    chunkOverlap: number,
  ): string[] {
    const markdownSeparators = [
      '\n# ',
      '\n## ',
      '\n### ',
      '\n#### ',
      '\n##### ',
      '\n###### ', // Headers
      '\n\n',
      '\n', // Paragraphs and lines
      '. ',
      ' ',
      '', // Sentences, words, characters
    ];

    return this.splitTextRecursively(
      text,
      chunkSize,
      chunkOverlap,
      markdownSeparators,
    );
  }

  /**
   * Python code-aware text splitter
   */
  private pythonCodeSplit(
    text: string,
    chunkSize: number,
    chunkOverlap: number,
  ): string[] {
    const pythonSeparators = [
      '\nclass ',
      '\ndef ',
      '\n\ndef ',
      '\n\nclass ', // Python structures
      '\n\n',
      '\n', // Comments and docstrings
      '. ',
      ' ',
      '', // Fallback
    ];

    return this.splitTextRecursively(
      text,
      chunkSize,
      chunkOverlap,
      pythonSeparators,
    );
  }

  /**
   * Core recursive splitting logic
   */
  private splitTextRecursively(
    text: string,
    chunkSize: number,
    chunkOverlap: number,
    separators: string[],
  ): string[] {
    const chunks: string[] = [];

    if (text.length <= chunkSize) {
      return [text];
    }

    for (const separator of separators) {
      if (separator === '') {
        // Character-level splitting as last resort
        return this.characterSplit(text, chunkSize, chunkOverlap);
      }

      const splits = text.split(separator);
      if (splits.length > 1) {
        let currentChunk = '';

        for (const split of splits) {
          const potentialChunk =
            currentChunk + (currentChunk ? separator : '') + split;

          if (potentialChunk.length <= chunkSize) {
            currentChunk = potentialChunk;
          } else {
            if (currentChunk) {
              chunks.push(currentChunk);
              // Handle overlap
              const overlapStart = Math.max(
                0,
                currentChunk.length - chunkOverlap,
              );
              currentChunk =
                currentChunk.slice(overlapStart) + separator + split;
            } else {
              // Split is too large, need to split further
              const subChunks = this.splitTextRecursively(
                split,
                chunkSize,
                chunkOverlap,
                separators.slice(1),
              );
              chunks.push(...subChunks);
            }
          }
        }

        if (currentChunk) {
          chunks.push(currentChunk);
        }

        return chunks.filter((chunk) => chunk.trim().length > 0);
      }
    }

    return [text];
  }

  /**
   * 🆕 Parent-Child Chunking Implementation (多粒度分块)
   * Creates hierarchical segments with parent (paragraph) and child (sentence) levels
   */
  async parsePdfWithParentChildChunking(
    filePath: string,
    parentChunkConfig: EmbeddingOptimizedConfig,
    childChunkConfig: EmbeddingOptimizedConfig,
    additionalOptions?: Partial<RagflowParseOptions>,
  ): Promise<RagflowParseResult> {
    this.logger.log(`🔗 Starting Parent-Child Chunking for PDF: ${filePath}`);

    // Parse PDF with parent-level configuration
    const parentResult = await this.parsePdfWithEmbeddingConfig(
      filePath,
      parentChunkConfig,
      additionalOptions,
    );

    // Create hierarchical segments
    const hierarchicalSegments = await this.createParentChildHierarchy(
      parentResult.segments,
      childChunkConfig,
    );

    return {
      ...parentResult,
      segments: hierarchicalSegments,
      processingMetadata: {
        ...parentResult.processingMetadata,
        hierarchicalChunking: {
          parentChunks: hierarchicalSegments.filter(
            (s) => s.segmentType === 'parent',
          ).length,
          childChunks: hierarchicalSegments.filter(
            (s) => s.segmentType === 'child',
          ).length,
          totalHierarchicalSegments: hierarchicalSegments.length,
        },
      },
    };
  }

  /**
   * Create parent-child hierarchy from parent segments
   */
  private async createParentChildHierarchy(
    parentSegments: ParsedSegment[],
    childChunkConfig: EmbeddingOptimizedConfig,
  ): Promise<ParsedSegment[]> {
    const hierarchicalSegments: ParsedSegment[] = [];

    for (
      let parentIndex = 0;
      parentIndex < parentSegments.length;
      parentIndex++
    ) {
      const parentSegment = parentSegments[parentIndex];

      // Mark as parent segment
      const enhancedParent: ParsedSegment = {
        ...parentSegment,
        id: uuidv4(),
        segmentType: 'parent',
        hierarchyLevel: 1,
        childOrder: undefined,
        childCount: 0,
        hierarchyMetadata: {
          isParent: true,
          originalLength: parentSegment.content.length,
        },
      };

      // Create child segments from parent content
      const childChunks = this.createChildChunks(
        parentSegment.content,
        childChunkConfig,
      );

      const childSegments: ParsedSegment[] = [];
      for (let childIndex = 0; childIndex < childChunks.length; childIndex++) {
        const childContent = childChunks[childIndex];

        const childSegment: ParsedSegment = {
          id: uuidv4(),
          content: childContent,
          type: this.determineContentType(childContent),
          position: parentSegment.position,
          pageNumber: parentSegment.pageNumber,
          confidence: this.calculateConfidence(childContent, 'paragraph'),
          keywords: this.extractKeywords(childContent),
          wordCount: childContent.split(/\s+/).length,
          tokenCount: Math.ceil(childContent.length / 4),
          // 🆕 Child-specific properties
          parentId: enhancedParent.id,
          segmentType: 'child',
          hierarchyLevel: 2,
          childOrder: childIndex + 1,
          childCount: 0,
          hierarchyMetadata: {
            isChild: true,
            parentId: enhancedParent.id,
            siblingCount: childChunks.length,
          },
        };

        childSegments.push(childSegment);
      }

      // Update parent with child count
      enhancedParent.childCount = childSegments.length;
      enhancedParent.hierarchyMetadata = {
        ...enhancedParent.hierarchyMetadata,
        childCount: childSegments.length,
      };

      // Add parent and children to results
      hierarchicalSegments.push(enhancedParent);
      hierarchicalSegments.push(...childSegments);
    }

    this.logger.log(
      `🔗 Created hierarchical structure: ${hierarchicalSegments.filter((s) => s.segmentType === 'parent').length} parents, ${hierarchicalSegments.filter((s) => s.segmentType === 'child').length} children`,
    );

    return hierarchicalSegments;
  }

  /**
   * Create child chunks from parent content using fine-grained strategy
   */
  private createChildChunks(
    parentContent: string,
    childConfig: EmbeddingOptimizedConfig,
  ): string[] {
    // Use sentence-level splitting for child chunks
    switch (childConfig.textSplitter) {
      case TextSplitter.RECURSIVE_CHARACTER:
        return this.splitBySentence(parentContent, childConfig.chunkSize);
      case TextSplitter.CHARACTER:
        return this.characterSplit(
          parentContent,
          childConfig.chunkSize,
          childConfig.chunkOverlap,
        );
      case TextSplitter.TOKEN:
        return this.tokenSplit(
          parentContent,
          childConfig.chunkSize,
          childConfig.chunkOverlap,
        );
      default:
        // Default to sentence-level splitting for children
        return this.splitBySentence(parentContent, childConfig.chunkSize);
    }
  }

  /**
   * 🆕 Multi-Granularity Retrieval Support
   * Retrieve child segments and merge with parent context
   */
  async retrieveWithParentChildContext(
    query: string,
    childMatches: ParsedSegment[],
    includeParentContext: boolean = true,
  ): Promise<{
    segments: ParsedSegment[];
    parentContext: ParsedSegment[];
    retrievalMetadata: {
      childMatches: number;
      parentContextAdded: number;
      totalSegments: number;
    };
  }> {
    const parentContext: ParsedSegment[] = [];

    if (includeParentContext) {
      // Find parent segments for each child match
      const parentIds = [
        ...new Set(childMatches.map((child) => child.parentId).filter(Boolean)),
      ] as string[];

      // In a real implementation, you would query the database for parent segments
      // For now, we'll simulate this
      for (const parentId of parentIds) {
        // This would be a database query in real implementation
        const parentSegment = await this.findParentSegmentById(parentId);
        if (parentSegment) {
          parentContext.push(parentSegment);
        }
      }
    }

    return {
      segments: childMatches,
      parentContext,
      retrievalMetadata: {
        childMatches: childMatches.length,
        parentContextAdded: parentContext.length,
        totalSegments: childMatches.length + parentContext.length,
      },
    };
  }

  /**
   * Simulate finding parent segment by ID (would be database query in real implementation)
   */
  private async findParentSegmentById(
    parentId: string,
  ): Promise<ParsedSegment | null> {
    // In real implementation, this would query the database
    // For now, return null as placeholder
    return null;
  }

  /**
   * Clean general text content (applies to all documents)
   * Removes excessive empty lines, fixes spacing issues, etc.
   */
  private cleanGeneralText(text: string): string {
    this.logger.log(
      `🧹 [RAGFlow DEBUG] cleanGeneralText called with ${text.length} characters`,
    );
    this.logger.log(
      `🧹 [RAGFlow DEBUG] Input text preview: "${text.substring(0, 200)}..."`,
    );

    if (!text || text.trim().length === 0) {
      this.logger.log(
        `🧹 [RAGFlow DEBUG] Empty or whitespace-only text, returning empty string`,
      );
      return '';
    }

    let cleaned = text;

    // Count empty lines before cleaning
    const emptyLinesBefore = (text.match(/^\s*$/gm) || []).length;
    this.logger.log(
      `🧹 [RAGFlow DEBUG] Empty lines before cleaning: ${emptyLinesBefore}`,
    );

    // 1. Remove the specific pattern of empty lines with just spaces and newlines
    // This targets the exact pattern: " \n \n \n \n  \n \n   \n  \n \n     \n"
    cleaned = cleaned.replace(/^[ \t]*\n(?:[ \t]*\n)+/gm, '\n');
    this.logger.log(
      `🧹 [RAGFlow DEBUG] After step 1 (remove empty line patterns): ${cleaned.length} chars`,
    );

    // 2. Remove lines that contain only whitespace characters
    cleaned = cleaned.replace(/^[ \t\r\f\v]*$/gm, '');
    this.logger.log(
      `🧹 [RAGFlow DEBUG] After step 2 (remove whitespace-only lines): ${cleaned.length} chars`,
    );

    // 3. Remove excessive consecutive newlines (more than 2)
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    this.logger.log(
      `🧹 [RAGFlow DEBUG] After step 3 (limit consecutive newlines): ${cleaned.length} chars`,
    );

    // 4. Remove excessive spaces at the beginning of lines
    cleaned = cleaned.replace(/^[ \t]+/gm, '');
    this.logger.log(
      `🧹 [RAGFlow DEBUG] After step 4 (remove leading spaces): ${cleaned.length} chars`,
    );

    // 5. Remove excessive spaces at the end of lines
    cleaned = cleaned.replace(/[ \t]+$/gm, '');
    this.logger.log(
      `🧹 [RAGFlow DEBUG] After step 5 (remove trailing spaces): ${cleaned.length} chars`,
    );

    // 6. Replace multiple consecutive spaces with single space
    cleaned = cleaned.replace(/[ \t]{2,}/g, ' ');
    this.logger.log(
      `🧹 [RAGFlow DEBUG] After step 6 (normalize spaces): ${cleaned.length} chars`,
    );

    // 7. Remove empty lines at the beginning of the text
    cleaned = cleaned.replace(/^[\s\n]*/, '');
    this.logger.log(
      `🧹 [RAGFlow DEBUG] After step 7 (remove leading empty lines): ${cleaned.length} chars`,
    );

    // 8. Remove empty lines at the end of the text
    cleaned = cleaned.replace(/[\s\n]*$/, '');
    this.logger.log(
      `🧹 [RAGFlow DEBUG] After step 8 (remove trailing empty lines): ${cleaned.length} chars`,
    );

    // 9. Normalize line breaks (ensure consistent \n)
    cleaned = cleaned.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    this.logger.log(
      `🧹 [RAGFlow DEBUG] After step 9 (normalize line breaks): ${cleaned.length} chars`,
    );

    // 10. Final cleanup: remove any remaining lines with only spaces
    const lines = cleaned.split('\n');
    const filteredLines = lines.filter((line) => line.trim().length > 0);
    cleaned = filteredLines.join('\n');
    this.logger.log(
      `🧹 [RAGFlow DEBUG] After step 10 (filter empty lines): ${lines.length} → ${filteredLines.length} lines`,
    );

    const result = cleaned.trim();

    // Count empty lines after cleaning
    const emptyLinesAfter = (result.match(/^\s*$/gm) || []).length;
    this.logger.log(
      `🧹 [RAGFlow DEBUG] Empty lines after cleaning: ${emptyLinesAfter}`,
    );
    this.logger.log(
      `🧹 [RAGFlow DEBUG] Final cleaned text preview: "${result.substring(0, 200)}..."`,
    );
    this.logger.log(
      `🧹 [RAGFlow DEBUG] cleanGeneralText returning ${result.length} characters`,
    );

    return result;
  }
}
