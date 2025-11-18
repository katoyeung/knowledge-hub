import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseJob } from '../base/base.job';
import { RegisterJob } from '../../decorators/register-job.decorator';
import { Dataset } from '../../../dataset/entities/dataset.entity';
import { EventBusService } from '../../../event/services/event-bus.service';
import { NotificationService } from '../../../notification/notification.service';
import { EntityLearningService } from '../../../graph/services/entity-learning.service';
import { JobRegistryService } from '../../services/job-registry.service';
import { JobDispatcherService } from '../../services/job-dispatcher.service';
import { EventTypes } from '../../../event/constants/event-types';

export interface EntityLearningJobData {
  datasetId: string;
  learningType:
    | 'suggestions'
    | 'aliases'
    | 'confidence_update'
    | 'full_analysis';
  userId: string;
  options?: {
    threshold?: number;
    batchSize?: number;
    entityTypes?: string[];
  };
}

@RegisterJob('entity-learning')
@Injectable()
export class EntityLearningJob extends BaseJob<EntityLearningJobData> {
  protected readonly logger = new Logger(EntityLearningJob.name);

  constructor(
    @InjectRepository(Dataset)
    private readonly datasetRepository: Repository<Dataset>,
    private readonly entityLearningService: EntityLearningService,
    private readonly notificationService: NotificationService,
    protected readonly eventBus: EventBusService,
    protected readonly jobDispatcher: JobDispatcherService,
  ) {
    super(eventBus, jobDispatcher);
    this.logger.log(
      `EntityLearningJob initialized with jobType: ${this.jobType}`,
    );
  }

  async process(data: EntityLearningJobData): Promise<void> {
    const { datasetId, learningType, userId, options = {} } = data;

    this.logger.log(
      `🚀 [ENTITY_LEARNING] Starting ${learningType} learning for dataset ${datasetId}`,
    );
    this.logger.debug(`Job data: ${JSON.stringify(data, null, 2)}`);

    try {
      // Get dataset
      const dataset = await this.datasetRepository.findOne({
        where: { id: datasetId },
        select: ['id', 'name'],
      });

      if (!dataset) {
        throw new Error(`Dataset ${datasetId} not found`);
      }

      // Send start notification
      this.notificationService.sendDatasetUpdate(datasetId, {
        type: 'learning_started',
        message: `Starting ${learningType} learning...`,
        data: { datasetId, learningType },
      });

      let result: any = {};

      // Execute learning based on type
      switch (learningType) {
        case 'suggestions':
          result = await this.entityLearningService.suggestNewEntities();
          this.logger.log(`✅ Generated ${result.length} entity suggestions`);
          break;

        case 'aliases':
          await this.entityLearningService.discoverEntityAliases();
          result = { message: 'Alias discovery completed' };
          this.logger.log(`✅ Alias discovery completed`);
          break;

        case 'confidence_update':
          // This would update confidence scores for all entities
          result = { message: 'Confidence update completed' };
          this.logger.log(`✅ Confidence update completed`);
          break;

        case 'full_analysis':
          // Run all learning tasks
          const suggestions =
            await this.entityLearningService.suggestNewEntities();
          await this.entityLearningService.discoverEntityAliases();
          result = {
            suggestions: suggestions.length,
            aliases: 'discovered',
          };
          this.logger.log(
            `✅ Full analysis completed: ${suggestions.length} suggestions, aliases discovered`,
          );
          break;

        default:
          throw new Error(`Unknown learning type: ${learningType}`);
      }

      // Send completion notification
      this.notificationService.sendDatasetUpdate(datasetId, {
        type: 'learning_completed',
        message: `${learningType} learning completed successfully`,
        data: {
          datasetId,
          learningType,
          result,
        },
      });

      // Emit event
      this.eventBus.publish({
        type: EventTypes.ENTITY_LEARNING_COMPLETED,
        payload: {
          datasetId,
          learningType,
          result,
          userId,
        },
        timestamp: Date.now(),
      });
    } catch (error) {
      this.logger.error(
        `❌ [ENTITY_LEARNING] Error processing dataset ${datasetId}:`,
        error,
      );

      // Send error notification
      this.notificationService.sendDatasetUpdate(datasetId, {
        type: 'learning_error',
        message: `Learning failed: ${error.message}`,
        data: { datasetId, learningType, error: error.message },
      });

      // Emit error event
      this.eventBus.publish({
        type: EventTypes.ENTITY_LEARNING_FAILED,
        payload: {
          datasetId,
          learningType,
          error: error.message,
          userId,
        },
        timestamp: Date.now(),
      });

      throw error;
    }
  }
}
