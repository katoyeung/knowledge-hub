// src/modules/event/event.module.ts
import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { DocumentUploadHandler } from './handlers/document-upload.handler';
import { DocumentProcessingModule } from '../queue/jobs/document/document-processing.module';

@Module({
  imports: [EventEmitterModule.forRoot(), DocumentProcessingModule],
  providers: [DocumentUploadHandler],
  exports: [EventEmitterModule],
})
export class EventModule {}
