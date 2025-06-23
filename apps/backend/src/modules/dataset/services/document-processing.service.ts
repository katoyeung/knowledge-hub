import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { promises as fs } from 'fs';
import { join } from 'path';
import { Document } from '../entities/document.entity';
import { DocumentSegment } from '../entities/document-segment.entity';
import { Dataset } from '../entities/dataset.entity';
import { Embedding } from '../entities/embedding.entity';
import { EventTypes } from '../../event/constants/event-types';
import { DocumentUploadedEvent } from '../../event/interfaces/document-events.interface';
import { EmbeddingService } from './embedding.service';
import { EmbeddingModel, TextSplitter } from '../dto/create-dataset-step.dto';
import * as crypto from 'crypto';
import * as natural from 'natural';
import {
  RagflowPdfParserService,
  EmbeddingOptimizedConfig,
} from '../../document-parser/services/ragflow-pdf-parser.service';
import { SimplePdfParserService } from '../../document-parser/services/simple-pdf-parser.service';
import { ChineseTextPreprocessorService } from '../../document-parser/services/chinese-text-preprocessor.service';

interface EmbeddingConfig {
  model: string;
  customModelName?: string;
  provider: string;
  textSplitter: string;
  chunkSize: number;
  chunkOverlap: number;
  separators?: string[];
  enableParentChildChunking?: boolean;
}

@Injectable()
export class DocumentProcessingService {
  private readonly logger = new Logger(DocumentProcessingService.name);

  constructor(
    @InjectRepository(Document)
    private readonly documentRepository: Repository<Document>,
    @InjectRepository(DocumentSegment)
    private readonly segmentRepository: Repository<DocumentSegment>,
    @InjectRepository(Dataset)
    private readonly datasetRepository: Repository<Dataset>,
    @InjectRepository(Embedding)
    private readonly embeddingRepository: Repository<Embedding>,
    private readonly embeddingService: EmbeddingService,
    private readonly ragflowPdfParserService: RagflowPdfParserService,
    private readonly simplePdfParserService: SimplePdfParserService,
    private readonly chineseTextPreprocessorService: ChineseTextPreprocessorService,
  ) {}

  @OnEvent('document.processing')
  async handleDocumentProcessing(event: {
    documentId: string;
    datasetId: string;
    embeddingConfig: EmbeddingConfig;
    userId: string;
  }) {
    this.logger.log(
      `🚀 [DEBUG] Starting document processing for ${event.documentId}`,
    );
    this.logger.log(
      `🚀 [DEBUG] Event received with config: ${JSON.stringify(event.embeddingConfig)}`,
    );

    try {
      await this.processDocument(
        event.documentId,
        event.datasetId,
        event.embeddingConfig,
        event.userId,
      );
    } catch (error) {
      this.logger.error(
        `Document processing failed: ${error.message}`,
        error.stack,
      );

      // Update document status to failed
      await this.documentRepository.update(event.documentId, {
        indexingStatus: 'error',
      });
    }
  }

  @OnEvent(EventTypes.DOCUMENT_UPLOADED)
  handleDocumentUploaded(event: DocumentUploadedEvent) {
    this.logger.log(`Document uploaded: ${event.payload.documentId}`);
    // This will be triggered automatically, but we can add additional logic here if needed
  }

