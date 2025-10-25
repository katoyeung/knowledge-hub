import { Module, OnModuleInit, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkflowJob } from './workflow.job';
import { Workflow } from '../../../pipeline/entities/workflow.entity';
import { WorkflowExecution } from '../../../pipeline/entities/workflow-execution.entity';
import { WorkflowService } from '../../../pipeline/services/workflow.service';
import { WorkflowOrchestrator } from '../../../pipeline/services/workflow-orchestrator.service';
import { WorkflowExecutor } from '../../../pipeline/services/workflow-executor.service';
import { PipelineStepRegistry } from '../../../pipeline/services/pipeline-step-registry.service';
import { NodeOutputCacheService } from '../../../pipeline/services/node-output-cache.service';
import { DocumentSegment } from '../../../dataset/entities/document-segment.entity';
import { EventBusService } from '../../../event/services/event-bus.service';
import { NotificationService } from '../../../notification/notification.service';
import { DuplicateSegmentStep } from '../../../pipeline/steps/duplicate-segment.step';
import { RuleBasedFilterStep } from '../../../pipeline/steps/rule-based-filter.step';
import { AiSummarizationStep } from '../../../pipeline/steps/ai-summarization.step';
import { EmbeddingGenerationStep } from '../../../pipeline/steps/embedding-generation.step';
import { GraphExtractionStep } from '../../../pipeline/steps/graph-extraction.step';
import { AiProviderModule } from '../../../ai-provider/ai-provider.module';
import { PromptsModule } from '../../../prompts/prompts.module';
import { DatasetModule } from '../../../dataset/dataset.module';
import { GraphModule } from '../../../graph/graph.module';
import { EventModule } from '../../../event/event.module';
import { JobRegistryService } from '../../services/job-registry.service';
import { JobDispatcherService } from '../../services/job-dispatcher.service';
import { QueueManagerService } from '../../services/queue-manager.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'default',
    }),
    TypeOrmModule.forFeature([Workflow, WorkflowExecution, DocumentSegment]),
    forwardRef(() => AiProviderModule),
    forwardRef(() => PromptsModule),
    forwardRef(() => DatasetModule),
    forwardRef(() => GraphModule),
    EventModule,
  ],
  providers: [
    WorkflowJob,
    WorkflowService,
    WorkflowOrchestrator,
    WorkflowExecutor,
    PipelineStepRegistry,
    NodeOutputCacheService,
    EventBusService,
    NotificationService,
    JobRegistryService,
    JobDispatcherService,
    QueueManagerService,
    // Pipeline steps
    DuplicateSegmentStep,
    RuleBasedFilterStep,
    AiSummarizationStep,
    EmbeddingGenerationStep,
    GraphExtractionStep,
  ],
  exports: [WorkflowJob],
})
export class WorkflowJobsModule implements OnModuleInit {
  constructor(
    private readonly stepRegistry: PipelineStepRegistry,
    private readonly duplicateSegmentStep: DuplicateSegmentStep,
    private readonly ruleBasedFilterStep: RuleBasedFilterStep,
    private readonly aiSummarizationStep: AiSummarizationStep,
    private readonly embeddingGenerationStep: EmbeddingGenerationStep,
    private readonly graphExtractionStep: GraphExtractionStep,
    private readonly jobRegistry: JobRegistryService,
    private readonly workflowJob: WorkflowJob,
  ) {
    console.log('WorkflowJobsModule constructor called');
    console.log('WorkflowJob jobType:', this.workflowJob.jobType);
  }

  onModuleInit() {
    console.log('WorkflowJobsModule onModuleInit called');

    // Register pipeline steps
    this.stepRegistry.registerStep(this.duplicateSegmentStep);
    this.stepRegistry.registerStep(this.ruleBasedFilterStep);
    this.stepRegistry.registerStep(this.aiSummarizationStep);
    this.stepRegistry.registerStep(this.embeddingGenerationStep);
    this.stepRegistry.registerStep(this.graphExtractionStep);

    // Register workflow job
    console.log(
      'Registering WorkflowJob with jobType:',
      this.workflowJob.jobType,
    );
    this.jobRegistry.register(this.workflowJob);
    console.log('WorkflowJob registered successfully');
    console.log('Total registered jobs:', this.jobRegistry.getAllJobs().length);
  }
}
