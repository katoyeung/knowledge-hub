import { Module, forwardRef, OnModuleInit } from '@nestjs/common';
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
import { PipelineStepRegistry } from './services/pipeline-step-registry.service';
import { PipelineOrchestrator } from './services/pipeline-orchestrator.service';
import { PipelineExecutor } from './services/pipeline-executor.service';
import { PipelineConfigService } from './services/pipeline-config.service';
import { NodeOutputCacheService } from './services/node-output-cache.service';
import { PipelineJob } from '../queue/jobs/pipeline/pipeline.job';
import { StepAutoLoaderService } from './services/step-auto-loader.service';
import { DatasetModule } from '../dataset/dataset.module';
import { EventModule } from '../event/event.module';
import { NotificationModule } from '../notification/notification.module';
import { QueueSharedModule } from '../queue/queue-shared.module';
import { QueueCoreModule } from '../queue/queue-core.module';
import { AiProviderModule } from '../ai-provider/ai-provider.module';
import { GraphModule } from '../graph/graph.module';
import { ALL_STEP_CLASSES } from './steps/index';

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
    PipelineStepRegistry,
    PipelineOrchestrator,
    PipelineExecutor,
    PipelineConfigService,
    NodeOutputCacheService,
    StepAutoLoaderService,

    // Pipeline steps - auto-loaded via index
    ...ALL_STEP_CLASSES,

    // Pipeline job
    PipelineJob,
  ],
  exports: [
    PipelineOrchestrator,
    PipelineExecutor,
    PipelineConfigService,
    PipelineJob,
  ],
})
export class PipelineModule implements OnModuleInit {
  constructor(private readonly stepAutoLoader: StepAutoLoaderService) {}

  async onModuleInit() {
    // Automatically register all pipeline steps
    await this.stepAutoLoader.loadAllSteps();
  }
}
