import { Injectable } from '@nestjs/common';
import { DocumentSegment } from '../../dataset/entities/document-segment.entity';
import {
  BaseStep,
  StepConfig,
  StepExecutionContext,
  StepExecutionResult,
} from './base.step';
import { GraphExtractionService } from '../../graph/services/graph-extraction.service';
import { CreateGraphExtractionConfigDto } from '../../graph/dto/create-graph-extraction-config.dto';

export interface GraphExtractionConfig extends StepConfig {
  promptId: string;
  aiProviderId: string;
  model?: string;
  temperature?: number;
  enableDeduplication?: boolean;
  batchSize?: number;
  confidenceThreshold?: number;
  extractRelations?: boolean;
  extractEntities?: boolean;
  entityTypes?: string[];
  relationTypes?: string[];
}

@Injectable()
export class GraphExtractionStep extends BaseStep {
  constructor(private readonly graphExtractionService: GraphExtractionService) {
    super('graph_extraction', 'Knowledge Graph Extraction');
  }

  async execute(
    inputSegments: DocumentSegment[],
    config: GraphExtractionConfig,
    context: StepExecutionContext,
  ): Promise<StepExecutionResult> {
    const startTime = new Date();
    this.logger.log(
      `Starting graph extraction for ${inputSegments.length} segments`,
    );

    try {
      // Filter segments that need graph extraction
      const segmentsToProcess = inputSegments.filter((segment) =>
        this.shouldProcessSegment(segment, config),
      );

      this.logger.log(
        `Found ${segmentsToProcess.length} segments eligible for graph extraction`,
      );

      if (segmentsToProcess.length === 0) {
        this.logger.log('No segments need graph extraction');
        return {
          success: true,
          outputSegments: inputSegments,
          metrics: this.calculateMetrics(
            inputSegments,
            inputSegments,
            startTime,
            new Date(),
          ),
          rollbackData: this.createRollbackData(inputSegments, config),
        };
      }

      // Create graph extraction configuration
      const extractionConfig: CreateGraphExtractionConfigDto = {
        promptId: config.promptId,
        aiProviderId: config.aiProviderId,
        model: config.model,
        temperature: config.temperature || 0.7,
        enableDeduplication: config.enableDeduplication !== false,
        batchSize: config.batchSize || 10,
        confidenceThreshold: config.confidenceThreshold || 0.7,
        // extractRelations: config.extractRelations !== false,
        // extractEntities: config.extractEntities !== false,
        // entityTypes: config.entityTypes,
        // relationTypes: config.relationTypes,
      };

      // Extract graph from segments
      const result = await this.graphExtractionService.extractFromSegments(
        segmentsToProcess.map((s) => s.id),
        context.datasetId || '',
        context.documentId || '',
        context.userId,
        extractionConfig,
      );

      const endTime = new Date();
      const metrics = this.calculateMetrics(
        inputSegments,
        inputSegments,
        startTime,
        endTime,
      );

      // Add specific metrics for graph extraction
      metrics.segmentsProcessed = segmentsToProcess.length;
      metrics.graphNodesCreated = result.nodesCreated;
      metrics.graphEdgesCreated = result.edgesCreated;
      metrics.graphExtractionRate =
        segmentsToProcess.length > 0
          ? (result.nodesCreated + result.edgesCreated) /
            segmentsToProcess.length
          : 0;

      this.logger.log(
        `Graph extraction completed: ${result.nodesCreated} nodes, ${result.edgesCreated} edges created`,
      );

      return {
        success: true,
        outputSegments: inputSegments, // Segments are not modified, graph data is stored separately
        metrics,
        rollbackData: this.createRollbackData(inputSegments, config),
      };
    } catch (error) {
      this.logger.error('Graph extraction failed:', error);
      return {
        success: false,
        outputSegments: inputSegments, // Return original segments on error
        metrics: this.calculateMetrics(
          inputSegments,
          inputSegments,
          startTime,
          new Date(),
        ),
        error: error.message,
        rollbackData: this.createRollbackData(inputSegments, config),
      };
    }
  }

