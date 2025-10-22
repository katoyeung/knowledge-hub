import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GraphNode, NodeType } from '../entities/graph-node.entity';
import { GraphEdge, EdgeType } from '../entities/graph-edge.entity';
import {
  PredefinedEntity,
  EntitySource,
} from '../entities/predefined-entity.entity';
import { EntityAlias } from '../entities/entity-alias.entity';
import { EntityDictionaryService } from './entity-dictionary.service';

export interface ExtractionResult {
  nodes: Array<{
    type: NodeType;
    label: string;
    properties?: any;
  }>;
  edges: Array<{
    sourceNodeLabel: string;
    targetNodeLabel: string;
    edgeType: EdgeType;
    properties?: any;
  }>;
}

export interface LearningSuggestion {
  entity: {
    type: NodeType;
    canonicalName: string;
    aliases: string[];
    confidence: number;
    source: string;
  };
  evidence: {
    occurrenceCount: number;
    contexts: string[];
    relatedEntities: string[];
  };
}

@Injectable()
export class EntityLearningService {
  private readonly logger = new Logger(EntityLearningService.name);

  constructor(
    @InjectRepository(GraphNode)
    private readonly nodeRepository: Repository<GraphNode>,
    @InjectRepository(GraphEdge)
    private readonly edgeRepository: Repository<GraphEdge>,
    @InjectRepository(PredefinedEntity)
    private readonly entityRepository: Repository<PredefinedEntity>,
    @InjectRepository(EntityAlias)
    private readonly aliasRepository: Repository<EntityAlias>,
    private readonly entityDictionaryService: EntityDictionaryService,
  ) {}

  async learnFromExtraction(
    extractionResult: ExtractionResult,
    datasetId: string,
  ): Promise<void> {
    this.logger.debug(
      `Learning from extraction result for dataset ${datasetId}`,
    );

    try {
      // Learn from nodes
      for (const node of extractionResult.nodes) {
        await this.learnFromNode(node, datasetId);
      }

      // Learn from edges (relationships)
      for (const edge of extractionResult.edges) {
        await this.learnFromEdge(edge, datasetId);
      }

      this.logger.debug(`Learning completed for dataset ${datasetId}`);
    } catch (error) {
      this.logger.error(`Error in learning from extraction: ${error.message}`);
    }
  }

  async suggestNewEntities(datasetId: string): Promise<LearningSuggestion[]> {
    this.logger.log(`Generating entity suggestions for dataset ${datasetId}`);

    const suggestions: LearningSuggestion[] = [];

    try {
      // Analyze existing graph data to find patterns
      const nodePatterns = await this.analyzeNodePatterns(datasetId);
      const edgePatterns = await this.analyzeEdgePatterns(datasetId);

      // Generate suggestions from patterns
      for (const pattern of nodePatterns) {
        if (pattern.frequency >= 3) {
          // Only suggest entities that appear frequently
          const suggestion = await this.createSuggestionFromPattern(
            pattern,
            datasetId,
          );
          if (suggestion) {
            suggestions.push(suggestion);
          }
        }
      }

      // Generate suggestions from edge patterns
      for (const pattern of edgePatterns) {
        if (pattern.frequency >= 2) {
          const suggestion = await this.createSuggestionFromEdgePattern(
            pattern,
            datasetId,
          );
          if (suggestion) {
            suggestions.push(suggestion);
          }
        }
      }

      // Sort by confidence
      suggestions.sort((a, b) => b.entity.confidence - a.entity.confidence);

      this.logger.log(`Generated ${suggestions.length} entity suggestions`);
    } catch (error) {
      this.logger.error(`Error generating suggestions: ${error.message}`);
    }

    return suggestions;
  }

  calculateEntityConfidence(
    entity: PredefinedEntity,
    usageData: {
      occurrenceCount: number;
      lastUsed: Date;
      averageSimilarity: number;
      contextVariety: number;
    },
  ): number {
    let confidence = 0.5; // Base confidence

    // Frequency factor (0-0.3)
    const frequencyScore = Math.min(0.3, usageData.occurrenceCount * 0.05);
    confidence += frequencyScore;

    // Recency factor (0-0.2)
    const daysSinceLastUse =
      (Date.now() - usageData.lastUsed.getTime()) / (1000 * 60 * 60 * 24);
    const recencyScore = Math.max(0, 0.2 - daysSinceLastUse * 0.01);
    confidence += recencyScore;

    // Similarity factor (0-0.2)
    const similarityScore = usageData.averageSimilarity * 0.2;
    confidence += similarityScore;

    // Context variety factor (0-0.1)
    const varietyScore = Math.min(0.1, usageData.contextVariety * 0.02);
    confidence += varietyScore;

    // Source factor
    if (entity.source === EntitySource.MANUAL) {
      confidence += 0.1; // Manual entities get slight boost
    }

    return Math.min(1.0, confidence);
  }

