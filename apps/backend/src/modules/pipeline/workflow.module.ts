import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { Workflow } from './entities/workflow.entity';
import { WorkflowExecution } from './entities/workflow-execution.entity';
import { DocumentSegment } from '../dataset/entities/document-segment.entity';
import { WorkflowController } from './controllers/workflow.controller';
import { WorkflowOrchestrator } from './services/workflow-orchestrator.service';
import { WorkflowExecutor } from './services/workflow-executor.service';
import { WorkflowService } from './services/workflow.service';
import { PipelineStepRegistry } from './services/pipeline-step-registry.service';
import { NodeOutputCacheService } from './services/node-output-cache.service';
import { WorkflowJob } from '../queue/jobs/workflow/workflow.job';

// Import pipeline steps
import { DuplicateSegmentStep } from './steps/duplicate-segment.step';
import { RuleBasedFilterStep } from './steps/rule-based-filter.step';
import { AiSummarizationStep } from './steps/ai-summarization.step';
import { EmbeddingGenerationStep } from './steps/embedding-generation.step';
import { GraphExtractionStep } from './steps/graph-extraction.step';
import { DataSourceStep } from './steps/datasource.step';
import { TriggerManualStep } from './steps/trigger-manual.step';
import { TriggerScheduleStep } from './steps/trigger-schedule.step';
import { TestStep } from './steps/test.step';

// Import other modules/services that workflow depends on
import { AiProviderModule } from '../ai-provider/ai-provider.module';
import { PromptsModule } from '../prompts/prompts.module';
import { DatasetModule } from '../dataset/dataset.module';
import { GraphModule } from '../graph/graph.module';
import { NotificationModule } from '../notification/notification.module';
import { EventModule } from '../event/event.module';
import { QueueSharedModule } from '../queue/queue-shared.module';
import { QueueCoreModule } from '../queue/queue-core.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Workflow, WorkflowExecution, DocumentSegment]),
    AiProviderModule,
    PromptsModule,
    DatasetModule,
    GraphModule,
    NotificationModule,
    EventModule,
    QueueSharedModule,
    QueueCoreModule,
    BullModule.registerQueue({
      name: 'default',
    }),
  ],
  controllers: [WorkflowController],
  providers: [
    // Core services
    WorkflowOrchestrator,
    WorkflowExecutor,
    WorkflowService,
    PipelineStepRegistry,
    NodeOutputCacheService,
    WorkflowJob,

    // Repositories
    // DocumentSegmentRepository,
    // DocumentRepository,
    // EmbeddingRepository,

    // Pipeline steps
    DuplicateSegmentStep,
    RuleBasedFilterStep,
    AiSummarizationStep,
    EmbeddingGenerationStep,
    GraphExtractionStep,
    DataSourceStep,
    TriggerManualStep,
    TriggerScheduleStep,
    TestStep,

    // Services are provided by imported modules
  ],
  exports: [
    WorkflowOrchestrator,
    WorkflowExecutor,
    WorkflowService,
    PipelineStepRegistry,
    WorkflowJob,
  ],
})
export class WorkflowModule implements OnModuleInit {
  constructor(
    private readonly stepRegistry: PipelineStepRegistry,
    private readonly duplicateSegmentStep: DuplicateSegmentStep,
    private readonly ruleBasedFilterStep: RuleBasedFilterStep,
    private readonly aiSummarizationStep: AiSummarizationStep,
    private readonly embeddingGenerationStep: EmbeddingGenerationStep,
    private readonly graphExtractionStep: GraphExtractionStep,
    private readonly dataSourceStep: DataSourceStep,
    private readonly triggerManualStep: TriggerManualStep,
    private readonly triggerScheduleStep: TriggerScheduleStep,
    private readonly testStep: TestStep,
  ) {}

  onModuleInit() {
    this.stepRegistry.registerStep(this.duplicateSegmentStep);
    this.stepRegistry.registerStep(this.ruleBasedFilterStep);
    this.stepRegistry.registerStep(this.aiSummarizationStep);
    this.stepRegistry.registerStep(this.embeddingGenerationStep);
    this.stepRegistry.registerStep(this.graphExtractionStep);
    this.stepRegistry.registerStep(this.dataSourceStep);
    this.stepRegistry.registerStep(this.triggerManualStep);
    this.stepRegistry.registerStep(this.triggerScheduleStep);
    this.stepRegistry.registerStep(this.testStep);
  }
}
