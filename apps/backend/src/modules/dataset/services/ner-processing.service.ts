import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { DocumentSegment } from '../entities/document-segment.entity';
import {
  EntityExtractionService,
  EntityExtractionConfig,
} from './entity-extraction.service';

export interface NerProcessingOptions {
  batchSize?: number;
  maxConcurrency?: number;
}

@Injectable()
export class NerProcessingService {
  private readonly logger = new Logger(NerProcessingService.name);

  constructor(
    @InjectRepository(DocumentSegment)
    private readonly segmentRepository: Repository<DocumentSegment>,
    private readonly entityExtractionService: EntityExtractionService,
  ) {}

  async processSegments(
    segments: DocumentSegment[],
    options: NerProcessingOptions = {},
  ): Promise<{ processedCount: number }> {
    const { batchSize = 10, maxConcurrency = 5 } = options;

    this.logger.log(
      `[NER] Processing ${segments.length} segments for NER extraction`,
    );

    // Filter segments that need NER processing
    const incompleteSegments = segments.filter(
      (segment) => segment.status === 'embedded',
    );

    if (incompleteSegments.length === 0) {
      this.logger.log(`[NER] No segments need NER processing`);
      return { processedCount: 0 };
    }

    let processedCount = 0;

    // Process segments in batches
    const batches = [];
    for (let i = 0; i < incompleteSegments.length; i += batchSize) {
      batches.push(incompleteSegments.slice(i, i + batchSize));
    }

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      this.logger.log(
        `[NER] Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} segments)`,
      );

      // Process segments in parallel within each batch
      const batchPromises = batch.map(async (segment) => {
        // Update segment status to ner_processing
        await this.segmentRepository.update(segment.id, {
          status: 'ner_processing',
        });

        // Extract entities using LLM-based extraction
        const config: EntityExtractionConfig = {
          method: 'llm',
          maxEntities: 8,
          enablePerformanceLogging: true,
          enableTextNormalization: true,
        };

        try {
          const result = await this.entityExtractionService.extractEntities(
            segment.content,
            config,
          );

          // Update segment with extracted keywords
          const keywordsObject = {
            extracted: result.entities,
            count: result.entities.length,
            extractedAt: new Date().toISOString(),
          };

          await this.segmentRepository.update(segment.id, {
            keywords: keywordsObject,
            status: 'completed',
            completedAt: new Date(),
          });

          processedCount++;
          this.logger.debug(
            `[NER] Completed segment ${segment.id} (${processedCount}/${incompleteSegments.length})`,
          );

          return { segment, entities: result.entities };
        } catch (error) {
          this.logger.error(
            `[NER] Failed to process segment ${segment.id}:`,
            error,
          );

          // Update segment status to failed
          await this.segmentRepository.update(segment.id, {
            status: 'ner_failed',
            error: error.message,
          });

          throw error;
        }
      });

      // Wait for all segments in this batch to complete
      try {
        await Promise.all(batchPromises);
        this.logger.log(
          `[NER] Completed batch ${batchIndex + 1}/${batches.length}`,
        );
      } catch (error) {
        this.logger.error(`[NER] Batch ${batchIndex + 1} failed:`, error);
        // Continue with next batch
      }
    }

    this.logger.log(
      `[NER] Completed NER processing: ${processedCount} segments processed`,
    );
    return { processedCount };
  }

  async processDocumentSegments(
    documentId: string,
    options: NerProcessingOptions = {},
  ): Promise<{ processedCount: number }> {
    this.logger.log(`[NER] Processing NER for document ${documentId}`);

    // Get segments that need NER processing
    const segments = await this.segmentRepository.find({
      where: {
        documentId,
        status: 'embedded',
      },
      order: { position: 'ASC' },
    });

    return this.processSegments(segments, options);
  }

  async getProcessingStats(documentId: string): Promise<{
    totalSegments: number;
    processedSegments: number;
    failedSegments: number;
    pendingSegments: number;
  }> {
    const segments = await this.segmentRepository.find({
      where: { documentId },
    });

    const totalSegments = segments.length;
    const processedSegments = segments.filter(
      (s) => s.status === 'completed',
    ).length;
    const failedSegments = segments.filter(
      (s) => s.status === 'ner_failed',
    ).length;
    const pendingSegments = segments.filter(
      (s) => s.status === 'embedded',
    ).length;

    return {
      totalSegments,
      processedSegments,
      failedSegments,
      pendingSegments,
    };
  }
}
