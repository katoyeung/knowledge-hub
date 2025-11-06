import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Document } from '../../dataset/entities/document.entity';
import { DocumentSegment } from '../../dataset/entities/document-segment.entity';
import { QueueManagerService } from './queue-manager.service';

@Injectable()
export class JobResumeService {
  private readonly logger = new Logger(JobResumeService.name);

  constructor(
    @InjectRepository(Document)
    private readonly documentRepository: Repository<Document>,
    @InjectRepository(DocumentSegment)
    private readonly segmentRepository: Repository<DocumentSegment>,
    private readonly queueManager: QueueManagerService,
  ) {}

  async resumeJobsForDataset(datasetId: string): Promise<{
    clearedJobs: number;
    queuedJobs: number;
    documents: string[];
  }> {
    this.logger.log(`Resuming jobs for dataset: ${datasetId}`);

    // Get all documents in the dataset that need processing
    const documents = await this.documentRepository.find({
      where: { datasetId },
      select: ['id', 'name', 'indexingStatus'],
    });

    this.logger.log(
      `Found ${documents.length} documents in dataset ${datasetId}`,
    );

    let queuedJobs = 0;
    const processedDocuments: string[] = [];

    for (const document of documents) {
      // Skip documents that are already completed or in error state
      if (document.indexingStatus === 'completed') {
        this.logger.debug(`Skipping completed document: ${document.name}`);
        continue;
      }

      // Check if document has segments that need processing
      const segments = await this.segmentRepository.find({
        where: { documentId: document.id },
        select: ['id', 'status'],
      });

      if (segments.length === 0) {
        this.logger.debug(
          `Skipping document with no segments: ${document.name}`,
        );
        continue;
      }

      // Check if there are segments that need processing
      const needsProcessing = segments.some((segment) =>
        ['waiting', 'chunked', 'embedding'].includes(segment.status),
      );

      if (!needsProcessing) {
        this.logger.debug(
          `Skipping document with no segments needing processing: ${document.name}`,
        );
        continue;
      }

      try {
        // Queue a chunking job for this document
        await this.queueManager.addJob({
          type: 'chunking',
          data: {
            documentId: document.id,
            datasetId: datasetId,
            userId: 'system', // This should be the actual user ID in a real implementation
            embeddingConfig: {
              model: 'Xenova/bge-m3',
              provider: 'local',
            },
          },
        });

        queuedJobs++;
        processedDocuments.push(document.name);
        this.logger.log(`Queued chunking job for document: ${document.name}`);
      } catch (error) {
        this.logger.error(
          `Failed to queue job for document ${document.name}: ${error.message}`,
        );
      }
    }

    this.logger.log(
      `Resume complete: ${queuedJobs} jobs queued for ${processedDocuments.length} documents`,
    );

    return {
      clearedJobs: 0, // We'll get this from the queue clear operation
      queuedJobs,
      documents: processedDocuments,
    };
  }
}
