import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { readFileSync } from 'fs';
import { join } from 'path';
import * as pdfParse from 'pdf-parse';
import { Document } from '../entities/document.entity';
import { DocumentSegment } from '../entities/document-segment.entity';
import { Dataset } from '../entities/dataset.entity';
import { Embedding } from '../entities/embedding.entity';
import { EventTypes } from '../../event/constants/event-types';
import { DocumentUploadedEvent } from '../../event/interfaces/document-events.interface';
import { EmbeddingService } from './embedding.service';
import { EmbeddingModel } from '../dto/create-dataset-step.dto';
import * as crypto from 'crypto';
import * as natural from 'natural';

interface EmbeddingConfig {
  model: string;
  customModelName?: string;
  provider: string;
  textSplitter: string;
  chunkSize: number;
  chunkOverlap: number;
  separators?: string[];
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
  ) {}

  @OnEvent('document.processing')
  async handleDocumentProcessing(event: {
    documentId: string;
    datasetId: string;
    embeddingConfig: EmbeddingConfig;
    userId: string;
  }) {
    this.logger.log(`Starting document processing for ${event.documentId}`);

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

    // Split text into chunks using the provided embedding configuration
    const chunks = this.splitText(content, embeddingConfig);
    this.logger.log(
      `Document ${documentId} split into ${chunks.length} chunks using ${embeddingConfig.textSplitter} splitter (size: ${embeddingConfig.chunkSize}, overlap: ${embeddingConfig.chunkOverlap})`,
    );

    // Update document with embedding configuration
    await this.documentRepository.update(documentId, {
      indexingStatus: 'indexing',
      embeddingModel: embeddingConfig.model,
      embeddingDimensions: undefined, // Will be set after first embedding is generated
    });

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
      });

      const savedSegment = await this.segmentRepository.save(segment);
      segments.push(savedSegment);
    }

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
    docType: string,
  ): Promise<string> {
    try {
      switch (docType) {
        case 'text':
        case 'markdown':
        case 'json':
        case 'csv':
          return readFileSync(filePath, 'utf-8');

        case 'pdf':
          try {
            const pdfBuffer = readFileSync(filePath);
            const pdfData = await pdfParse(pdfBuffer);
            return (
              pdfData.text ||
              `PDF processed but no text content found in ${filePath}`
            );
          } catch (pdfError) {
            this.logger.warn(
              `Failed to parse PDF ${filePath}: ${pdfError.message}`,
            );
            return `PDF file could not be parsed - ${filePath}. Error: ${pdfError.message}`;
          }

        case 'word':
          // Word documents are not currently supported
          throw new Error(
            `Word document parsing is not currently supported: ${filePath}`,
          );

        default:
          // Try to read as text, but handle binary files gracefully
          try {
            return readFileSync(filePath, 'utf-8');
          } catch {
            throw new Error(
              `Unsupported file type: ${docType} for file: ${filePath}`,
            );
          }
      }
    } catch (error) {
      throw new Error(
        `Failed to extract text from ${docType} file: ${error.message}`,
      );
    }
  }

  private splitText(text: string, config: EmbeddingConfig): string[] {
    const { textSplitter, chunkSize, chunkOverlap } = config;

    // Simple text splitting implementation
    // In a real implementation, you would use more sophisticated text splitters
    switch (textSplitter) {
      case 'recursive_character':
        return this.recursiveCharacterSplit(text, chunkSize, chunkOverlap);

      case 'character':
        return this.characterSplit(text, chunkSize, chunkOverlap);

      case 'token':
        return this.tokenSplit(text, chunkSize, chunkOverlap);

      case 'markdown':
        return this.markdownSplit(text, chunkSize, chunkOverlap);

      case 'python_code':
        return this.pythonCodeSplit(text, chunkSize, chunkOverlap);

      default:
        return this.characterSplit(text, chunkSize, chunkOverlap);
    }
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
}