  private async processDocument(
    documentId: string,
    datasetId: string,
    embeddingConfig: EmbeddingConfig,
    userId: string,
  ): Promise<void> {
    // Get document
    const document = await this.documentRepository.findOne({
      where: { id: documentId },
    });

    if (!document) {
      throw new Error(`Document not found: ${documentId}`);
    }

    // Clear any existing segments for this document (in case of reprocessing)
    await this.segmentRepository.delete({ documentId: documentId });
    this.logger.log(`Cleared existing segments for document ${documentId}`);

    // Update status to processing
    await this.documentRepository.update(documentId, {
      indexingStatus: 'parsing',
    });

    // Read file content
    let content: string;
    try {
      const filePath = join(
        process.cwd(),
        'uploads',
        'documents',
        document.fileId,
      );
      content = await this.extractTextFromFile(filePath, document.docType);
    } catch (error) {
      throw new Error(`Failed to read file: ${error.message}`);
    }

    // Update status to splitting
    await this.documentRepository.update(documentId, {
      indexingStatus: 'splitting',
    });

    // 🆕 Choose chunking strategy based on configuration
    let segments: DocumentSegment[] = [];

    if (
      embeddingConfig.enableParentChildChunking &&
      document.docType === 'pdf'
    ) {
      // Use advanced Parent-Child Chunking for PDFs
      this.logger.log(
        `🔗 Using Parent-Child Chunking for document ${documentId}`,
      );
      segments = await this.processWithParentChildChunking(
        document,
        datasetId,
        embeddingConfig,
        userId,
      );
    } else {
      // Use traditional chunking
      this.logger.log(
        `📄 Using traditional chunking for document ${documentId}`,
      );
      segments = await this.processWithTraditionalChunking(
        document,
        datasetId,
        content,
        embeddingConfig,
        userId,
      );
    }

    // Update document with embedding configuration
    await this.documentRepository.update(documentId, {
      indexingStatus: 'indexing',
      embeddingModel: embeddingConfig.model,
      embeddingDimensions: undefined, // Will be set after first embedding is generated
    });

    // Generate embeddings for each segment
    let embeddingDimensions: number | undefined;
    for (const segment of segments) {
      const embeddingResult = await this.generateEmbedding(
        segment.content,
        embeddingConfig,
      );

      // Store dimensions from first embedding
      if (!embeddingDimensions) {
        embeddingDimensions = embeddingResult.dimensions;
        this.logger.log(
          `Using embedding model ${embeddingConfig.model} with ${embeddingDimensions} dimensions`,
        );
      }

      // Create embedding entity
      const embeddingHash = this.generateEmbeddingHash(
        segment.content,
        embeddingConfig.model,
      );
      const embedding = this.embeddingRepository.create({
        modelName: embeddingResult.model,
        hash: embeddingHash,
        embedding: embeddingResult.embedding,
        providerName: this.getProviderName(embeddingConfig.model),
      });

      const savedEmbedding = await this.embeddingRepository.save(embedding);

      // Update segment with embedding reference
      await this.segmentRepository.update(segment.id, {
        status: 'completed',
        embeddingId: savedEmbedding.id,
      });
    }

    // Update document status to completed with embedding dimensions
    await this.documentRepository.update(documentId, {
      indexingStatus: 'completed',
      wordCount: content.split(' ').length,
      tokens: Math.ceil(content.length / 4),
      embeddingDimensions: embeddingDimensions,
    });

    this.logger.log(
      `Document processing completed: ${documentId}, ${segments.length} segments created with ${embeddingDimensions} dimensions`,
    );
  }

