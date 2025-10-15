import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { DocumentProcessingModule } from './document/document-processing.module';
import { DocumentJobsModule } from './document/document-jobs.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'default',
    }),
    DocumentProcessingModule,
    DocumentJobsModule,
  ],
  providers: [],
  exports: [DocumentProcessingModule, DocumentJobsModule],
})
export class JobsModule {}