  async validate(
    config: GraphExtractionConfig,
  ): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = [];

    if (!config.promptId) {
      errors.push('Prompt ID is required');
    }

    if (!config.aiProviderId) {
      errors.push('AI provider ID is required');
    }

    if (
      config.temperature !== undefined &&
      (config.temperature < 0 || config.temperature > 2)
    ) {
      errors.push('Temperature must be between 0 and 2');
    }

    if (config.batchSize !== undefined && config.batchSize <= 0) {
      errors.push('Batch size must be a positive number');
    }

    if (
      config.confidenceThreshold !== undefined &&
      (config.confidenceThreshold < 0 || config.confidenceThreshold > 1)
    ) {
      errors.push('Confidence threshold must be between 0 and 1');
    }

    if (
      config.entityTypes !== undefined &&
      !Array.isArray(config.entityTypes)
    ) {
      errors.push('Entity types must be an array');
    }

    if (
      config.relationTypes !== undefined &&
      !Array.isArray(config.relationTypes)
    ) {
      errors.push('Relation types must be an array');
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
    try {
      this.logger.log('Rolling back graph extraction step');
      // For graph extraction, rollback would involve removing created graph nodes and edges
      // This is complex and typically not needed as graph data doesn't break the pipeline
      return { success: true };
    } catch (error) {
      this.logger.error('Rollback failed:', error);
      return { success: false, error: error.message };
    }
  }

  getMetadata() {
    return {
      type: 'graph_extraction',
      name: 'Knowledge Graph Extraction',
      description:
        'Extract entities and relationships from document segments to build a knowledge graph',
      version: '1.0.0',
      inputTypes: ['document_segment'],
      outputTypes: ['document_segment'],
      configSchema: {
        type: 'object',
        properties: {
          promptId: {
            type: 'string',
            description: 'ID of the prompt to use for graph extraction',
          },
          aiProviderId: {
            type: 'string',
            description: 'ID of the AI provider to use',
          },
          model: {
            type: 'string',
            description: 'Model name to use for extraction',
          },
          temperature: {
            type: 'number',
            minimum: 0,
            maximum: 2,
            default: 0.7,
            description: 'Temperature for text generation',
          },
          enableDeduplication: {
            type: 'boolean',
            default: true,
            description: 'Whether to enable entity deduplication',
          },
          batchSize: {
            type: 'number',
            minimum: 1,
            default: 10,
            description: 'Number of segments to process in parallel',
          },
          confidenceThreshold: {
            type: 'number',
            minimum: 0,
            maximum: 1,
            default: 0.7,
            description: 'Minimum confidence threshold for extracted entities',
          },
          extractRelations: {
            type: 'boolean',
            default: true,
            description: 'Whether to extract relationships',
          },
          extractEntities: {
            type: 'boolean',
            default: true,
            description: 'Whether to extract entities',
          },
          entityTypes: {
            type: 'array',
            items: { type: 'string' },
            description: 'Specific entity types to extract',
          },
          relationTypes: {
            type: 'array',
            items: { type: 'string' },
            description: 'Specific relation types to extract',
          },
        },
        required: ['promptId', 'aiProviderId'],
      },
    };
  }

  private shouldProcessSegment(
    segment: DocumentSegment,
    config: GraphExtractionConfig,
  ): boolean {
    // Check if segment has content
    if (!segment.content || segment.content.trim().length === 0) {
      return false;
    }

    // Check if segment has embedding (graph extraction typically requires embeddings)
    if (!segment.embeddingId) {
      this.logger.debug(`Skipping segment ${segment.id} - no embedding found`);
      return false;
    }

    // Check segment status
    if (segment.status !== 'embedded' && segment.status !== 'completed') {
      return false;
    }

    // Check if segment already has graph data
    if (segment.graphExtractionStatus === 'completed') {
      this.logger.debug(
        `Skipping segment ${segment.id} - already processed for graph extraction`,
      );
      return false;
    }

    return true;
  }
}
