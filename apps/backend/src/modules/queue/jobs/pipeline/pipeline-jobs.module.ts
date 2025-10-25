import { Module, forwardRef, OnModuleInit } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PipelineJob } from './pipeline.job';
import { PipelineConfig } from '../../../pipeline/entities/pipeline-config.entity';
import { PipelineExecution } from '../../../pipeline/entities/pipeline-execution.entity';
import { DocumentSegment } from '../../../dataset/entities/document-segment.entity';
import { PipelineOrchestrator } from '../../../pipeline/services/pipeline-orchestrator.service';
import { JobDispatcherService } from '../../services/job-dispatcher.service';
import { QueueManagerService } from '../../services/queue-manager.service';
import { EventBusService } from '../../../event/services/event-bus.service';
import { NotificationService } from '../../../notification/notification.service';
import { PipelineConfigService } from '../../../pipeline/services/pipeline-config.service';
import { PipelineExecutor } from '../../../pipeline/services/pipeline-executor.service';
import { PipelineStepRegistry } from '../../../pipeline/services/pipeline-step-registry.service';
import { DatasetModule } from '../../../dataset/dataset.module';
import { EventModule } from '../../../event/event.module';
import { NotificationModule } from '../../../notification/notification.module';
import { AiProviderModule } from '../../../ai-provider/ai-provider.module';
import { GraphModule } from '../../../graph/graph.module';
import { DuplicateSegmentStep } from '../../../pipeline/steps/duplicate-segment.step';
import { RuleBasedFilterStep } from '../../../pipeline/steps/rule-based-filter.step';
import { AiSummarizationStep } from '../../../pipeline/steps/ai-summarization.step';
import { EmbeddingGenerationStep } from '../../../pipeline/steps/embedding-generation.step';
import { GraphExtractionStep } from '../../../pipeline/steps/graph-extraction.step';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'default',
    }),
    TypeOrmModule.forFeature([
      PipelineConfig,
      PipelineExecution,
      DocumentSegment,
    ]),
    forwardRef(() => DatasetModule),
    forwardRef(() => AiProviderModule),
    forwardRef(() => GraphModule),
    EventModule,
    NotificationModule,
  ],
  providers: [
    PipelineJob,
    PipelineOrchestrator,
    PipelineConfigService,
    PipelineExecutor,
    PipelineStepRegistry,
    JobDispatcherService,
    QueueManagerService,
    EventBusService,
    NotificationService,
    // Pipeline steps
    DuplicateSegmentStep,
    RuleBasedFilterStep,
    AiSummarizationStep,
    EmbeddingGenerationStep,
    GraphExtractionStep,
  ],
  exports: [PipelineJob],
})
export class PipelineJobsModule implements OnModuleInit {
  constructor(
    private readonly stepRegistry: PipelineStepRegistry,
    private readonly duplicateSegmentStep: DuplicateSegmentStep,
    private readonly ruleBasedFilterStep: RuleBasedFilterStep,
    private readonly aiSummarizationStep: AiSummarizationStep,
    private readonly embeddingGenerationStep: EmbeddingGenerationStep,
    private readonly graphExtractionStep: GraphExtractionStep,
  ) {}

  onModuleInit() {
    this.stepRegistry.registerStep(this.duplicateSegmentStep);
    this.stepRegistry.registerStep(this.ruleBasedFilterStep);
    this.stepRegistry.registerStep(this.aiSummarizationStep);
    this.stepRegistry.registerStep(this.embeddingGenerationStep);
    this.stepRegistry.registerStep(this.graphExtractionStep);
  }
}
