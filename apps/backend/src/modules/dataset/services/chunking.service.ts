import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Document } from '../entities/document.entity';
import { DocumentSegment } from '../entities/document-segment.entity';
import { promises as fs } from 'fs';
import { join } from 'path';
import {
  RagflowPdfParserService,
  RagflowParseOptions,
} from '../../document-parser/services/ragflow-pdf-parser.service';
import { SimplePdfParserService } from '../../document-parser/services/simple-pdf-parser.service';
import { ChineseTextPreprocessorService } from '../../document-parser/services/chinese-text-preprocessor.service';
import { DetectorService } from '../../../common/services/detector.service';
import { CsvParserService } from '../../csv-connector/services/csv-parser.service';
import { CsvConnectorTemplateService } from '../../csv-connector/services/csv-connector-template.service';
import {
  EmbeddingModel,
  getEffectiveChunkSize,
  getEffectiveChunkOverlap,
  getModelDefaults,
} from '../dto/create-dataset-step.dto';

export interface ChunkingConfig {
  model: string;
  customModelName?: string;
  provider: string;
  textSplitter: string;
  chunkSize: number;
  chunkOverlap: number;
  separators?: string[];
  enableParentChildChunking?: boolean;
  useModelDefaults?: boolean;
}

@Injectable()
export class ChunkingService {
  private readonly logger = new Logger(ChunkingService.name);

  constructor(
    @InjectRepository(Document)
    private readonly documentRepository: Repository<Document>,
    @InjectRepository(DocumentSegment)
    private readonly segmentRepository: Repository<DocumentSegment>,
    private readonly ragflowPdfParserService: RagflowPdfParserService,
    private readonly simplePdfParserService: SimplePdfParserService,
    private readonly chineseTextPreprocessorService: ChineseTextPreprocessorService,
    private readonly detectorService: DetectorService,
    private readonly csvParserService: CsvParserService,
    private readonly csvTemplateService: CsvConnectorTemplateService,
  ) {}

  async createSegments(
    document: Document,
    datasetId: string,
    config: ChunkingConfig,
    userId: string,
  ): Promise<DocumentSegment[]> {
    this.logger.log(`[CHUNKING] Creating segments for document ${document.id}`);

    // Handle CSV files differently
    if (document.docType === 'csv') {
      this.logger.log(
        `[CHUNKING] Processing CSV file for document ${document.id}`,
      );
      return this.processCsvDocument(document, datasetId, userId);
    }

    // Extract text from file for non-CSV documents
    const content = await this.extractTextFromFile(document);

    // Choose chunking strategy based on configuration
    if (config.enableParentChildChunking) {
      this.logger.log(
        `[CHUNKING] Using Parent-Child Chunking for document ${document.id}`,
      );
      return this.processWithParentChildChunking(
        document,
        datasetId,
        config,
        userId,
        content,
      );
    } else {
      this.logger.log(
        `[CHUNKING] Using traditional chunking for document ${document.id}`,
      );
      return this.processWithTraditionalChunking(
        document,
        datasetId,
        content,
        config,
        userId,
      );
    }
  }

