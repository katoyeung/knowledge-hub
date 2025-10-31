import { Injectable, Logger } from '@nestjs/common';
import {
  BaseStep,
  StepConfig,
  StepExecutionContext,
  StepExecutionResult,
} from './base.step';
import { DocumentSegment } from '../../dataset/entities/document-segment.entity';
import { DocumentSegmentService } from '../../dataset/document-segment.service';
import { DocumentService } from '../../dataset/document.service';

export interface DataSourceConfig extends StepConfig {
  sourceType: 'dataset';
  datasetId?: string;
  documentId?: string;
  segmentId?: string;
  limit?: number;
  offset?: number;
}

@Injectable()
export class DataSourceStep extends BaseStep {
  constructor(
    private readonly documentSegmentService: DocumentSegmentService,
    private readonly documentService: DocumentService,
  ) {
    super('datasource', 'Data Source');
  }

  protected async executeStep(
    _inputSegments: DocumentSegment[],
    _config: any,
    _context: any,
  ): Promise<DocumentSegment[]> {
    this.logger.warn('executeStep() not yet migrated - using old execute()');
    return [];
  }

  async execute(
    inputSegments: DocumentSegment[],
    config: DataSourceConfig,
    context: StepExecutionContext,
  ): Promise<StepExecutionResult> {
    const startTime = new Date();
    this.logger.log(
      `Executing data source step with config: ${JSON.stringify(config)}`,
    );

    try {
      let outputSegments: DocumentSegment[] = [];

      switch (config.sourceType) {
        case 'dataset':
          outputSegments = await this.loadFromDatasetHierarchy(config, context);
          break;
        default:
          throw new Error(`Unsupported source type: ${config.sourceType}`);
      }

      // Apply pagination if specified
      if (config.limit || config.offset) {
        const offset = config.offset || 0;
        const limit = config.limit || outputSegments.length;
        outputSegments = outputSegments.slice(offset, offset + limit);
      }

      const endTime = new Date();
      const metrics = this.calculateMetrics(
        inputSegments,
        outputSegments,
        startTime,
        endTime,
      );

      this.logger.log(
        `Data source step completed. Loaded ${outputSegments.length} segments`,
      );

      return {
        success: true,
        outputSegments,
        metrics: {
          ...metrics,
          sourceType: config.sourceType,
          loadedCount: outputSegments.length,
        },
      };
    } catch (error) {
      this.logger.error(
        `Data source step failed: ${error.message}`,
        error.stack,
      );
      return {
        success: false,
        outputSegments: [],
        metrics: this.calculateMetrics(
          inputSegments,
          [],
          startTime,
          new Date(),
        ),
        error: error.message,
      };
    }
  }

  async validate(
    config: DataSourceConfig,
  ): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = [];

    if (!config.sourceType) {
      errors.push('Source type is required');
    }

    if (config.sourceType !== 'dataset') {
      errors.push('Invalid source type. Must be: dataset');
    }

    switch (config.sourceType) {
      case 'dataset':
        if (!config.datasetId) {
          errors.push('Dataset ID is required for dataset source type');
        }
        break;
    }

    if (config.limit && config.limit < 0) {
      errors.push('Limit must be a positive number');
    }

    if (config.offset && config.offset < 0) {
      errors.push('Offset must be a positive number');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  async rollback(
    rollbackData: any,
    context: StepExecutionContext,
  ): Promise<{ success: boolean; error?: string }> {
    // Data source steps are typically read-only, so no rollback needed
    this.logger.log('Data source step rollback - no action needed');
    return { success: true };
  }

  getMetadata() {
    return {
      type: 'datasource',
      name: 'Data Source',
      description:
        'Loads data from various sources (dataset, documents, segments, or custom data)',
      version: '1.0.0',
      inputTypes: [], // Data source nodes don't have input segments
      outputTypes: ['document_segments'],
      configSchema: {
        type: 'object',
        properties: {
          sourceType: {
            type: 'string',
            enum: ['dataset'],
            description: 'Type of data source to load from',
          },
          datasetId: {
            type: 'string',
            description: 'Dataset ID (required for dataset source type)',
          },
          documentId: {
            type: 'string',
            description:
              'Document ID (optional - filters to specific document)',
          },
          segmentId: {
            type: 'string',
            description: 'Segment ID (optional - filters to specific segment)',
          },
          limit: {
            type: 'number',
            minimum: 0,
            description: 'Maximum number of segments to load',
          },
          offset: {
            type: 'number',
            minimum: 0,
            description: 'Number of segments to skip',
          },
        },
        required: ['sourceType'],
      },
    };
  }

  private async loadFromDatasetHierarchy(
    config: DataSourceConfig,
    context: StepExecutionContext,
  ): Promise<DocumentSegment[]> {
    if (!config.datasetId) {
      throw new Error('Dataset ID is required for dataset source type');
    }

    let segments: DocumentSegment[] = [];

    // If specific segment is selected, load only that segment
    if (config.segmentId) {
      const segment = await this.documentSegmentService.findOne({
        where: {
          id: config.segmentId,
          datasetId: config.datasetId,
        },
      });
      if (segment) {
        segments = [segment];
      }
    }
    // If specific document is selected, load all segments from that document
    else if (config.documentId) {
      segments = await this.documentSegmentService.findByDocumentId(
        config.documentId,
      );
    }
    // Otherwise, load all segments from the dataset
    else {
      segments = await this.documentSegmentService.findByDatasetId(
        config.datasetId,
      );
    }

    return segments;
  }
}