  private async extractTextFromFile(
    filePath: string,
    docType?: string,
  ): Promise<string> {
    this.logger.log(
      `📄 [DEBUG] Extracting text from file: ${filePath} (type: ${docType})`,
    );

    let content = '';

    try {
      if (docType === 'pdf') {
        // Try RAGFlow parser first for better PDF handling
        try {
          this.logger.log(`📄 [DEBUG] Attempting RAGFlow PDF parsing...`);
          const parseResult = await this.ragflowPdfParserService.parsePdf(
            filePath,
            {
              confidenceThreshold: 0.8,
              enableTableExtraction: true,
            },
          );
          content = parseResult.segments.map((s) => s.content).join('\n\n');
          this.logger.log(
            `📄 [DEBUG] RAGFlow PDF extraction successful: ${content.length} characters`,
          );
          this.logger.log(
            `📄 [DEBUG] RAGFlow content preview: "${content.substring(0, 100)}..."`,
          );
        } catch (ragflowError) {
          this.logger.warn(
            `RAGFlow PDF parsing failed, falling back to simple parser: ${ragflowError.message}`,
          );
          const simpleResult =
            await this.simplePdfParserService.extractTextFromPdf(filePath);
          content = simpleResult.content;
          this.logger.log(
            `📄 [DEBUG] Simple PDF extraction successful: ${content.length} characters`,
          );
          this.logger.log(
            `📄 [DEBUG] Simple PDF content preview: "${content.substring(0, 100)}..."`,
          );
        }
      } else {
        // Handle other file types
        content = await fs.readFile(filePath, 'utf-8');
        this.logger.log(
          `📄 [DEBUG] Text file extraction successful: ${content.length} characters`,
        );
        this.logger.log(
          `📄 [DEBUG] Text file content preview: "${content.substring(0, 100)}..."`,
        );
      }

      // 🆕 Apply text preprocessing to ALL documents (not just Chinese)
      const originalLength = content.length;
      this.logger.log(
        `🧹 [DEBUG] Starting text preprocessing for ${originalLength} characters`,
      );
      this.logger.log(
        `🧹 [DEBUG] Content before cleaning: "${content.substring(0, 200)}..."`,
      );

      // Check if it's Chinese text for specialized processing
      const isChinese =
        this.chineseTextPreprocessorService.isChineseText(content);
      this.logger.log(`🧹 [DEBUG] Chinese text detection result: ${isChinese}`);

      if (isChinese) {
        this.logger.log(
          `🇨🇳 [DEBUG] Applying Chinese-specific preprocessing to ${content.length} characters`,
        );
        content =
          this.chineseTextPreprocessorService.preprocessChineseText(content);
        this.logger.log(`🇨🇳 [DEBUG] Chinese preprocessing complete`);
      } else {
        this.logger.log(
          `🌐 [DEBUG] Applying general text cleaning to ${content.length} characters`,
        );
        content = this.cleanGeneralText(content);
        this.logger.log(`🌐 [DEBUG] General text cleaning complete`);
      }

      this.logger.log(
        `✨ [DEBUG] Text preprocessing complete: ${originalLength} → ${content.length} characters`,
      );
      this.logger.log(
        `✨ [DEBUG] Content after cleaning: "${content.substring(0, 200)}..."`,
      );

      return content;
    } catch (error) {
      this.logger.error(`Failed to extract text from ${filePath}:`, error);
      throw error;
    }
  }

  private splitText(text: string, config: EmbeddingConfig): string[] {
    const { textSplitter, chunkSize, chunkOverlap } = config;

    this.logger.log(
      `🔪 [DEBUG] Starting text splitting with ${textSplitter}, chunkSize: ${chunkSize}, overlap: ${chunkOverlap}`,
    );
    this.logger.log(`🔪 [DEBUG] Input text length: ${text.length} characters`);
    this.logger.log(
      `🔪 [DEBUG] Input text preview: "${text.substring(0, 200)}..."`,
    );

    // 🆕 Use Chinese-aware splitting for Chinese text
    if (this.chineseTextPreprocessorService.isChineseText(text)) {
      this.logger.debug('🇨🇳 [DEBUG] Using Chinese-aware text splitting...');
      const chunks = this.chineseTextPreprocessorService.splitChineseText(
        text,
        chunkSize,
        chunkOverlap,
      );
      this.logger.log(
        `🇨🇳 [DEBUG] Chinese splitting produced ${chunks.length} chunks`,
      );
      return chunks;
    }

    // Apply general text splitting for all other documents
    this.logger.debug(
      `🌐 [DEBUG] Using ${textSplitter} text splitting for non-Chinese content...`,
    );

    let chunks: string[] = [];

    // Simple text splitting implementation
    // In a real implementation, you would use more sophisticated text splitters
    switch (textSplitter) {
      case 'recursive_character':
        chunks = this.recursiveCharacterSplit(text, chunkSize, chunkOverlap);
        break;

      case 'character':
        chunks = this.characterSplit(text, chunkSize, chunkOverlap);
        break;

      case 'token':
        chunks = this.tokenSplit(text, chunkSize, chunkOverlap);
        break;

      case 'markdown':
        chunks = this.markdownSplit(text, chunkSize, chunkOverlap);
        break;

      case 'python_code':
        chunks = this.pythonCodeSplit(text, chunkSize, chunkOverlap);
        break;

      default:
        chunks = this.recursiveCharacterSplit(text, chunkSize, chunkOverlap);
        break;
    }

    this.logger.log(
      `🔪 [DEBUG] Text splitting produced ${chunks.length} chunks`,
    );
    if (chunks.length > 0) {
      this.logger.log(
        `🔪 [DEBUG] First chunk preview: "${chunks[0].substring(0, 200)}..."`,
      );
    }

    return chunks;
  }

