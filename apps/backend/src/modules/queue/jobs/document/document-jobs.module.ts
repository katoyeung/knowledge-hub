import { Module } from '@nestjs/common';
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
import { NerJob } from './ner.job';
import { WorkerPoolService } from './worker-pool.service';
import { JobRegistryService } from '../../services/job-registry.service';
import { EmbeddingV2Service } from '../../../dataset/services/embedding-v2.service';
import { ModelMappingService } from '../../../../common/services/model-mapping.service';
import { EntityExtractionService } from '../../../dataset/services/entity-extraction.service';
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
import { EmbeddingProcessingService } from '../../../dataset/services/embedding-processing.service';
import { NerProcessingService } from '../../../dataset/services/ner-processing.service';
import { DocumentParserModule } from '../../../document-parser/document-parser.module';
import { DetectorService } from '../../../../common/services/detector.service';
import { DatasetModule } from '../../../dataset/dataset.module';
import { JobDispatcherService } from '../../services/job-dispatcher.service';
import { QueueManagerService } from '../../services/queue-manager.service';
import { EventBusService } from '../../../event/services/event-bus.service';
import { NotificationService } from '../../../notification/notification.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Document, DocumentSegment, Dataset, Embedding]),
    DocumentParserModule,
    HttpModule,
    ConfigModule,
    CacheModule.register(),
    BullModule.registerQueue({
      name: 'default',
    }),
  ],
  providers: [
    ChunkingJob,
    EmbeddingJob,
    NerJob,
    WorkerPoolService,
    JobDispatcherService,
    QueueManagerService,
    EventBusService,
    NotificationService,
    // Add the services that the jobs need
    ChunkingService,
    EmbeddingProcessingService,
    NerProcessingService,
    EmbeddingV2Service,
    ModelMappingService,
    EntityExtractionService,
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
  ],
  exports: [ChunkingJob, EmbeddingJob, NerJob, WorkerPoolService],
})
export class DocumentJobsModule {
  constructor(
    private readonly jobRegistry: JobRegistryService,
    private readonly chunkingJob: ChunkingJob,
    private readonly embeddingJob: EmbeddingJob,
    private readonly nerJob: NerJob,
  ) {
    console.log('DocumentJobsModule constructor called');
    console.log('ChunkingJob jobType:', this.chunkingJob.jobType);
    console.log('EmbeddingJob jobType:', this.embeddingJob.jobType);
    console.log('NerJob jobType:', this.nerJob.jobType);

    // Register jobs with the registry
    this.jobRegistry.register(this.chunkingJob);
    this.jobRegistry.register(this.embeddingJob);
    this.jobRegistry.register(this.nerJob);

    console.log(
      'Jobs registered. Total jobs:',
      this.jobRegistry.getAllJobs().length,
    );
  }
}
