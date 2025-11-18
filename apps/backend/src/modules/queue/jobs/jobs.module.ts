import { Module, OnModuleInit } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { DocumentProcessingModule } from './document/document-processing.module';
import { DocumentJobsModule } from './document/document-jobs.module';
import { GraphJobsModule } from './graph/graph-jobs.module';
import { PipelineJobsModule } from './pipeline/pipeline-jobs.module';
import { WorkflowJobsModule } from './workflow/workflow-jobs.module';
import { PostsJobsModule } from './posts/posts-jobs.module';
import { LLMProcessingJobsModule } from './llm-processing/llm-processing-jobs.module';
import { JobAutoLoaderService } from '../services/job-auto-loader.service';

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
    PostsJobsModule,
    LLMProcessingJobsModule,
  ],
  providers: [JobAutoLoaderService],
  exports: [
    DocumentProcessingModule,
    DocumentJobsModule,
    GraphJobsModule,
    PipelineJobsModule,
    WorkflowJobsModule,
    PostsJobsModule,
    LLMProcessingJobsModule,
    JobAutoLoaderService,
  ],
})
export class JobsModule implements OnModuleInit {
  constructor(private readonly jobAutoLoader: JobAutoLoaderService) {}

  async onModuleInit() {
    // Automatically register all jobs
    await this.jobAutoLoader.loadAllJobs();
  }
}