  async updateEntityConfidence(entityId: string): Promise<void> {
    this.logger.debug(`Updating confidence for entity ${entityId}`);

    const entity = await this.entityRepository.findOne({
      where: { id: entityId },
      relations: ['aliases'],
    });

    if (!entity) {
      this.logger.warn(`Entity ${entityId} not found for confidence update`);
      return;
    }

    // Get usage data
    const usageData = await this.getEntityUsageData(entityId);

    // Calculate new confidence
    const newConfidence = this.calculateEntityConfidence(entity, usageData);

    // Update entity
    await this.entityRepository.update(entityId, {
      confidenceScore: newConfidence,
      metadata: {
        ...entity.metadata,
        usage_count: usageData.occurrenceCount,
        last_used: usageData.lastUsed,
        average_similarity: usageData.averageSimilarity,
        context_variety: usageData.contextVariety,
      } as any,
    });

    this.logger.debug(
      `Updated confidence for ${entity.canonicalName}: ${newConfidence}`,
    );
  }

  async discoverEntityAliases(datasetId: string): Promise<void> {
    this.logger.log(`Discovering entity aliases for dataset ${datasetId}`);

    try {
      // Get all entities for this dataset
      const entities = await this.entityRepository.find({
        where: { datasetId },
        relations: ['aliases'],
      });

      for (const entity of entities) {
        await this.discoverAliasesForEntity(entity, datasetId);
      }

      this.logger.log(`Alias discovery completed for dataset ${datasetId}`);
    } catch (error) {
      this.logger.error(`Error in alias discovery: ${error.message}`);
    }
  }

  private async learnFromNode(
    node: { type: NodeType; label: string; properties?: any },
    datasetId: string,
  ): Promise<void> {
    // Check if entity already exists
    const existingEntity = await this.entityRepository.findOne({
      where: {
        datasetId,
        canonicalName: node.label,
      },
    });

    if (existingEntity) {
      // Update usage
      await this.entityDictionaryService.updateEntityFromUsage(
        existingEntity.id,
        {
          nodeType: node.type,
          confidence: node.properties?.confidence,
        },
      );
      return;
    }

    // Check for similar entities
    const similarEntities = await this.findSimilarEntities(
      node.label,
      datasetId,
      node.type,
    );

    if (similarEntities.length > 0) {
      // Use the most similar entity
      const bestMatch = similarEntities[0];
      await this.entityDictionaryService.updateEntityFromUsage(bestMatch.id, {
        nodeType: node.type,
        confidence: node.properties?.confidence,
        matchedAlias: node.label,
      });

      // Add as alias if not already present
      await this.addAliasIfNotExists(bestMatch.id, node.label);
    } else {
      // Create new entity if confidence is high enough
      if ((node.properties?.confidence || 0) >= 0.7) {
        await this.entityRepository.save({
          datasetId,
          entityType: node.type,
          canonicalName: node.label,
          confidenceScore: node.properties?.confidence || 0.8,
          source: EntitySource.LEARNED,
          metadata: {
            learned_from: 'extraction',
            confidence: node.properties?.confidence,
            first_seen: new Date(),
          },
          userId: 'system',
        });
      }
    }
  }

  private async learnFromEdge(
    edge: {
      sourceNodeLabel: string;
      targetNodeLabel: string;
      edgeType: EdgeType;
      properties?: any;
    },
    datasetId: string,
  ): Promise<void> {
    // Learn from source node
    await this.learnFromNode(
      {
        type: NodeType.ORGANIZATION, // Default type, will be refined
        label: edge.sourceNodeLabel,
        properties: edge.properties,
      },
      datasetId,
    );

    // Learn from target node
    await this.learnFromNode(
      {
        type: NodeType.ORGANIZATION, // Default type, will be refined
        label: edge.targetNodeLabel,
        properties: edge.properties,
      },
      datasetId,
    );
  }

  private async analyzeNodePatterns(datasetId: string): Promise<
    Array<{
      label: string;
      type: NodeType;
      frequency: number;
      contexts: string[];
    }>
  > {
    const patterns: Array<{
      label: string;
      type: NodeType;
      frequency: number;
      contexts: string[];
    }> = [];

    // Get all nodes for this dataset
    const nodes = await this.nodeRepository.find({
      where: { datasetId },
    });

    // Group by label and type
    const grouped = nodes.reduce(
      (acc, node) => {
        const key = `${node.label}|${node.nodeType}`;
        if (!acc[key]) {
          acc[key] = {
            label: node.label,
            type: node.nodeType,
            frequency: 0,
            contexts: [],
          };
        }
        acc[key].frequency++;
        acc[key].contexts.push(node.properties?.context || '');
        return acc;
      },
      {} as Record<string, any>,
    );

    return Object.values(grouped);
  }

  private async analyzeEdgePatterns(datasetId: string): Promise<
    Array<{
      sourceType: NodeType;
      targetType: NodeType;
      edgeType: EdgeType;
      frequency: number;
    }>
  > {
    const patterns: Array<{
      sourceType: NodeType;
      targetType: NodeType;
      edgeType: EdgeType;
      frequency: number;
    }> = [];

    // Get all edges with their nodes
    const edges = await this.edgeRepository.find({
      where: { datasetId },
      relations: ['sourceNode', 'targetNode'],
    });

    // Group by pattern
    const grouped = edges.reduce(
      (acc, edge) => {
        const key = `${edge.sourceNode?.nodeType}|${edge.targetNode?.nodeType}|${edge.edgeType}`;
        if (!acc[key]) {
          acc[key] = {
            sourceType: edge.sourceNode?.nodeType,
            targetType: edge.targetNode?.nodeType,
            edgeType: edge.edgeType,
            frequency: 0,
          };
        }
        acc[key].frequency++;
        return acc;
      },
      {} as Record<string, any>,
    );

    return Object.values(grouped);
  }

