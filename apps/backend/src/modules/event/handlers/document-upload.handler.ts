import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { EventTypes } from '../constants/event-types';
import { DocumentUploadedEvent } from '../interfaces/document-events.interface';
// import { DocumentParseJobData } from '../../queue/jobs/document/document-parser.processor';

@Injectable()
export class DocumentUploadHandler {
  private readonly logger = new Logger(DocumentUploadHandler.name);

  constructor(
    @InjectQueue('document-processing')
    private readonly documentQueue: Queue,
  ) {}

  @OnEvent(EventTypes.DOCUMENT_UPLOADED)
  handleDocumentUploaded(event: DocumentUploadedEvent) {
    this.logger.log(
      `📄 Document uploaded: ${event.payload.documentId} in dataset ${event.payload.datasetId}`,
    );

    // Documents are now processed manually through the multi-step workflow
    // No automatic processing happens on upload
  }
}