  private async extractTextFromFile(document: Document): Promise<string> {
    const filePath = join(
      process.cwd(),
      'uploads',
      'documents',
      document.fileId,
    );

    let content = '';

    try {
      if (document.docType === 'pdf') {
        // Try RAGFlow parser first for better PDF handling
        try {
          const parseResult =
            await this.ragflowPdfParserService.parsePdf(filePath);
          content = parseResult.segments.map((s) => s.content).join('\n\n');
        } catch (ragflowError) {
          this.logger.warn(
            `[CHUNKING] RAGFlow PDF parsing failed, falling back to simple parser: ${ragflowError.message}`,
          );
          const simpleResult =
            await this.simplePdfParserService.extractTextFromPdf(filePath);
          content = simpleResult.content;
        }
      } else {
        // Handle other file types with comprehensive detection
        const detection = await this.detectorService.detectFile(filePath);
        content = detection.encoding.convertedText || '';

        if (!detection.isValid) {
          this.logger.warn(
            `[CHUNKING] File detection issues for ${filePath}:`,
            detection.errors,
          );
        }
      }

      // Apply text preprocessing to ALL documents
      const originalLength = content.length;

      // Check if it's Chinese text for specialized processing
      const isChinese =
        this.chineseTextPreprocessorService.isChineseText(content);

      if (isChinese) {
        content =
          this.chineseTextPreprocessorService.preprocessChineseText(content);
      } else {
        content = this.cleanGeneralText(content);
      }

      this.logger.log(
        `[CHUNKING] Text preprocessing complete: ${originalLength} → ${content.length} characters`,
      );

      return content;
    } catch (error) {
      this.logger.error(
        `[CHUNKING] Failed to extract text from ${filePath}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Process CSV document by creating one segment per row
   */
  private async processCsvDocument(
    document: Document,
    datasetId: string,
    userId: string,
  ): Promise<DocumentSegment[]> {
    const filePath = join(
      process.cwd(),
      'uploads',
      'documents',
      document.fileId,
    );

    try {
      // Get CSV configuration from document metadata
      const csvConfig = (document.docMetadata as any)?.csvConfig;
      if (!csvConfig) {
        throw new Error('CSV configuration not found in document metadata');
      }

      this.logger.log(
        `[CHUNKING] Processing CSV with connector: ${csvConfig.connectorType}`,
      );

      // Parse CSV file
      const parseResult = await this.csvParserService.parseCsvFile(filePath);
      if (!parseResult.success) {
        throw new Error(
          `CSV parsing failed: ${parseResult.errors?.join(', ')}`,
        );
      }

      // Generate segment data from CSV rows
      const segmentData = this.csvParserService.generateSegmentData(
        parseResult.rows,
        csvConfig,
      );

      // Create document segments
      const segments: DocumentSegment[] = [];
      for (const data of segmentData) {
        const segment = this.segmentRepository.create({
          datasetId,
          documentId: document.id,
          position: data.position,
          content: data.content,
          wordCount: this.countWords(data.content),
          tokens: this.estimateTokens(data.content),
          segmentType: 'csv_row',
          hierarchyLevel: 1,
          childCount: 0,
          hierarchyMetadata: {
            csvRow: data.csvRow,
            connectorType: csvConfig.connectorType,
            fieldMappings: csvConfig.fieldMappings,
          },
          status: 'waiting',
          enabled: true,
          userId,
        });

        segments.push(segment);
      }

      // Save all segments
      const savedSegments = await this.segmentRepository.save(segments);

      this.logger.log(
        `[CHUNKING] Created ${savedSegments.length} CSV segments for document ${document.id}`,
      );

      return savedSegments;
    } catch (error) {
      this.logger.error(
        `[CHUNKING] Failed to process CSV document ${document.id}:`,
        error,
      );
      throw error;
    }
  }

  private async processWithParentChildChunking(
    document: Document,
    datasetId: string,
    config: ChunkingConfig,
    userId: string,
    content: string,
  ): Promise<DocumentSegment[]> {
    let parentRagflowSegments: any[] = [];
    let childRagflowSegments: any[] = [];

    if (document.docType === 'pdf') {
      // Parse PDF with optimized configuration for embeddings
      const parseOptions: RagflowParseOptions = {
        maxSegmentLength: config.chunkSize,
        minSegmentLength: Math.floor(config.chunkSize * 0.1),
        overlapRatio: config.chunkOverlap / config.chunkSize,
        confidenceThreshold: 0.7,
        enableTableExtraction: true,
      };

      const filePath = join(
        process.cwd(),
        'uploads',
        'documents',
        document.fileId,
      );

      const ragflowResult = await this.ragflowPdfParserService.parsePdf(
        filePath,
        parseOptions,
      );

      // Separate parent and child segments
      parentRagflowSegments = ragflowResult.segments.filter((s) => !s.parentId);
      childRagflowSegments = ragflowResult.segments.filter((s) => s.parentId);
    } else {
      // For non-PDF documents, create parent-child chunks from text content
      // Create parent chunks (larger) - but still respect size constraints
      const parentChunkSize = Math.min(config.chunkSize * 2, 1200); // Cap at 1200 chars
      const parentChunkOverlap = Math.min(config.chunkOverlap * 2, 120); // Cap at 120 chars
      const parentChunks = this.splitText(content, {
        ...config,
        chunkSize: parentChunkSize,
        chunkOverlap: parentChunkOverlap,
      });

      // Create child chunks (original size)
      const childChunks = this.splitText(content, config);

      // Convert to ragflow-like segments
      parentRagflowSegments = parentChunks.map((chunk, index) => ({
        id: `parent_${index}`,
        content: chunk,
        wordCount: chunk.split(/\s+/).length,
        tokenCount: Math.ceil(chunk.length / 4),
        parentId: null,
        segmentType: 'parent',
        hierarchyLevel: 1,
        childOrder: index,
        childCount: 0,
        hierarchyMetadata: {},
      }));

      childRagflowSegments = childChunks.map((chunk, index) => ({
        id: `child_${index}`,
        content: chunk,
        wordCount: chunk.split(/\s+/).length,
        tokenCount: Math.ceil(chunk.length / 4),
        parentId: `parent_${Math.floor(index / 2)}`, // Link to parent chunks
        segmentType: 'child',
        hierarchyLevel: 2,
        childOrder: index,
        childCount: 0,
        hierarchyMetadata: {},
      }));
    }

    this.logger.log(
      `[CHUNKING] Found ${parentRagflowSegments.length} parent segments and ${childRagflowSegments.length} child segments`,
    );

    const segments: DocumentSegment[] = [];
    const parentIdMapping = new Map<string, string>(); // Map ragflow parent ID to database parent ID

    // 1. First, save all parent segments
    for (let i = 0; i < parentRagflowSegments.length; i++) {
      const ragflowSegment = parentRagflowSegments[i];

      this.logger.log(
        `[CHUNKING] Processing parent segment ${i + 1}: "${ragflowSegment.content.substring(0, 100)}..."`,
      );

      const segment = this.segmentRepository.create({
        documentId: document.id,
        datasetId: datasetId,
        position: i + 1,
        content: ragflowSegment.content,
        wordCount: ragflowSegment.wordCount,
        tokens: ragflowSegment.tokenCount,
        keywords: {
          extracted: [],
          count: 0,
          extractedAt: new Date().toISOString(),
        },
        status: 'chunked',
        enabled: true,
        userId: userId,
        // Parent segments don't have parentId
        parentId: undefined,
        segmentType: ragflowSegment.segmentType || 'parent',
        hierarchyLevel: ragflowSegment.hierarchyLevel || 1,
        childOrder: ragflowSegment.childOrder,
        childCount: ragflowSegment.childCount || 0,
        hierarchyMetadata: ragflowSegment.hierarchyMetadata || {},
      });

      const savedSegment = await this.segmentRepository.save(segment);
      segments.push(savedSegment);

      // Map the ragflow parent ID to the database parent ID
      parentIdMapping.set(ragflowSegment.id, savedSegment.id);
    }

    // 2. Then, save all child segments with proper parent references
    for (let i = 0; i < childRagflowSegments.length; i++) {
      const ragflowSegment = childRagflowSegments[i];

      // Map the ragflow parent ID to the actual database parent ID
      const actualParentId = parentIdMapping.get(ragflowSegment.parentId);

      if (!actualParentId) {
        this.logger.warn(
          `[CHUNKING] Child segment ${ragflowSegment.id} references unknown parent ${ragflowSegment.parentId}. Skipping.`,
        );
        continue;
      }

      const segment = this.segmentRepository.create({
        documentId: document.id,
        datasetId: datasetId,
        position: parentRagflowSegments.length + i + 1, // Position after parents
        content: ragflowSegment.content,
        wordCount: ragflowSegment.wordCount,
        tokens: ragflowSegment.tokenCount,
        keywords: {
          extracted: [],
          count: 0,
          extractedAt: new Date().toISOString(),
        },
        status: 'chunked',
        enabled: true,
        userId: userId,
        // Map to actual database parent ID
        parentId: actualParentId,
        segmentType: ragflowSegment.segmentType || 'child',
        hierarchyLevel: ragflowSegment.hierarchyLevel || 2,
        childOrder: ragflowSegment.childOrder,
        childCount: ragflowSegment.childCount || 0,
        hierarchyMetadata: ragflowSegment.hierarchyMetadata || {},
      });

      const savedSegment = await this.segmentRepository.save(segment);
      segments.push(savedSegment);
    }

    return segments;
  }

  private async processWithTraditionalChunking(
    document: Document,
    datasetId: string,
    content: string,
    config: ChunkingConfig,
    userId: string,
  ): Promise<DocumentSegment[]> {
    // Split text into chunks using the provided configuration
    const chunks = this.splitText(content, config);
    this.logger.log(
      `[CHUNKING] Document ${document.id} split into ${chunks.length} chunks using ${config.textSplitter} splitter`,
    );

    // Post-process chunks to merge tiny final chunks
    const minChunkSize = Math.max(50, config.chunkSize * 0.1);
    const processedChunks = chunks.filter((chunk) => chunk.trim().length > 0);

    if (processedChunks.length > 1) {
      const lastChunk = processedChunks[processedChunks.length - 1];
      if (lastChunk.length < minChunkSize) {
        const secondLastChunk = processedChunks[processedChunks.length - 2];
        processedChunks[processedChunks.length - 2] =
          secondLastChunk + ' ' + lastChunk;
        processedChunks.pop();
        this.logger.log(
          `[CHUNKING] Merged tiny final chunk (${lastChunk.length} chars) with previous chunk`,
        );
      }
    }

    // Create document segments
    const segments: DocumentSegment[] = [];
    for (let i = 0; i < processedChunks.length; i++) {
      const chunkContent = processedChunks[i];

      this.logger.log(
        `[CHUNKING] Processing chunk ${i + 1}: "${chunkContent.substring(0, 100)}..."`,
      );

      const segment = this.segmentRepository.create({
        documentId: document.id,
        datasetId: datasetId,
        position: i + 1,
        content: chunkContent,
        wordCount: chunkContent.split(/\s+/).filter((word) => word.length > 0)
          .length,
        tokens: this.estimateTokenCount(chunkContent),
        keywords: {
          extracted: [],
          count: 0,
          extractedAt: new Date().toISOString(),
        },
        status: 'chunked',
        enabled: true,
        userId: userId,
        // Traditional chunking uses default values for parent-child fields
        segmentType: 'chunk',
        hierarchyLevel: 1,
        childCount: 0,
        hierarchyMetadata: {},
      });

      const savedSegment = await this.segmentRepository.save(segment);
      segments.push(savedSegment);
    }

    return segments;
  }

  private splitText(text: string, config: ChunkingConfig): string[] {
    const {
      textSplitter,
      chunkSize,
      chunkOverlap,
      model,
      useModelDefaults = false,
    } = config;

    // Use model-specific defaults for optimal performance
    const effectiveChunkSize = getEffectiveChunkSize(
      chunkSize,
      model as EmbeddingModel,
      useModelDefaults,
    );
    const effectiveOverlap = getEffectiveChunkOverlap(
      chunkOverlap,
      model as EmbeddingModel,
      effectiveChunkSize,
      useModelDefaults,
    );

    // Log model-specific optimizations if enabled
    if (useModelDefaults) {
      const modelDefaults = getModelDefaults(model as EmbeddingModel);
      this.logger.log(
        `[CHUNKING] Using ${model} optimizations: ${modelDefaults.description}`,
      );
    }

    this.logger.log(
      `[CHUNKING] Starting text splitting with ${textSplitter}, chunkSize: ${chunkSize} → ${effectiveChunkSize}, overlap: ${chunkOverlap} → ${effectiveOverlap}`,
    );

    // Use Chinese-aware splitting for Chinese text
    if (this.chineseTextPreprocessorService.isChineseText(text)) {
      const chunks = this.chineseTextPreprocessorService.splitChineseText(
        text,
        effectiveChunkSize,
        effectiveOverlap,
      );
      this.logger.log(
        `[CHUNKING] Chinese splitting produced ${chunks.length} chunks`,
      );
      return chunks;
    }

    let chunks: string[] = [];

    // Enhanced text splitting implementation
    switch (textSplitter) {
      case 'recursive_character':
        chunks = this.recursiveCharacterSplit(
          text,
          effectiveChunkSize,
          effectiveOverlap,
        );
        break;
      case 'character':
        chunks = this.characterSplit(
          text,
          effectiveChunkSize,
          effectiveOverlap,
        );
        break;
      case 'token':
      case 'token_based':
        chunks = this.tokenSplit(text, effectiveChunkSize, effectiveOverlap);
        break;
      case 'sentence_splitter':
        chunks = this.sentenceSplit(text, effectiveChunkSize, effectiveOverlap);
        break;
      case 'smart_chunking':
        chunks = this.smartChunking(text, effectiveChunkSize, effectiveOverlap);
        break;
      case 'markdown':
        chunks = this.markdownSplit(text, effectiveChunkSize, effectiveOverlap);
        break;
      case 'python_code':
        chunks = this.pythonCodeSplit(
          text,
          effectiveChunkSize,
          effectiveOverlap,
        );
        break;
      default:
        chunks = this.recursiveCharacterSplit(
          text,
          effectiveChunkSize,
          effectiveOverlap,
        );
        break;
    }

    this.logger.log(
      `[CHUNKING] Text splitting produced ${chunks.length} chunks`,
    );
    return chunks;
  }

  // Text splitting methods (extracted from DocumentProcessingService)
  private recursiveCharacterSplit(
    text: string,
    chunkSize: number,
    chunkOverlap: number,
  ): string[] {
    const chunks: string[] = [];
    const separators = [
      '\n\n', // Paragraph breaks
      '\n', // Line breaks
      '. ', // Sentence endings
      '! ', // Exclamation endings
      '? ', // Question endings
      '; ', // Semicolon breaks
      ', ', // Comma breaks
      ' ', // Word boundaries
      '', // Character-level (last resort)
    ];

    let remainingText = text.trim();

    while (remainingText.length > 0) {
      let bestSplitIndex = -1;
      let bestSeparator = '';
      let bestScore = -1;

      // Find the best split point using separators in order of preference
      for (let i = 0; i < separators.length; i++) {
        const separator = separators[i];
        const priority = separators.length - i;

        if (separator === '') {
          if (remainingText.length > chunkSize) {
            const wordBoundaryIndex = this.findWordBoundaryNearLimit(
              remainingText,
              chunkSize,
            );
            if (wordBoundaryIndex > 0) {
              bestSplitIndex = wordBoundaryIndex;
              bestSeparator = separator;
              bestScore = priority * 0.5;
              break;
            } else {
              bestSplitIndex = chunkSize;
              bestSeparator = separator;
              bestScore = priority * 0.1;
            }
          }
        } else {
          const splitIndex = remainingText.lastIndexOf(separator, chunkSize);
          if (splitIndex > bestSplitIndex && splitIndex <= chunkSize) {
            const positionScore = splitIndex / chunkSize;
            const totalScore = priority * positionScore;

            if (totalScore > bestScore) {
              bestSplitIndex = splitIndex;
              bestSeparator = separator;
              bestScore = totalScore;
            }
          }
        }
      }

      if (bestSplitIndex === -1 || bestSplitIndex > chunkSize) {
        bestSplitIndex = Math.min(chunkSize, remainingText.length);
        bestSeparator = '';
      }

      const chunk = remainingText.substring(0, bestSplitIndex).trim();
      if (chunk.length > 0) {
        chunks.push(chunk);
      }

      if (chunkOverlap > 0 && chunk.length > chunkOverlap) {
        const overlapText = this.getSmartOverlap(chunk, chunkOverlap);
        remainingText = overlapText + remainingText.substring(bestSplitIndex);
      } else {
        remainingText = remainingText.substring(bestSplitIndex);
      }

      if (bestSeparator && bestSeparator !== '') {
        remainingText = remainingText.substring(bestSeparator.length);
      }
    }

    return chunks;
  }

  private characterSplit(
    text: string,
    chunkSize: number,
    chunkOverlap: number,
  ): string[] {
    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      chunks.push(text.slice(start, end));
      start = end - chunkOverlap;

      if (start >= end) break;
    }

    return chunks;
  }

  private tokenSplit(
    text: string,
    chunkSize: number,
    chunkOverlap: number,
  ): string[] {
    const words = text.split(/\s+/).filter((word) => word.length > 0);
    const chunks: string[] = [];
    let currentChunk: string[] = [];
    let currentTokenCount = 0;

    for (const word of words) {
      const wordTokens = Math.ceil(word.length / 4);

      if (
        currentTokenCount + wordTokens > chunkSize &&
        currentChunk.length > 0
      ) {
        chunks.push(currentChunk.join(' '));

        if (chunkOverlap > 0) {
          const overlapTokens = Math.min(chunkOverlap, currentTokenCount);
          const overlapWords = Math.ceil(overlapTokens * 4);
          currentChunk = currentChunk.slice(-overlapWords);
          currentTokenCount = currentChunk.reduce(
            (sum, w) => sum + Math.ceil(w.length / 4),
            0,
          );
        } else {
          currentChunk = [];
          currentTokenCount = 0;
        }
      }

      currentChunk.push(word);
      currentTokenCount += wordTokens;
    }

    if (currentChunk.length > 0) {
      chunks.push(currentChunk.join(' '));
    }

    return chunks;
  }

  private sentenceSplit(
    text: string,
    chunkSize: number,
    chunkOverlap: number,
  ): string[] {
    const chunks: string[] = [];
    const sentences = text
      .split(/(?<=[.!?])\s+/)
      .filter((s) => s.trim().length > 0);

    let currentChunk = '';
    let currentLength = 0;

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i].trim();
      const sentenceLength = sentence.length;

      if (
        currentLength + sentenceLength + (currentChunk ? 1 : 0) > chunkSize &&
        currentChunk.length > 0
      ) {
        chunks.push(currentChunk.trim());

        if (chunkOverlap > 0) {
          const overlapText = this.getSentenceOverlap(
            currentChunk,
            chunkOverlap,
          );
          currentChunk = overlapText + (overlapText ? ' ' : '') + sentence;
          currentLength = currentChunk.length;
        } else {
          currentChunk = sentence;
          currentLength = sentenceLength;
        }
      } else {
        currentChunk += (currentChunk ? ' ' : '') + sentence;
        currentLength = currentChunk.length;
      }
    }

    if (currentChunk.trim().length > 0) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  private smartChunking(
    text: string,
    chunkSize: number,
    chunkOverlap: number,
  ): string[] {
    const chunks: string[] = [];
    const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);

    for (const paragraph of paragraphs) {
      if (paragraph.length <= chunkSize) {
        chunks.push(paragraph.trim());
      } else {
        const sentenceChunks = this.smartSentenceChunking(
          paragraph,
          chunkSize,
          chunkOverlap,
        );
        chunks.push(...sentenceChunks);
      }
    }

    return this.postProcessChunks(chunks, chunkSize, chunkOverlap);
  }

  private smartSentenceChunking(
    text: string,
    chunkSize: number,
    chunkOverlap: number,
  ): string[] {
    const chunks: string[] = [];
    const sentences = text
      .split(/(?<=[.!?])\s+/)
      .filter((s) => s.trim().length > 0);

    let currentChunk = '';
    let currentLength = 0;

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i].trim();
      const sentenceLength = sentence.length;

      if (
        currentLength + sentenceLength + (currentChunk ? 1 : 0) > chunkSize &&
        currentChunk.length > 0
      ) {
        chunks.push(currentChunk.trim());

        if (chunkOverlap > 0) {
          const overlapText = this.getSmartSentenceOverlap(
            currentChunk,
            chunkOverlap,
          );
          currentChunk = overlapText + (overlapText ? ' ' : '') + sentence;
          currentLength = currentChunk.length;
        } else {
          currentChunk = sentence;
          currentLength = sentenceLength;
        }
      } else {
        currentChunk += (currentChunk ? ' ' : '') + sentence;
        currentLength = currentChunk.length;
      }
    }

    if (currentChunk.trim().length > 0) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  private markdownSplit(
    text: string,
    chunkSize: number,
    chunkOverlap: number,
  ): string[] {
    const sections = text.split(/(?=^#{1,6}\s)/m);
    const chunks: string[] = [];

    for (const section of sections) {
      if (section.length <= chunkSize) {
        chunks.push(section);
      } else {
        const subChunks = this.characterSplit(section, chunkSize, chunkOverlap);
        chunks.push(...subChunks);
      }
    }

    return chunks;
  }

  private pythonCodeSplit(
    text: string,
    chunkSize: number,
    chunkOverlap: number,
  ): string[] {
    const codeBlocks = text.split(
      /(?=^(?:def |class |if __name__|import |from ))/m,
    );
    const chunks: string[] = [];

    for (const block of codeBlocks) {
      if (block.length <= chunkSize) {
        chunks.push(block);
      } else {
        const subChunks = this.characterSplit(block, chunkSize, chunkOverlap);
        chunks.push(...subChunks);
      }
    }

    return chunks;
  }

  // Helper methods
  private findWordBoundaryNearLimit(text: string, limit: number): number {
    const searchRange = Math.floor(limit * 0.2);
    const startSearch = Math.max(0, limit - searchRange);

    for (let i = limit; i >= startSearch; i--) {
      if (text[i] === ' ') {
        return i;
      }
    }

    return -1;
  }

  private getSmartOverlap(chunk: string, overlapSize: number): string {
    if (chunk.length <= overlapSize) {
      return chunk;
    }

    const overlapStart = Math.max(0, chunk.length - overlapSize);
    const wordBoundaryIndex = chunk.lastIndexOf(
      ' ',
      overlapStart + overlapSize * 0.5,
    );

    if (wordBoundaryIndex > overlapStart) {
      return chunk.substring(wordBoundaryIndex + 1).trim();
    }

    return chunk.slice(-overlapSize).trim();
  }

  private getSentenceOverlap(chunk: string, overlapSize: number): string {
    if (chunk.length <= overlapSize) {
      return chunk;
    }

    const sentences = chunk
      .split(/(?<=[.!?])\s+/)
      .filter((s) => s.trim().length > 0);
    let overlapText = '';

    for (let i = sentences.length - 1; i >= 0; i--) {
      const sentence = sentences[i].trim();
      const potentialOverlap =
        sentence + (overlapText ? ' ' : '') + overlapText;

      if (potentialOverlap.length <= overlapSize * 1.2) {
        overlapText = potentialOverlap;
      } else {
        break;
      }
    }

    if (!overlapText) {
      return this.getSmartOverlap(chunk, overlapSize);
    }

    return overlapText;
  }

  private getSmartSentenceOverlap(chunk: string, overlapSize: number): string {
    if (chunk.length <= overlapSize) {
      return chunk;
    }

    const sentences = chunk
      .split(/(?<=[.!?])\s+/)
      .filter((s) => s.trim().length > 0);
    let overlapText = '';

    for (let i = sentences.length - 1; i >= 0; i--) {
      const sentence = sentences[i].trim();
      const potentialOverlap =
        sentence + (overlapText ? ' ' : '') + overlapText;

      if (potentialOverlap.length <= overlapSize * 1.3) {
        overlapText = potentialOverlap;
      } else {
        break;
      }
    }

    if (!overlapText) {
      return this.getSmartOverlap(chunk, overlapSize);
    }

    return overlapText;
  }

  private postProcessChunks(
    chunks: string[],
    targetChunkSize: number,
    _overlapSize: number,
  ): string[] {
    if (chunks.length <= 1) {
      return chunks;
    }

    const processedChunks: string[] = [];
    const minChunkSize = Math.max(50, targetChunkSize * 0.1);

    for (let i = 0; i < chunks.length; i++) {
      const currentChunk = chunks[i].trim();

      if (currentChunk.length < minChunkSize && i < chunks.length - 1) {
        const nextChunk = chunks[i + 1].trim();
        const mergedChunk = currentChunk + ' ' + nextChunk;

        if (mergedChunk.length <= targetChunkSize * 1.2) {
          processedChunks.push(mergedChunk);
          i++; // Skip next chunk as it's been merged
        } else {
          processedChunks.push(currentChunk);
        }
      } else {
        processedChunks.push(currentChunk);
      }
    }

    return processedChunks;
  }

  private estimateTokenCount(text: string): number {
    const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const englishWords = text
      .split(/\s+/)
      .filter(
        (word) => word.length > 0 && !/[\u4e00-\u9fff]/.test(word),
      ).length;
    const punctuation = (text.match(/[^\w\s\u4e00-\u9fff]/g) || []).length;

    return Math.ceil(chineseChars + englishWords * 1.3 + punctuation * 0.1);
  }

  private cleanGeneralText(text: string): string {
    if (!text || text.trim().length === 0) {
      return '';
    }

    let cleaned = text;

    // Fix common PDF character encoding issues
    cleaned = this.fixPdfCharacterEncoding(cleaned);

    // Remove excessive empty lines
    cleaned = cleaned.replace(/^[ \t]*\n(?:[ \t]*\n)+/gm, '\n');
    cleaned = cleaned.replace(/^[ \t\r\f\v]*$/gm, '');
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    cleaned = cleaned.replace(/^[ \t]+/gm, '');
    cleaned = cleaned.replace(/[ \t]+$/gm, '');
    cleaned = cleaned.replace(/[ \t]{2,}/g, ' ');
    cleaned = cleaned.replace(/^[\s\n]*/, '');
    cleaned = cleaned.replace(/[\s\n]*$/, '');
    cleaned = cleaned.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    const lines = cleaned.split('\n');
    const filteredLines = lines.filter((line) => line.trim().length > 0);
    cleaned = filteredLines.join('\n');

    return cleaned.trim();
  }

  private fixPdfCharacterEncoding(text: string): string {
    let fixed = text;

    const fixes = [
      { pattern: /C([a-z])/g, replacement: 'fi$1' },
      { pattern: /([a-z])C([a-z])/g, replacement: '$1fi$2' },
      { pattern: /=([a-z])/g, replacement: 'ti$1' },
      { pattern: /([a-z])=([a-z])/g, replacement: '$1ti$2' },
      { pattern: /\bEn=ty\b/g, replacement: 'Entity' },
      { pattern: /\bExtrac=on\b/g, replacement: 'Extraction' },
      { pattern: /\bCiles?\b/g, replacement: 'Files' },
      { pattern: /\bworkClow\b/g, replacement: 'workflow' },
      { pattern: /\bDeCine\b/g, replacement: 'Define' },
      { pattern: /\bspeciCica=on\b/g, replacement: 'specification' },
      { pattern: /\bfunc=onali=es\b/g, replacement: 'functionalities' },
      { pattern: /\bmanagemen=\b/g, replacement: 'management' },
      { pattern: /\bdocumen=\b/g, replacement: 'document' },
      { pattern: /\brequiremen=s?\b/g, replacement: 'requirements' },
      { pattern: /\bintegra=on\b/g, replacement: 'integration' },
      { pattern: /\bauthen=ca=on\b/g, replacement: 'authentication' },
      { pattern: /\bimplementa=on\b/g, replacement: 'implementation' },
      { pattern: /fifi/g, replacement: 'fi' },
      { pattern: /titi/g, replacement: 'ti' },
      { pattern: /[\u2018\u2019]/g, replacement: "'" },
      { pattern: /[\u201C\u201D]/g, replacement: '"' },
      { pattern: /[\u2013\u2014]/g, replacement: '-' },
      { pattern: /\u2026/g, replacement: '...' },
      { pattern: /\u00A0/g, replacement: ' ' },
    ];

    for (const fix of fixes) {
      fixed = fixed.replace(fix.pattern, fix.replacement);
    }

    return fixed;
  }

  /**
   * Count words in text
   */
  private countWords(text: string): number {
    if (!text || typeof text !== 'string') return 0;
    return text
      .trim()
      .split(/\s+/)
      .filter((word) => word.length > 0).length;
  }

  /**
   * Estimate token count (rough approximation)
   */
  private estimateTokens(text: string): number {
    if (!text || typeof text !== 'string') return 0;
    // Rough approximation: 1 token ≈ 4 characters for English, 1.5 for Chinese
    const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const otherChars = text.length - chineseChars;
    return Math.ceil(chineseChars / 1.5 + otherChars / 4);
  }
}
