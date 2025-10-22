import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Prompt } from '../../prompts/entities/prompt.entity';
import { Dataset } from '../../dataset/entities/dataset.entity';
import { Document } from '../../dataset/entities/document.entity';

@Injectable()
export class GraphPromptSelectorService {
  private readonly logger = new Logger(GraphPromptSelectorService.name);

  constructor(
    @InjectRepository(Prompt)
    private readonly promptRepository: Repository<Prompt>,
    @InjectRepository(Dataset)
    private readonly datasetRepository: Repository<Dataset>,
    @InjectRepository(Document)
    private readonly documentRepository: Repository<Document>,
  ) {}

  /**
   * Select the most appropriate prompt for graph extraction based on dataset and document type
   */
  async selectPrompt(
    datasetId: string,
    documentId?: string,
  ): Promise<Prompt | null> {
    try {
      // Get dataset information
      const dataset = await this.datasetRepository.findOne({
        where: { id: datasetId },
        relations: ['documents'],
      });

      if (!dataset) {
        this.logger.warn(`Dataset ${datasetId} not found`);
        return null;
      }

      // Get document information if provided
      let document = null;
      if (documentId) {
        document = await this.documentRepository.findOne({
          where: { id: documentId },
        });
      }

      // Determine content type based on dataset and document metadata
      const contentType = this.determineContentType(dataset, document);
      this.logger.log(
        `Determined content type: ${contentType} for dataset: ${datasetId}`,
      );

      // Find the most appropriate prompt
      const prompt = await this.findPromptByContentType(contentType);

      if (!prompt) {
        this.logger.warn(
          `No prompt found for content type: ${contentType}, using default`,
        );
        return await this.getDefaultPrompt();
      }

      this.logger.log(
        `Selected prompt: ${prompt.name} for content type: ${contentType}`,
      );
      return prompt;
    } catch (error) {
      this.logger.error(`Error selecting prompt: ${error.message}`);
      return await this.getDefaultPrompt();
    }
  }

  /**
   * Determine content type based on dataset and document metadata
   */
  private determineContentType(
    dataset: Dataset,
    document?: Document | null,
  ): string {
    // Use dataset name or type for content type hints
    const datasetType = 'document';

    // Use document type if available
    if (document?.dataSourceType) {
      return document.dataSourceType.toLowerCase();
    }

    // Check dataset name for hints
    const datasetName = dataset.name?.toLowerCase() || '';
    if (
      datasetName.includes('social') ||
      datasetName.includes('twitter') ||
      datasetName.includes('facebook')
    ) {
      return 'social_media';
    }
    if (datasetName.includes('news') || datasetName.includes('article')) {
      return 'news';
    }
    if (
      datasetName.includes('academic') ||
      datasetName.includes('research') ||
      datasetName.includes('paper')
    ) {
      return 'academic';
    }
    if (
      datasetName.includes('legal') ||
      datasetName.includes('contract') ||
      datasetName.includes('law')
    ) {
      return 'legal';
    }
    if (
      datasetName.includes('medical') ||
      datasetName.includes('health') ||
      datasetName.includes('clinical')
    ) {
      return 'medical';
    }
    if (
      datasetName.includes('financial') ||
      datasetName.includes('finance') ||
      datasetName.includes('banking')
    ) {
      return 'financial';
    }

    // Default to document type
    return datasetType.toLowerCase();
  }

  /**
   * Find prompt by content type
   */
  private async findPromptByContentType(
    contentType: string,
  ): Promise<Prompt | null> {
    // Map content types to prompt names
    const promptNameMap: Record<string, string> = {
      social_media: 'Social Media Graph Extraction',
      news: 'Document Graph Extraction',
      academic: 'Document Graph Extraction',
      legal: 'Document Graph Extraction',
      medical: 'Document Graph Extraction',
      financial: 'Document Graph Extraction',
      document: 'Document Graph Extraction',
      default: 'Document Graph Extraction',
    };

    const promptName = promptNameMap[contentType] || promptNameMap['default'];

    return await this.promptRepository.findOne({
      where: {
        name: promptName,
        type: 'graph_extraction',
        isActive: true,
      },
    });
  }

  /**
   * Get default prompt (Document Graph Extraction)
   */
  private async getDefaultPrompt(): Promise<Prompt | null> {
    return await this.promptRepository.findOne({
      where: {
        name: 'Document Graph Extraction',
        type: 'graph_extraction',
        isActive: true,
      },
    });
  }

  /**
   * Get available relationship types for a specific content type
   */
  async getAvailableRelationshipTypes(contentType: string): Promise<string[]> {
    const relationshipTypeMap: Record<string, string[]> = {
      social_media: [
        'mentions',
        'sentiment',
        'interacts_with',
        'competes_with',
        'discusses',
        'shares_topic',
        'follows',
        'collaborates',
        'influences',
        'located_in',
        'part_of',
        'related_to',
      ],
      news: [
        'mentions',
        'discusses',
        'related_to',
        'located_in',
        'part_of',
        'influences',
        'competes_with',
        'collaborates',
      ],
      academic: [
        'cites',
        'references',
        'builds_on',
        'contradicts',
        'supports',
        'related_to',
        'part_of',
        'influences',
      ],
      legal: [
        'references',
        'cites',
        'amends',
        'supersedes',
        'related_to',
        'part_of',
        'governs',
        'applies_to',
      ],
      medical: [
        'treats',
        'causes',
        'prevents',
        'diagnoses',
        'related_to',
        'part_of',
        'contraindicates',
        'interacts_with',
      ],
      financial: [
        'invests_in',
        'owns',
        'manages',
        'related_to',
        'part_of',
        'competes_with',
        'collaborates',
        'influences',
      ],
      default: [
        'mentions',
        'related_to',
        'part_of',
        'located_in',
        'influences',
        'discusses',
        'collaborates',
        'competes_with',
      ],
    };

    return relationshipTypeMap[contentType] || relationshipTypeMap['default'];
  }

  /**
   * Get available node types for a specific content type
   */
  async getAvailableNodeTypes(contentType: string): Promise<string[]> {
    const nodeTypeMap: Record<string, string[]> = {
      social_media: [
        'author',
        'brand',
        'topic',
        'hashtag',
        'influencer',
        'location',
        'organization',
        'product',
        'event',
      ],
      news: [
        'author',
        'organization',
        'topic',
        'location',
        'event',
        'person',
        'product',
        'concept',
      ],
      academic: [
        'author',
        'organization',
        'topic',
        'concept',
        'method',
        'theory',
        'experiment',
        'publication',
      ],
      legal: [
        'person',
        'organization',
        'concept',
        'law',
        'regulation',
        'case',
        'precedent',
        'jurisdiction',
      ],
      medical: [
        'person',
        'organization',
        'condition',
        'treatment',
        'drug',
        'symptom',
        'procedure',
        'concept',
      ],
      financial: [
        'organization',
        'person',
        'product',
        'concept',
        'market',
        'investment',
        'risk',
        'strategy',
      ],
      default: [
        'author',
        'organization',
        'topic',
        'location',
        'event',
        'person',
        'product',
        'concept',
      ],
    };

    return nodeTypeMap[contentType] || nodeTypeMap['default'];
  }
}
