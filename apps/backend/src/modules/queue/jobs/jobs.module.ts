import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { DocumentProcessingModule } from './document/document-processing.module';
import { DocumentJobsModule } from './document/document-jobs.module';
import { GraphJobsModule } from './graph/graph-jobs.module';
import { PipelineJobsModule } from './pipeline/pipeline-jobs.module';
import { WorkflowJobsModule } from './workflow/workflow-jobs.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'default',
    }),
    DocumentProcessingModule,
    DocumentJobsModule,
    GraphJobsModule,
    PipelineJobsModule,
    WorkflowJobsModule,
  ],
  providers: [],
  exports: [
    DocumentProcessingModule,
    DocumentJobsModule,
    GraphJobsModule,
    PipelineJobsModule,
    WorkflowJobsModule,
  ],
})
export class JobsModule {}
