import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { EventTypes } from '../constants/event-types';
import { DocumentUploadedEvent } from '../interfaces/document-events.interface';
import { DocumentParseJobData } from '../../queue/jobs/document/document-parser.processor';

@Injectable()
export class DocumentUploadHandler {
  private readonly logger = new Logger(DocumentUploadHandler.name);

  constructor(
    @InjectQueue('document-processing')
    private readonly documentQueue: Queue,
  ) {}

  @OnEvent(EventTypes.DOCUMENT_UPLOADED)
  async handleDocumentUploaded(event: DocumentUploadedEvent) {
    this.logger.log(
      `Document uploaded event received for document ${event.payload.documentId}`,
    );
    this.logger.debug(`Event payload:`, JSON.stringify(event.payload, null, 2));

    try {
      // Create job data for document parsing
      const jobData: DocumentParseJobData = {
        documentId: event.payload.documentId,
        filePath: event.payload.filePath,
        userId: event.payload.userId,
      };

      this.logger.debug(
        `Creating job with data:`,
        JSON.stringify(jobData, null, 2),
      );

      // Add job to the queue with retry configuration
      const job = await this.documentQueue.add('parse-document', jobData, {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: 10, // Keep last 10 completed jobs
        removeOnFail: 50, // Keep last 50 failed jobs
      });

      this.logger.log(
        `Document parsing job queued for document ${event.payload.documentId} with job ID ${job.id}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to queue document parsing job for document ${event.payload.documentId}:`,
        error,
      );
    }
  }
}
