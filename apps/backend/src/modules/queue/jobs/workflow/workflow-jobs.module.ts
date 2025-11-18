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
import { HttpModule } from '@nestjs/axios';
import { Document } from '../../../dataset/entities/document.entity';
import { Dataset } from '../../../dataset/entities/dataset.entity';
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
    TypeOrmModule.forFeature([
      Workflow,
      WorkflowExecution,
      DocumentSegment,
      Document,
      Dataset,
    ]),
    HttpModule,
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
  ],
  exports: [WorkflowJob],
})
export class WorkflowJobsModule {
  // Jobs are now auto-registered via JobAutoLoaderService in JobsModule
  // No need to manually register jobs here
}