  private recursiveCharacterSplit(
    text: string,
    chunkSize: number,
    chunkOverlap: number,
  ): string[] {
    // Simplified recursive character splitting implementation
    const chunks: string[] = [];
    let currentChunk = '';

    const lines = text.split('\n');

    for (const line of lines) {
      if ((currentChunk + line).length <= chunkSize) {
        currentChunk += (currentChunk ? '\n' : '') + line;
      } else {
        if (currentChunk) {
          chunks.push(currentChunk);

          // Handle overlap
          if (chunkOverlap > 0 && currentChunk.length > chunkOverlap) {
            currentChunk = currentChunk.slice(-chunkOverlap) + '\n' + line;
          } else {
            currentChunk = line;
          }
        } else {
          currentChunk = line;
        }
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk);
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
    // Simple token-based splitting (words)
    const words = text.split(' ');
    const chunks: string[] = [];
    let currentChunk: string[] = [];

    for (const word of words) {
      currentChunk.push(word);

      if (
        currentChunk.length >= chunkSize ||
        currentChunk.join(' ').length > chunkSize * 4
      ) {
        chunks.push(currentChunk.join(' '));

        // Handle overlap
        const overlapWords = Math.min(chunkOverlap, currentChunk.length);
        currentChunk = currentChunk.slice(-overlapWords);
      }
    }

    if (currentChunk.length > 0) {
      chunks.push(currentChunk.join(' '));
    }

    return chunks;
  }

  private markdownSplit(
    text: string,
    chunkSize: number,
    chunkOverlap: number,
  ): string[] {
    // Split by markdown sections (headers)
    const sections = text.split(/(?=^#{1,6}\s)/m);
    const chunks: string[] = [];

    for (const section of sections) {
      if (section.length <= chunkSize) {
        chunks.push(section);
      } else {
        // If section is too large, split it further
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
    // Split by Python code blocks (functions, classes)
    const codeBlocks = text.split(
      /(?=^(?:def |class |if __name__|import |from ))/m,
    );
    const chunks: string[] = [];

    for (const block of codeBlocks) {
      if (block.length <= chunkSize) {
        chunks.push(block);
      } else {
        // If block is too large, split it further
        const subChunks = this.characterSplit(block, chunkSize, chunkOverlap);
        chunks.push(...subChunks);
      }
    }

    return chunks;
  }

  // This would be implemented with actual embedding services like OpenAI, Hugging Face, etc.
  private async generateEmbedding(
    text: string,
    config: EmbeddingConfig,
  ): Promise<{ embedding: number[]; model: string; dimensions: number }> {
    this.logger.log(`Generating embedding for text using ${config.model}`);

    return this.embeddingService.generateEmbedding(
      text,
      config.model as EmbeddingModel,
      config.customModelName,
    );
  }

  private generateEmbeddingHash(text: string, model: string): string {
    return crypto
      .createHash('sha256')
      .update(text + model)
      .digest('hex');
  }

  private getProviderName(model: string): string {
    // Implement logic to determine provider name based on model
    if (model.startsWith('text-embedding')) {
      return 'openai';
    } else if (model.includes('/')) {
      return 'huggingface';
    } else {
      return 'local';
    }
  }

  /**
   * Extract keywords from text content using TF-IDF and other NLP techniques
   */
  private extractKeywords(content: string): string[] {
    try {
      // Clean and tokenize the text
      const cleanText = content
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ') // Remove punctuation
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();

      // Tokenize
      const tokenizer = new natural.WordTokenizer();
      const tokens = tokenizer.tokenize(cleanText) || [];

      // Remove stop words
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
        'i',
        'you',
        'he',
        'she',
        'it',
        'we',
        'they',
        'me',
        'him',
        'her',
        'us',
        'them',
        'my',
        'your',
        'his',
        'her',
        'its',
        'our',
        'their',
        'mine',
        'yours',
        'hers',
        'ours',
        'theirs',
        'not',
        'no',
        'yes',
        'from',
        'up',
        'about',
        'into',
        'over',
        'after',
        'before',
        'during',
        'between',
        'among',
        'through',
        'against',
        'above',
        'below',
        'down',
        'out',
        'off',
        'on',
        'over',
        'under',
        'again',
        'further',
        'then',
        'once',
        'here',
        'there',
        'when',
        'where',
        'why',
        'how',
        'all',
        'any',
        'both',
        'each',
        'few',
        'more',
        'most',
        'other',
        'some',
        'such',
        'only',
        'own',
        'same',
        'so',
        'than',
        'too',
        'very',
        'just',
        'now',
        'also',
        'however',
        'therefore',
        'thus',
        'hence',
        'moreover',
        'furthermore',
      ]);

      const filteredTokens = tokens.filter(
        (token) =>
          token.length > 2 && // Minimum length
          token.length < 20 && // Maximum length
          !stopWords.has(token) &&
          /^[a-zA-Z]+$/.test(token), // Only alphabetic characters
      );

      // Calculate word frequency
      const wordFreq: { [key: string]: number } = {};
      filteredTokens.forEach((token) => {
        wordFreq[token] = (wordFreq[token] || 0) + 1;
      });

      // Sort by frequency and get top keywords
      const sortedWords = Object.entries(wordFreq)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10) // Top 10 keywords
        .map(([word]) => word);

      // Also extract noun phrases using POS tagging if available
      try {
        const stemmer = natural.PorterStemmer;
        const stemmedKeywords = sortedWords.map((word) => stemmer.stem(word));

        // Combine original words and stemmed versions, remove duplicates
        const allKeywords = [...new Set([...sortedWords, ...stemmedKeywords])];

        return allKeywords.slice(0, 8); // Return top 8 unique keywords
      } catch {
        this.logger.warn(
          'POS tagging failed, using frequency-based keywords only',
        );
        return sortedWords.slice(0, 8);
      }
    } catch (error) {
      this.logger.error('Keyword extraction failed:', error);
      return [];
    }
  }

  // 🆕 Parent-Child Chunking Processing Method
  private async processWithParentChildChunking(
    document: Document,
    datasetId: string,
    embeddingConfig: EmbeddingConfig,
    userId: string,
  ): Promise<DocumentSegment[]> {
    const filePath = join(
      process.cwd(),
      'uploads',
      'documents',
      document.fileId,
    );

    // Convert EmbeddingConfig to EmbeddingOptimizedConfig for RAGFlow
    const parentConfig: EmbeddingOptimizedConfig = {
      model: embeddingConfig.model as EmbeddingModel,
      customModelName: embeddingConfig.customModelName,
      provider: embeddingConfig.provider,
      textSplitter: embeddingConfig.textSplitter as TextSplitter,
      chunkSize: Math.floor(embeddingConfig.chunkSize * 1.5), // Larger for parents
      chunkOverlap: embeddingConfig.chunkOverlap,
      separators: embeddingConfig.separators,
      confidenceThreshold: 0.7,
      enableTableExtraction: true,
    };

    const childConfig: EmbeddingOptimizedConfig = {
      model: embeddingConfig.model as EmbeddingModel,
      customModelName: embeddingConfig.customModelName,
      provider: embeddingConfig.provider,
      textSplitter: embeddingConfig.textSplitter as TextSplitter,
      chunkSize: Math.floor(embeddingConfig.chunkSize * 0.6), // Smaller for children
      chunkOverlap: Math.floor(embeddingConfig.chunkOverlap * 0.5),
      separators: embeddingConfig.separators,
      confidenceThreshold: 0.8,
      enableTableExtraction: true,
    };

    // Use RAGFlow Parent-Child Chunking
    const parseResult =
      await this.ragflowPdfParserService.parsePdfWithParentChildChunking(
        filePath,
        parentConfig,
        childConfig,
      );

    this.logger.log(
      `🔗 Parent-Child Chunking completed: ${parseResult.segments.length} segments (${parseResult.processingMetadata?.hierarchicalChunking?.parentChunks || 0} parents, ${parseResult.processingMetadata?.hierarchicalChunking?.childChunks || 0} children)`,
    );

    // Convert RAGFlow segments to DocumentSegment entities
    // First, separate parent and child segments
    const parentRagflowSegments = parseResult.segments.filter(
      (s) => s.segmentType === 'parent',
    );
    const childRagflowSegments = parseResult.segments.filter(
      (s) => s.segmentType === 'child',
    );

    const segments: DocumentSegment[] = [];
    const parentIdMapping = new Map<string, string>(); // Map from ragflow parent ID to DB parent ID

    // 1. First, save all parent segments
    for (let i = 0; i < parentRagflowSegments.length; i++) {
      const ragflowSegment = parentRagflowSegments[i];

      const keywords = this.extractKeywords(ragflowSegment.content);
      const keywordsObject = {
        extracted: keywords,
        count: keywords.length,
        extractedAt: new Date().toISOString(),
      };

      const segment = this.segmentRepository.create({
        documentId: document.id,
        datasetId: datasetId,
        position: i + 1,
        content: ragflowSegment.content,
        wordCount: ragflowSegment.wordCount,
        tokens: ragflowSegment.tokenCount,
        keywords: keywordsObject,
        status: 'waiting',
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

      const keywords = this.extractKeywords(ragflowSegment.content);
      const keywordsObject = {
        extracted: keywords,
        count: keywords.length,
        extractedAt: new Date().toISOString(),
      };

      // Map the ragflow parent ID to the actual database parent ID
      const actualParentId = parentIdMapping.get(ragflowSegment.parentId!);

      if (!actualParentId) {
        this.logger.warn(
          `Child segment ${ragflowSegment.id} references unknown parent ${ragflowSegment.parentId}. Skipping.`,
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
        keywords: keywordsObject,
        status: 'waiting',
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

  // 🆕 Traditional Chunking Processing Method (extracted from original logic)
  private async processWithTraditionalChunking(
    document: Document,
    datasetId: string,
    content: string,
    embeddingConfig: EmbeddingConfig,
    userId: string,
  ): Promise<DocumentSegment[]> {
    // Split text into chunks using the provided embedding configuration
    const chunks = this.splitText(content, embeddingConfig);
    this.logger.log(
      `Document ${document.id} split into ${chunks.length} chunks using ${embeddingConfig.textSplitter} splitter (size: ${embeddingConfig.chunkSize}, overlap: ${embeddingConfig.chunkOverlap})`,
    );

    // Create document segments
    const segments: DocumentSegment[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunkContent = chunks[i];

      // Extract keywords from the segment content
      const keywords = this.extractKeywords(chunkContent);
      const keywordsObject = {
        extracted: keywords,
        count: keywords.length,
        extractedAt: new Date().toISOString(),
      };

      this.logger.debug(
        `Extracted ${keywords.length} keywords for segment ${i + 1}: ${keywords.join(', ')}`,
      );

      const segment = this.segmentRepository.create({
        documentId: document.id,
        datasetId: datasetId,
        position: i + 1,
        content: chunkContent,
        wordCount: chunkContent.split(' ').length,
        tokens: Math.ceil(chunkContent.length / 4), // Rough token estimate
        keywords: keywordsObject,
        status: 'waiting',
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

  /**
   * Clean general text content (applies to all documents)
   * Removes excessive empty lines, fixes spacing issues, etc.
   */
  private cleanGeneralText(text: string): string {
    this.logger.log(
      `🧹 [DEBUG] cleanGeneralText called with ${text.length} characters`,
    );
    this.logger.log(
      `🧹 [DEBUG] Input text preview: "${text.substring(0, 200)}..."`,
    );

    if (!text || text.trim().length === 0) {
      this.logger.log(
        `🧹 [DEBUG] Empty or whitespace-only text, returning empty string`,
      );
      return '';
    }

    let cleaned = text;

    // Count empty lines before cleaning
    const emptyLinesBefore = (text.match(/^\s*$/gm) || []).length;
    this.logger.log(
      `🧹 [DEBUG] Empty lines before cleaning: ${emptyLinesBefore}`,
    );

    // 1. Remove the specific pattern of empty lines with just spaces and newlines
    // This targets the exact pattern: " \n \n \n \n  \n \n   \n  \n \n     \n"
    cleaned = cleaned.replace(/^[ \t]*\n(?:[ \t]*\n)+/gm, '\n');
    this.logger.log(
      `🧹 [DEBUG] After step 1 (remove empty line patterns): ${cleaned.length} chars`,
    );

    // 2. Remove lines that contain only whitespace characters
    cleaned = cleaned.replace(/^[ \t\r\f\v]*$/gm, '');
    this.logger.log(
      `🧹 [DEBUG] After step 2 (remove whitespace-only lines): ${cleaned.length} chars`,
    );

    // 3. Remove excessive consecutive newlines (more than 2)
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    this.logger.log(
      `🧹 [DEBUG] After step 3 (limit consecutive newlines): ${cleaned.length} chars`,
    );

    // 4. Remove excessive spaces at the beginning of lines
    cleaned = cleaned.replace(/^[ \t]+/gm, '');
    this.logger.log(
      `🧹 [DEBUG] After step 4 (remove leading spaces): ${cleaned.length} chars`,
    );

    // 5. Remove excessive spaces at the end of lines
    cleaned = cleaned.replace(/[ \t]+$/gm, '');
    this.logger.log(
      `🧹 [DEBUG] After step 5 (remove trailing spaces): ${cleaned.length} chars`,
    );

    // 6. Replace multiple consecutive spaces with single space
    cleaned = cleaned.replace(/[ \t]{2,}/g, ' ');
    this.logger.log(
      `🧹 [DEBUG] After step 6 (normalize spaces): ${cleaned.length} chars`,
    );

    // 7. Remove empty lines at the beginning of the text
    cleaned = cleaned.replace(/^[\s\n]*/, '');
    this.logger.log(
      `🧹 [DEBUG] After step 7 (remove leading empty lines): ${cleaned.length} chars`,
    );

    // 8. Remove empty lines at the end of the text
    cleaned = cleaned.replace(/[\s\n]*$/, '');
    this.logger.log(
      `🧹 [DEBUG] After step 8 (remove trailing empty lines): ${cleaned.length} chars`,
    );

    // 9. Normalize line breaks (ensure consistent \n)
    cleaned = cleaned.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    this.logger.log(
      `🧹 [DEBUG] After step 9 (normalize line breaks): ${cleaned.length} chars`,
    );

    // 10. Final cleanup: remove any remaining lines with only spaces
    const lines = cleaned.split('\n');
    const filteredLines = lines.filter((line) => line.trim().length > 0);
    cleaned = filteredLines.join('\n');
    this.logger.log(
      `🧹 [DEBUG] After step 10 (filter empty lines): ${lines.length} → ${filteredLines.length} lines`,
    );

    const result = cleaned.trim();

    // Count empty lines after cleaning
    const emptyLinesAfter = (result.match(/^\s*$/gm) || []).length;
    this.logger.log(
      `🧹 [DEBUG] Empty lines after cleaning: ${emptyLinesAfter}`,
    );
    this.logger.log(
      `🧹 [DEBUG] Final cleaned text preview: "${result.substring(0, 200)}..."`,
    );
    this.logger.log(
      `🧹 [DEBUG] cleanGeneralText returning ${result.length} characters`,
    );

    return result;
  }
}
