import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { HttpModule } from '@nestjs/axios';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule } from '@nestjs/config';
import { PipelineConfig } from './entities/pipeline-config.entity';
import { PipelineExecution } from './entities/pipeline-execution.entity';
import { WorkflowExecution } from './entities/workflow-execution.entity';
import { DocumentSegment } from '../dataset/entities/document-segment.entity';
import { AiProvider } from '../ai-provider/entities/ai-provider.entity';
import { Embedding } from '../dataset/entities/embedding.entity';
import { PipelineController } from './controllers/pipeline.controller';
import { PipelineOrchestrator } from './services/pipeline-orchestrator.service';
import { PipelineExecutor } from './services/pipeline-executor.service';
import { PipelineStepRegistry } from './services/pipeline-step-registry.service';
import { PipelineConfigService } from './services/pipeline-config.service';
import { NodeOutputCacheService } from './services/node-output-cache.service';
import { PipelineJob } from '../queue/jobs/pipeline/pipeline.job';

// Import pipeline steps
import { DuplicateSegmentStep } from './steps/duplicate-segment.step';
import { RuleBasedFilterStep } from './steps/rule-based-filter.step';
import { AiSummarizationStep } from './steps/ai-summarization.step';
import { EmbeddingGenerationStep } from './steps/embedding-generation.step';
import { GraphExtractionStep } from './steps/graph-extraction.step';
import { DataSourceStep } from './steps/datasource.step';

// Import required services
import { AiProviderService } from '../ai-provider/services/ai-provider.service';
import { LLMClientFactory } from '../ai-provider/services/llm-client-factory.service';
import { EmbeddingProcessingService } from '../dataset/services/embedding-processing.service';
import { EmbeddingV2Service } from '../dataset/services/embedding-v2.service';
import { EmbeddingClientFactory } from '../../common/services/embedding-client-factory.service';
import { ModelMappingService } from '../../common/services/model-mapping.service';
import { WorkerPoolService } from '../queue/jobs/document/worker-pool.service';
import { GraphExtractionService } from '../graph/services/graph-extraction.service';
import { JobDispatcherService } from '../queue/services/job-dispatcher.service';
import { EventBusService } from '../event/services/event-bus.service';
import { NotificationService } from '../notification/notification.service';
import { DatasetModule } from '../dataset/dataset.module';
import { EventModule } from '../event/event.module';
import { NotificationModule } from '../notification/notification.module';
import { QueueSharedModule } from '../queue/queue-shared.module';
import { QueueCoreModule } from '../queue/queue-core.module';
import { AiProviderModule } from '../ai-provider/ai-provider.module';
import { GraphModule } from '../graph/graph.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PipelineConfig,
      PipelineExecution,
      WorkflowExecution,
      DocumentSegment,
      AiProvider,
      Embedding,
    ]),
    HttpModule,
    CacheModule.register(),
    ConfigModule,
    forwardRef(() => DatasetModule),
    forwardRef(() => AiProviderModule),
    forwardRef(() => GraphModule),
    EventModule,
    NotificationModule,
    QueueSharedModule,
    forwardRef(() => QueueCoreModule),
    BullModule.registerQueue({
      name: 'default',
    }),
  ],
  controllers: [PipelineController],
  providers: [
    // Core services
    PipelineOrchestrator,
    PipelineExecutor,
    PipelineStepRegistry,
    PipelineConfigService,
    NodeOutputCacheService,

    // Pipeline steps
    DuplicateSegmentStep,
    RuleBasedFilterStep,
    AiSummarizationStep,
    EmbeddingGenerationStep,
    GraphExtractionStep,
    DataSourceStep,

    // Pipeline job
    PipelineJob,

    // Required dependencies (provided by imported modules)
    // AiProviderService, LLMClientFactory, EmbeddingProcessingService, etc. are provided by DatasetModule
  ],
  exports: [
    PipelineOrchestrator,
    PipelineExecutor,
    PipelineStepRegistry,
    PipelineConfigService,
    PipelineJob,
  ],
})
export class PipelineModule {
  constructor(
    private readonly stepRegistry: PipelineStepRegistry,
    private readonly duplicateSegmentStep: DuplicateSegmentStep,
    private readonly ruleBasedFilterStep: RuleBasedFilterStep,
    private readonly aiSummarizationStep: AiSummarizationStep,
    private readonly embeddingGenerationStep: EmbeddingGenerationStep,
    private readonly graphExtractionStep: GraphExtractionStep,
    private readonly dataSourceStep: DataSourceStep,
  ) {
    // Register all pipeline steps
    this.registerSteps();
  }

  private registerSteps(): void {
    this.stepRegistry.registerStep(this.duplicateSegmentStep);
    this.stepRegistry.registerStep(this.ruleBasedFilterStep);
    this.stepRegistry.registerStep(this.aiSummarizationStep);
    this.stepRegistry.registerStep(this.embeddingGenerationStep);
    this.stepRegistry.registerStep(this.graphExtractionStep);
    this.stepRegistry.registerStep(this.dataSourceStep);
  }
}
