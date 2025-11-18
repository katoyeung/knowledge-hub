import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseJob } from '../base/base.job';
import { RegisterJob } from '../../decorators/register-job.decorator';
import { Dataset } from '../../../dataset/entities/dataset.entity';
import { EventBusService } from '../../../event/services/event-bus.service';
import { NotificationService } from '../../../notification/notification.service';
import { EntityNormalizationService } from '../../../graph/services/entity-normalization.service';
import { JobRegistryService } from '../../services/job-registry.service';
import { JobDispatcherService } from '../../services/job-dispatcher.service';
import { EventTypes } from '../../../event/constants/event-types';

export interface EntityNormalizationJobData {
  datasetId: string;
  nodeIds?: string[];
  nodeType?: string;
  similarityThreshold?: number;
  batchSize?: number;
  userId: string;
}

@RegisterJob('entity-normalization')
@Injectable()
export class EntityNormalizationJob extends BaseJob<EntityNormalizationJobData> {
  protected readonly logger = new Logger(EntityNormalizationJob.name);

  constructor(
    @InjectRepository(Dataset)
    private readonly datasetRepository: Repository<Dataset>,
    private readonly entityNormalizationService: EntityNormalizationService,
    private readonly notificationService: NotificationService,
    protected readonly eventBus: EventBusService,
    protected readonly jobDispatcher: JobDispatcherService,
  ) {
    super(eventBus, jobDispatcher);
    this.logger.log(
      `EntityNormalizationJob initialized with jobType: ${this.jobType}`,
    );
  }

  async process(data: EntityNormalizationJobData): Promise<void> {
    const {
      datasetId,
      nodeIds,
      nodeType,
      similarityThreshold,
      batchSize,
      userId,
    } = data;

    this.logger.log(
      `🚀 [ENTITY_NORMALIZATION] Starting normalization for dataset ${datasetId}`,
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
        type: 'normalization_started',
        message: 'Starting entity normalization...',
        data: { datasetId, nodeIds, nodeType },
      });

      // Run normalization
      const result = await this.entityNormalizationService.normalizeNodesByKey(
        datasetId,
        nodeIds || [],
        {
          nodeIds,
          entityType: nodeType as any,
          similarityThreshold: similarityThreshold || 0.8,
        },
      );

      this.logger.log(
        `✅ Entity normalization completed: ${result.normalized} normalized, ${result.duplicates.length} duplicates found`,
      );

      // Send completion notification
      this.notificationService.sendDatasetUpdate(datasetId, {
        type: 'normalization_completed',
        message: `Normalization completed: ${result.normalized} normalized, ${result.duplicates.length} duplicates found`,
        data: {
          datasetId,
          normalized: result.normalized,
          duplicates: result.duplicates.length,
          errors: result.errors.length,
        },
      });

      // Emit event
      this.eventBus.publish({
        type: EventTypes.ENTITY_NORMALIZATION_COMPLETED,
        payload: {
          datasetId,
          result,
          userId,
        },
        timestamp: Date.now(),
      });
    } catch (error) {
      this.logger.error(
        `❌ [ENTITY_NORMALIZATION] Error processing dataset ${datasetId}:`,
        error,
      );

      // Send error notification
      this.notificationService.sendDatasetUpdate(datasetId, {
        type: 'normalization_error',
        message: `Normalization failed: ${error.message}`,
        data: { datasetId, error: error.message },
      });

      // Emit error event
      this.eventBus.publish({
        type: EventTypes.ENTITY_NORMALIZATION_FAILED,
        payload: {
          datasetId,
          error: error.message,
          userId,
        },
        timestamp: Date.now(),
      });

      throw error;
    }
  }
}
