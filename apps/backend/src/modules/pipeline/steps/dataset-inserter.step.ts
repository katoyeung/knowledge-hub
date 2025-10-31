import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  BaseStep,
  StepConfig,
  StepExecutionContext,
  StepExecutionResult,
} from './base.step';
import { DocumentSegment } from '../../dataset/entities/document-segment.entity';
import { Document } from '../../dataset/entities/document.entity';
import { Dataset } from '../../dataset/entities/dataset.entity';

export interface DatasetInserterConfig extends StepConfig {
  datasetId: string;
  documentId: string;
  segmentType?: string;
  batchSize?: number;
}

@Injectable()
export class DatasetInserterStep extends BaseStep {
  constructor(
    @InjectRepository(DocumentSegment)
    private readonly segmentRepository: Repository<DocumentSegment>,
    @InjectRepository(Document)
    private readonly documentRepository: Repository<Document>,
    @InjectRepository(Dataset)
    private readonly datasetRepository: Repository<Dataset>,
  ) {
    super('dataset_inserter', 'Dataset Inserter');
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
    config: DatasetInserterConfig,
    context: StepExecutionContext,
  ): Promise<StepExecutionResult> {
    const startTime = new Date();
    this.logger.log(
      `Inserting ${inputSegments.length} segments into dataset ${config.datasetId}`,
    );

    try {
      // Validate dataset and document exist
      await this.validateDatasource(config, context);

      // Get current segment count for positioning
      const currentCount = await this.getCurrentSegmentCount(
        config.datasetId,
        config.documentId,
      );

      // Transform input segments to entities
      const segmentsToInsert = inputSegments.map((segment, index) => {
        return this.segmentRepository.create({
          datasetId: config.datasetId,
          documentId: config.documentId,
          position: currentCount + index + 1,
          content: segment.content || '',
          wordCount: segment.wordCount || 0,
          tokens: segment.tokens || 0,
          keywords: segment.keywords || {},
          status: 'waiting',
          enabled: true,
          userId: context.userId,
          segmentType: config.segmentType || 'api_import',
          hierarchyLevel: segment.hierarchyLevel || 1,
          childCount: segment.childCount || 0,
          hierarchyMetadata: segment.hierarchyMetadata || {},
        });
      });

      // Save segments in batches
      const batchSize = config.batchSize || 100;
      const savedSegments: DocumentSegment[] = [];

      for (let i = 0; i < segmentsToInsert.length; i += batchSize) {
        const batch = segmentsToInsert.slice(i, i + batchSize);
        const saved = await this.segmentRepository.save(batch);
        savedSegments.push(...saved);
        this.logger.log(
          `Inserted batch ${i / batchSize + 1}, total: ${savedSegments.length}/${segmentsToInsert.length}`,
        );
      }

      // Update document position if needed
      await this.updateDocumentPosition(
        config.documentId,
        currentCount + inputSegments.length,
      );

      const endTime = new Date();
      const metrics = this.calculateMetrics(
        inputSegments,
        savedSegments,
        startTime,
        endTime,
      );

      this.logger.log(
        `Dataset inserter completed. Inserted ${savedSegments.length} segments`,
      );

      return {
        success: true,
        outputSegments: savedSegments,
        metrics: {
          ...metrics,
          datasetId: config.datasetId,
          documentId: config.documentId,
          segmentsInserted: savedSegments.length,
        },
      };
    } catch (error) {
      this.logger.error(
        `Dataset inserter failed: ${error.message}`,
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
    config: DatasetInserterConfig,
  ): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = [];

    if (!config.datasetId) {
      errors.push('Dataset ID is required');
    }

    if (!config.documentId) {
      errors.push('Document ID is required');
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
    // In a real scenario, you might want to delete inserted segments
    this.logger.log('Dataset inserter rollback - segments already inserted');
    return { success: true };
  }

  getMetadata() {
    return {
      type: 'dataset_inserter',
      name: 'Dataset Inserter',
      description:
        'Inserts document segments into a specified dataset and document',
      version: '1.0.0',
      inputTypes: ['document_segments'],
      outputTypes: ['document_segments'],
      configSchema: {
        type: 'object',
        properties: {
          datasetId: {
            type: 'string',
            description: 'Target dataset ID',
          },
          documentId: {
            type: 'string',
            description: 'Target document ID',
          },
          segmentType: {
            type: 'string',
            description: 'Type of segments to insert',
          },
          batchSize: {
            type: 'number',
            description: 'Number of segments to insert per batch',
          },
        },
        required: ['datasetId', 'documentId'],
      },
    };
  }

  private async validateDatasource(
    config: DatasetInserterConfig,
    context: StepExecutionContext,
  ): Promise<void> {
    // Check if dataset exists
    const dataset = await this.datasetRepository.findOne({
      where: { id: config.datasetId },
    });
    if (!dataset) {
      throw new Error(`Dataset not found: ${config.datasetId}`);
    }

    // Check if document exists
    const document = await this.documentRepository.findOne({
      where: { id: config.documentId },
    });
    if (!document) {
      throw new Error(`Document not found: ${config.documentId}`);
    }

    // Verify document belongs to dataset
    if (document.datasetId !== config.datasetId) {
      throw new Error(
        `Document ${config.documentId} does not belong to dataset ${config.datasetId}`,
      );
    }

    this.logger.log(
      `Validated datasource: dataset=${config.datasetId}, document=${config.documentId}`,
    );
  }

  private async getCurrentSegmentCount(
    datasetId: string,
    documentId: string,
  ): Promise<number> {
    const count = await this.segmentRepository.count({
      where: {
        datasetId,
        documentId,
      },
    });
    return count;
  }

  private async updateDocumentPosition(
    documentId: string,
    newPosition: number,
  ): Promise<void> {
    // Optional: Update document metadata to reflect latest segment position
    // This could be useful for tracking document completion status
  }
}
