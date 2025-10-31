import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { HttpModule } from '@nestjs/axios';
import { Workflow } from './entities/workflow.entity';
import { WorkflowExecution } from './entities/workflow-execution.entity';
import { DocumentSegment } from '../dataset/entities/document-segment.entity';
import { Document } from '../dataset/entities/document.entity';
import { Dataset } from '../dataset/entities/dataset.entity';
import { WorkflowController } from './controllers/workflow.controller';
import { WorkflowOrchestrator } from './services/workflow-orchestrator.service';
import { WorkflowExecutor } from './services/workflow-executor.service';
import { WorkflowService } from './services/workflow.service';
import { PipelineStepRegistry } from './services/pipeline-step-registry.service';
import { NodeOutputCacheService } from './services/node-output-cache.service';
import { WorkflowJob } from '../queue/jobs/workflow/workflow.job';
import { StepAutoLoaderService } from './services/step-auto-loader.service';
import { AiProviderModule } from '../ai-provider/ai-provider.module';
import { PromptsModule } from '../prompts/prompts.module';
import { DatasetModule } from '../dataset/dataset.module';
import { GraphModule } from '../graph/graph.module';
import { NotificationModule } from '../notification/notification.module';
import { EventModule } from '../event/event.module';
import { QueueSharedModule } from '../queue/queue-shared.module';
import { QueueCoreModule } from '../queue/queue-core.module';
import { ALL_STEP_CLASSES } from './steps/index';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Workflow,
      WorkflowExecution,
      DocumentSegment,
      Document,
      Dataset,
    ]),
    HttpModule,
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
    StepAutoLoaderService,

    // Pipeline steps - auto-loaded via index
    ...ALL_STEP_CLASSES,
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
  constructor(private readonly stepAutoLoader: StepAutoLoaderService) {}

  async onModuleInit() {
    // Automatically register all workflow steps
    await this.stepAutoLoader.loadAllSteps();
  }
}
