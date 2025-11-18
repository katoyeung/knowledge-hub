import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { Document } from '../../../dataset/entities/document.entity';
import { DocumentSegment } from '../../../dataset/entities/document-segment.entity';
import { Dataset } from '../../../dataset/entities/dataset.entity';
import { Embedding } from '../../../dataset/entities/embedding.entity';
import { ChunkingJob } from './chunking.job';
import { EmbeddingJob } from './embedding.job';
import { WorkerPoolService } from './worker-pool.service';
import { EmbeddingV2Service } from '../../../dataset/services/embedding-v2.service';
import { ModelMappingService } from '../../../../common/services/model-mapping.service';
import { EmbeddingClientFactory } from '../../../../common/services/embedding-client-factory.service';
import { ApiClientFactory } from '../../../../common/services/api-client-factory.service';
import { LocalEmbeddingClient } from '../../../../common/services/local-embedding-client.service';
import { OllamaEmbeddingClient } from '../../../../common/services/ollama-embedding-client.service';
import { DashScopeEmbeddingClient } from '../../../../common/services/dashscope-embedding-client.service';
import { OpenRouterApiClient } from '../../../../common/services/openrouter-api-client.service';
import { PerplexityApiClient } from '../../../../common/services/perplexity-api-client.service';
import { OllamaApiClient } from '../../../../common/services/ollama-api-client.service';
import { LocalModelApiClient } from '../../../../common/services/local-model-api-client.service';
import { LocalLLMClient } from '../../../../common/services/local-llm-client.service';
import { DashScopeApiClient } from '../../../../common/services/dashscope-api-client.service';
import { LocalLLMService } from '../../../../common/services/local-llm.service';
import { ChunkingService } from '../../../dataset/services/chunking.service';
import { PostContentTransformerService } from '../../../dataset/services/post-content-transformer.service';
import { EmbeddingProcessingService } from '../../../dataset/services/embedding-processing.service';
import { DocumentParserModule } from '../../../document-parser/document-parser.module';
import { CsvConnectorModule } from '../../../csv-connector/csv-connector.module';
import { DetectorService } from '../../../../common/services/detector.service';
import { JobDispatcherService } from '../../services/job-dispatcher.service';
import { QueueManagerService } from '../../services/queue-manager.service';
import { EventBusService } from '../../../event/services/event-bus.service';
import { NotificationService } from '../../../notification/notification.service';
import { WorkflowJob } from '../workflow/workflow.job';
import { Workflow } from '../../../pipeline/entities/workflow.entity';
import { WorkflowExecution } from '../../../pipeline/entities/workflow-execution.entity';
import { WorkflowService } from '../../../pipeline/services/workflow.service';
import { WorkflowOrchestrator } from '../../../pipeline/services/workflow-orchestrator.service';
import { WorkflowExecutor } from '../../../pipeline/services/workflow-executor.service';
import { PipelineStepRegistry } from '../../../pipeline/services/pipeline-step-registry.service';
import { NodeOutputCacheService } from '../../../pipeline/services/node-output-cache.service';
import { DuplicateSegmentStep } from '../../../pipeline/steps/duplicate-segment.step';
import { RuleBasedFilterStep } from '../../../pipeline/steps/rule-based-filter.step';
import { AiSummarizationStep } from '../../../pipeline/steps/ai-summarization.step';
import { EmbeddingGenerationStep } from '../../../pipeline/steps/embedding-generation.step';
import { GraphExtractionStep } from '../../../pipeline/steps/graph-extraction.step';
import { DataSourceStep } from '../../../pipeline/steps/datasource.step';
import { DocumentSegmentService } from '../../../dataset/document-segment.service';
import { DocumentService } from '../../../dataset/document.service';
import { AiProviderModule } from '../../../ai-provider/ai-provider.module';
import { PromptsModule } from '../../../prompts/prompts.module';
import { GraphModule } from '../../../graph/graph.module';
import { EventModule } from '../../../event/event.module';
import { PostsModule } from '../../../posts/posts.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Document,
      DocumentSegment,
      Dataset,
      Embedding,
      Workflow,
      WorkflowExecution,
    ]),
    DocumentParserModule,
    CsvConnectorModule,
    HttpModule,
    ConfigModule,
    CacheModule.register(),
    BullModule.registerQueue({
      name: 'default',
    }),
    forwardRef(() => AiProviderModule),
    forwardRef(() => PromptsModule),
    forwardRef(() => GraphModule),
    EventModule,
    PostsModule,
  ],
  providers: [
    ChunkingJob,
    EmbeddingJob,
    WorkerPoolService,
    JobDispatcherService,
    QueueManagerService,
    EventBusService,
    NotificationService,
    // Add the services that the jobs need
    PostContentTransformerService,
    ChunkingService,
    EmbeddingProcessingService,
    EmbeddingV2Service,
    ModelMappingService,
    DetectorService,
    EmbeddingClientFactory,
    ApiClientFactory,
    LocalEmbeddingClient,
    OllamaEmbeddingClient,
    DashScopeEmbeddingClient,
    OpenRouterApiClient,
    PerplexityApiClient,
    OllamaApiClient,
    LocalModelApiClient,
    LocalLLMClient,
    DashScopeApiClient,
    LocalLLMService,
    WorkflowJob,
    // WorkflowJob dependencies
    WorkflowService,
    WorkflowOrchestrator,
    WorkflowExecutor,
    PipelineStepRegistry,
    NodeOutputCacheService,
    DuplicateSegmentStep,
    RuleBasedFilterStep,
    AiSummarizationStep,
    EmbeddingGenerationStep,
    GraphExtractionStep,
    DataSourceStep,
    DocumentSegmentService,
    DocumentService,
  ],
  exports: [ChunkingJob, EmbeddingJob, WorkerPoolService, WorkflowJob],
})
export class DocumentJobsModule {
  constructor(
    private readonly dataSourceStep: DataSourceStep,
    private readonly stepRegistry: PipelineStepRegistry,
    private readonly duplicateSegmentStep: DuplicateSegmentStep,
    private readonly ruleBasedFilterStep: RuleBasedFilterStep,
    private readonly aiSummarizationStep: AiSummarizationStep,
    private readonly embeddingGenerationStep: EmbeddingGenerationStep,
    private readonly graphExtractionStep: GraphExtractionStep,
  ) {
    // Jobs are now auto-registered via JobAutoLoaderService in JobsModule
    // No need to manually register jobs here

    // Register pipeline steps
    this.stepRegistry.registerStep(this.duplicateSegmentStep);
    this.stepRegistry.registerStep(this.ruleBasedFilterStep);
    this.stepRegistry.registerStep(this.aiSummarizationStep);
    this.stepRegistry.registerStep(this.embeddingGenerationStep);
    this.stepRegistry.registerStep(this.graphExtractionStep);
    this.stepRegistry.registerStep(this.dataSourceStep);
  }
}