  private async createSuggestionFromPattern(
    pattern: any,
    datasetId: string,
  ): Promise<LearningSuggestion | null> {
    // Check if entity already exists
    const existing = await this.entityRepository.findOne({
      where: {
        datasetId,
        canonicalName: pattern.label,
      },
    });

    if (existing) {
      return null;
    }

    // Generate aliases from similar patterns
    const aliases = await this.generateAliases(pattern.label, datasetId);

    return {
      entity: {
        type: pattern.type,
        canonicalName: pattern.label,
        aliases,
        confidence: Math.min(0.9, pattern.frequency * 0.1),
        source: 'pattern_analysis',
      },
      evidence: {
        occurrenceCount: pattern.frequency,
        contexts: pattern.contexts.filter((c: string) => c),
        relatedEntities: [],
      },
    };
  }

  private async createSuggestionFromEdgePattern(
    pattern: any,
    datasetId: string,
  ): Promise<LearningSuggestion | null> {
    // This would analyze edge patterns to suggest new entity types
    // For now, return null as this is more complex
    return null;
  }

  private async findSimilarEntities(
    label: string,
    datasetId: string,
    type: NodeType,
    threshold: number = 0.8,
  ): Promise<PredefinedEntity[]> {
    const entities = await this.entityRepository.find({
      where: { datasetId, entityType: type },
      relations: ['aliases'],
    });

    const similar: PredefinedEntity[] = [];

    for (const entity of entities) {
      const similarity = this.calculateSimilarity(
        label.toLowerCase(),
        entity.canonicalName.toLowerCase(),
      );
      if (similarity >= threshold) {
        similar.push(entity);
      }

      // Check aliases
      for (const alias of entity.aliases || []) {
        const aliasSimilarity = this.calculateSimilarity(
          label.toLowerCase(),
          alias.alias.toLowerCase(),
        );
        if (aliasSimilarity >= threshold) {
          similar.push(entity);
          break;
        }
      }
    }

    return similar.sort((a, b) => {
      const simA = this.calculateSimilarity(
        label.toLowerCase(),
        a.canonicalName.toLowerCase(),
      );
      const simB = this.calculateSimilarity(
        label.toLowerCase(),
        b.canonicalName.toLowerCase(),
      );
      return simB - simA;
    });
  }

  private async addAliasIfNotExists(
    entityId: string,
    alias: string,
  ): Promise<void> {
    const existing = await this.aliasRepository.findOne({
      where: { predefinedEntityId: entityId, alias },
    });

    if (!existing) {
      await this.aliasRepository.save({
        predefinedEntityId: entityId,
        alias,
        similarityScore: 1.0,
      });
    }
  }

  private async discoverAliasesForEntity(
    entity: PredefinedEntity,
    datasetId: string,
  ): Promise<void> {
    // Find nodes that might be aliases of this entity
    const nodes = await this.nodeRepository.find({
      where: { datasetId, nodeType: entity.entityType as NodeType },
    });

    for (const node of nodes) {
      const similarity = this.calculateSimilarity(
        entity.canonicalName.toLowerCase(),
        node.label.toLowerCase(),
      );

      if (similarity >= 0.8 && node.label !== entity.canonicalName) {
        await this.addAliasIfNotExists(entity.id, node.label);
      }
    }
  }

  private async generateAliases(
    label: string,
    datasetId: string,
  ): Promise<string[]> {
    // Simple alias generation - in a real implementation, this would be more sophisticated
    const aliases: string[] = [];

    // Add common variations
    if (label.includes(' ')) {
      aliases.push(label.replace(/\s+/g, ''));
      aliases.push(label.replace(/\s+/g, '_'));
      aliases.push(label.replace(/\s+/g, '-'));
    }

    // Add lowercase version
    if (label !== label.toLowerCase()) {
      aliases.push(label.toLowerCase());
    }

    return aliases.filter((alias) => alias !== label);
  }

  private async getEntityUsageData(entityId: string): Promise<{
    occurrenceCount: number;
    lastUsed: Date;
    averageSimilarity: number;
    contextVariety: number;
  }> {
    // This would query the database for usage statistics
    // For now, return default values
    return {
      occurrenceCount: 1,
      lastUsed: new Date(),
      averageSimilarity: 0.8,
      contextVariety: 1,
    };
  }

  private calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) return 1.0;

    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1)
      .fill(null)
      .map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) {
      matrix[0][i] = i;
    }

    for (let j = 0; j <= str2.length; j++) {
      matrix[j][0] = j;
    }

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + indicator,
        );
      }
    }

    return matrix[str2.length][str1.length];
  }
}
