import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { DocumentProcessingModule } from './document/document-processing.module';
import { DocumentJobsModule } from './document/document-jobs.module';
import { GraphJobsModule } from './graph/graph-jobs.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'default',
    }),
    DocumentProcessingModule,
    DocumentJobsModule,
    GraphJobsModule,
  ],
  providers: [],
  exports: [DocumentProcessingModule, DocumentJobsModule, GraphJobsModule],
})
export class JobsModule {}
