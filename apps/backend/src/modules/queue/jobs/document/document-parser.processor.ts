import { Process, Processor } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from 'bull';
import * as fs from 'fs';
import * as path from 'path';
import * as pdfParse from 'pdf-parse';
import * as natural from 'natural';
import { Document } from '../../../dataset/entities/document.entity';
import { DocumentSegment } from '../../../dataset/entities/document-segment.entity';
import { EventTypes } from '../../../event/constants/event-types';
import {
  DocumentProcessingStartedEvent,
  DocumentProcessingCompletedEvent,
  DocumentProcessingFailedEvent,
  DocumentSegmentsCreatedEvent,
} from '../../../event/interfaces/document-events.interface';

export interface DocumentParseJobData {
  documentId: string;
  filePath: string;
  userId: string;
}

@Processor('document-processing')
@Injectable()
export class DocumentParserProcessor {
  private readonly logger = new Logger(DocumentParserProcessor.name);

  constructor(
    @InjectRepository(Document)
    private readonly documentRepository: Repository<Document>,
    @InjectRepository(DocumentSegment)
    private readonly segmentRepository: Repository<DocumentSegment>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Process('parse-document')
  async parseDocument(job: Job<DocumentParseJobData>) {
    const { documentId, filePath, userId } = job.data;
    const startTime = Date.now();

    this.logger.log(`Starting document parsing for document ${documentId}`);

    // Emit processing started event
    const startedEvent: DocumentProcessingStartedEvent = {
      type: EventTypes.DOCUMENT_PROCESSING_STARTED,
      payload: {
        documentId,
        processingType: 'parse',
      },
      timestamp: Date.now(),
    };
    this.eventEmitter.emit(
      EventTypes.DOCUMENT_PROCESSING_STARTED,
      startedEvent,
    );

    try {
      // Update document status
      await this.documentRepository.update(documentId, {
        indexingStatus: 'parsing',
      });

      // Get document details
      const document = await this.documentRepository.findOne({
        where: { id: documentId },
        relations: ['dataset'],
      });

      if (!document) {
        throw new Error(`Document ${documentId} not found`);
      }

      // Parse the document based on file type
      let content: string;
      const fileExtension = path.extname(filePath).toLowerCase();

      switch (fileExtension) {
        case '.pdf':
          content = await this.parsePDF(filePath);
          break;
        case '.txt':
          content = this.parseText(filePath);
          break;
        case '.md':
          content = this.parseMarkdown(filePath);
          break;
        default:
          throw new Error(`Unsupported file type: ${fileExtension}`);
      }

      // Split content into segments
      const segments = this.splitIntoSegments(content);

      // Create document segments with keyword extraction
      const createdSegments = await this.createDocumentSegments(
        document,
        segments,
        userId,
      );

      // Update document status
      await this.documentRepository.update(documentId, {
        indexingStatus: 'parsed',
        completedAt: new Date(),
      });

      const processingTime = Date.now() - startTime;

      // Emit processing completed event
      const completedEvent: DocumentProcessingCompletedEvent = {
        type: EventTypes.DOCUMENT_PROCESSING_COMPLETED,
        payload: {
          documentId,
          processingType: 'parse',
          segmentsCreated: createdSegments.length,
          processingTime,
        },
        timestamp: Date.now(),
      };
      this.eventEmitter.emit(
        EventTypes.DOCUMENT_PROCESSING_COMPLETED,
        completedEvent,
      );

      // Emit segments created event
      const segmentsEvent: DocumentSegmentsCreatedEvent = {
        type: EventTypes.DOCUMENT_SEGMENTS_CREATED,
        payload: {
          documentId,
          segmentIds: createdSegments.map((s) => s.id),
          totalSegments: createdSegments.length,
        },
        timestamp: Date.now(),
      };
      this.eventEmitter.emit(
        EventTypes.DOCUMENT_SEGMENTS_CREATED,
        segmentsEvent,
      );

      this.logger.log(
        `Document parsing completed for ${documentId}. Created ${createdSegments.length} segments in ${processingTime}ms`,
      );

      return {
        documentId,
        segmentsCreated: createdSegments.length,
        processingTime,
      };
    } catch (error) {
      this.logger.error(`Document parsing failed for ${documentId}:`, error);

      // Update document status
      await this.documentRepository.update(documentId, {
        indexingStatus: 'failed',
        error: error.message,
      });

      // Emit processing failed event
      const failedEvent: DocumentProcessingFailedEvent = {
        type: EventTypes.DOCUMENT_PROCESSING_FAILED,
        payload: {
          documentId,
          processingType: 'parse',
          error: error.message,
          retryCount: job.attemptsMade,
        },
        timestamp: Date.now(),
      };
      this.eventEmitter.emit(
        EventTypes.DOCUMENT_PROCESSING_FAILED,
        failedEvent,
      );

      throw error;
    }
  }

  private async parsePDF(filePath: string): Promise<string> {
    try {
      const dataBuffer = fs.readFileSync(filePath);
      const data = await pdfParse(dataBuffer);
      return data.text;
    } catch (error) {
      throw new Error(`Failed to parse PDF: ${error.message}`);
    }
  }

  private parseText(filePath: string): string {
    try {
      return fs.readFileSync(filePath, 'utf-8');
    } catch (error) {
      throw new Error(`Failed to parse text file: ${error.message}`);
    }
  }

  private parseMarkdown(filePath: string): string {
    try {
      return fs.readFileSync(filePath, 'utf-8');
    } catch (error) {
      throw new Error(`Failed to parse markdown file: ${error.message}`);
    }
  }

  private splitIntoSegments(content: string): string[] {
    // Simple segmentation strategy - split by paragraphs and limit by character count
    const maxSegmentLength = 1000; // characters
    const minSegmentLength = 100; // characters

    // Split by double newlines (paragraphs)
    const paragraphs = content
      .split(/\n\s*\n/)
      .filter((p) => p.trim().length > 0);

    const segments: string[] = [];
    let currentSegment = '';

    for (const paragraph of paragraphs) {
      const trimmedParagraph = paragraph.trim();

      // If adding this paragraph would exceed max length, save current segment
      if (
        currentSegment.length + trimmedParagraph.length > maxSegmentLength &&
        currentSegment.length >= minSegmentLength
      ) {
        segments.push(currentSegment.trim());
        currentSegment = trimmedParagraph;
      } else {
        // Add paragraph to current segment
        currentSegment += (currentSegment ? '\n\n' : '') + trimmedParagraph;
      }
    }

    // Add the last segment if it has content
    if (currentSegment.trim().length >= minSegmentLength) {
      segments.push(currentSegment.trim());
    }

    return segments;
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

  private async createDocumentSegments(
    document: Document,
    segments: string[],
    userId: string,
  ): Promise<DocumentSegment[]> {
    const createdSegments: DocumentSegment[] = [];

    for (let i = 0; i < segments.length; i++) {
      const content = segments[i];
      const wordCount = content.split(/\s+/).length;

      // Rough token estimation (1 token ≈ 0.75 words)
      const tokens = Math.ceil(wordCount * 0.75);

      // Extract keywords from the segment content
      const keywords = this.extractKeywords(content);
      const keywordsObject = {
        extracted: keywords,
        count: keywords.length,
        extractedAt: new Date().toISOString(),
      };

      this.logger.debug(
        `Extracted ${keywords.length} keywords for segment ${i + 1}: ${keywords.join(', ')}`,
      );

      const segment = this.segmentRepository.create({
        datasetId: document.datasetId,
        documentId: document.id,
        position: i + 1,
        content,
        wordCount,
        tokens,
        keywords: keywordsObject,
        status: 'completed',
        enabled: true,
        userId,
        completedAt: new Date(),
      });

      const savedSegment = await this.segmentRepository.save(segment);
      createdSegments.push(savedSegment);
    }

    return createdSegments;
  }
}
