import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { GraphNode, NodeType } from '../entities/graph-node.entity';
import { GraphEdge } from '../entities/graph-edge.entity';
import {
  EntityNormalizationLog,
  NormalizationMethod,
} from '../entities/entity-normalization-log.entity';
import { NormalizeNodesDto } from '../dto/normalize-nodes.dto';
import { EntityDictionaryService } from './entity-dictionary.service';

export interface NormalizationResult {
  normalized: number;
  duplicates: Array<{
    original: GraphNode;
    normalized: GraphNode;
    similarity: number;
  }>;
  errors: string[];
}

export interface DuplicateGroup {
  canonicalName: string;
  nodes: GraphNode[];
  similarity: number;
}

@Injectable()
export class EntityNormalizationService {
  private readonly logger = new Logger(EntityNormalizationService.name);

  constructor(
    @InjectRepository(GraphNode)
    private readonly nodeRepository: Repository<GraphNode>,
    @InjectRepository(GraphEdge)
    private readonly edgeRepository: Repository<GraphEdge>,
    @InjectRepository(EntityNormalizationLog)
    private readonly normalizationLogRepository: Repository<EntityNormalizationLog>,
    private readonly entityDictionaryService: EntityDictionaryService,
  ) {}

  async normalizeNodesByKey(
    datasetId: string,
    keyNodeIds: string[],
    options: NormalizeNodesDto = {},
  ): Promise<NormalizationResult> {
    this.logger.log(`Normalizing nodes by key for dataset ${datasetId}`);

    const result: NormalizationResult = {
      normalized: 0,
      duplicates: [],
      errors: [],
    };

    try {
      // Get key nodes
      const keyNodes = await this.nodeRepository.find({
        where: { id: In(keyNodeIds), datasetId },
      });

      if (keyNodes.length === 0) {
        this.logger.warn('No key nodes found for normalization');
        return result;
      }

      // Get all nodes of the same type(s) as key nodes
      const nodeTypes = [...new Set(keyNodes.map((node) => node.nodeType))];
      const allNodes = await this.nodeRepository.find({
        where: {
          datasetId,
          nodeType: In(nodeTypes),
        },
      });

      // Group nodes by type for normalization
      const nodesByType = allNodes.reduce(
        (acc, node) => {
          if (!acc[node.nodeType]) {
            acc[node.nodeType] = [];
          }
          acc[node.nodeType].push(node);
          return acc;
        },
        {} as Record<string, GraphNode[]>,
      );

      // Normalize each type
      for (const [nodeType, nodes] of Object.entries(nodesByType)) {
        const typeResult = await this.normalizeNodesOfType(
          nodes,
          keyNodes.filter((n) => n.nodeType === nodeType),
          options,
        );

        result.normalized += typeResult.normalized;
        result.duplicates.push(...typeResult.duplicates);
        result.errors.push(...typeResult.errors);
      }

      this.logger.log(
        `Normalization completed: ${result.normalized} normalized, ${result.duplicates.length} duplicates found`,
      );
    } catch (error) {
      this.logger.error(`Error during normalization: ${error.message}`);
      result.errors.push(`Normalization failed: ${error.message}`);
    }

    return result;
  }

  async findSimilarNodes(
    node: GraphNode,
    datasetId: string,
    threshold: number = 0.8,
  ): Promise<GraphNode[]> {
    this.logger.debug(`Finding similar nodes for: ${node.label}`);

    const similarNodes: GraphNode[] = [];
    const nodeLabel = node.label.toLowerCase();

    // Get all nodes of the same type
    const candidateNodes = await this.nodeRepository.find({
      where: {
        datasetId,
        nodeType: node.nodeType,
      },
    });

    for (const candidate of candidateNodes) {
      if (candidate.id === node.id) continue;

      const similarity = this.calculateSimilarity(
        nodeLabel,
        candidate.label.toLowerCase(),
      );
      if (similarity >= threshold) {
        similarNodes.push(candidate);
      }
    }

    // Sort by similarity descending
    similarNodes.sort((a, b) => {
      const simA = this.calculateSimilarity(nodeLabel, a.label.toLowerCase());
      const simB = this.calculateSimilarity(nodeLabel, b.label.toLowerCase());
      return simB - simA;
    });

    return similarNodes;
  }

  async mergeNodes(
    sourceIds: string[],
    targetId: string,
    datasetId: string,
  ): Promise<GraphNode> {
    this.logger.log(
      `Merging ${sourceIds.length} nodes into target ${targetId}`,
    );

    const targetNode = await this.nodeRepository.findOne({
      where: { id: targetId, datasetId },
    });

    if (!targetNode) {
      throw new Error(`Target node ${targetId} not found`);
    }

    const sourceNodes = await this.nodeRepository.find({
      where: { id: In(sourceIds), datasetId },
    });

    if (sourceNodes.length === 0) {
      throw new Error('No source nodes found');
    }

    // Merge properties
    const mergedProperties = { ...targetNode.properties };
    for (const sourceNode of sourceNodes) {
      Object.assign(mergedProperties, sourceNode.properties);
    }

    // Update target node with merged properties
    await this.nodeRepository.update(targetId, {
      properties: mergedProperties,
    });

    // Update all edges pointing to source nodes to point to target node
    for (const sourceId of sourceIds) {
      await this.edgeRepository.update(
        { sourceNodeId: sourceId },
        { sourceNodeId: targetId },
      );
      await this.edgeRepository.update(
        { targetNodeId: sourceId },
        { targetNodeId: targetId },
      );
    }

    // Delete source nodes
    await this.nodeRepository.delete(sourceIds);

    // Log the normalization
    for (const sourceNode of sourceNodes) {
      await this.normalizationLogRepository.save({
        datasetId,
        originalEntity: sourceNode.label,
        normalizedTo: targetNode.label,
        method: NormalizationMethod.MANUAL,
        confidence: 1.0,
      });
    }

    this.logger.log(
      `Successfully merged ${sourceIds.length} nodes into ${targetNode.label}`,
    );
    return targetNode;
  }

  async normalizeAfterExtraction(documentId: string): Promise<void> {
    this.logger.log(
      `Running post-extraction normalization for document ${documentId}`,
    );

    try {
      // Get all nodes created for this document
      const nodes = await this.nodeRepository.find({
        where: { documentId },
      });

      if (nodes.length === 0) {
        this.logger.warn('No nodes found for normalization');
        return;
      }

      // Group nodes by type
      const nodesByType = nodes.reduce(
        (acc, node) => {
          if (!acc[node.nodeType]) {
            acc[node.nodeType] = [];
          }
          acc[node.nodeType].push(node);
          return acc;
        },
        {} as Record<string, GraphNode[]>,
      );

      // Normalize each type
      for (const [nodeType, typeNodes] of Object.entries(nodesByType)) {
        await this.normalizeNodesOfType(typeNodes, [], {
          similarityThreshold: 0.9,
          method: NormalizationMethod.FUZZY_MATCH,
        });
      }

      this.logger.log(
        `Post-extraction normalization completed for document ${documentId}`,
      );
    } catch (error) {
      this.logger.error(
        `Error in post-extraction normalization: ${error.message}`,
      );
    }
  }

  async scheduleNormalizationJob(
    datasetId: string,
    criteria: {
      nodeTypes?: NodeType[];
      similarityThreshold?: number;
      batchSize?: number;
    } = {},
  ): Promise<string> {
    this.logger.log(`Scheduling normalization job for dataset ${datasetId}`);

    // This would integrate with the queue system
    // For now, we'll run it synchronously
    const result = await this.runNormalizationJob(datasetId, criteria);

    this.logger.log(
      `Normalization job completed: ${result.normalized} normalized`,
    );
    return 'job-completed'; // In real implementation, return job ID
  }

  async findDuplicates(
    datasetId: string,
    nodeType?: NodeType,
    threshold: number = 0.8,
  ): Promise<DuplicateGroup[]> {
    this.logger.log(`Finding duplicates in dataset ${datasetId}`);

    const whereClause: any = { datasetId };
    if (nodeType) {
      whereClause.nodeType = nodeType;
    }

    const nodes = await this.nodeRepository.find({
      where: whereClause,
      order: { label: 'ASC' },
    });

    const duplicateGroups: DuplicateGroup[] = [];
    const processed = new Set<string>();

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (processed.has(node.id)) continue;

      const similarNodes = [node];
      const nodeLabel = node.label.toLowerCase();

      // Find similar nodes
      for (let j = i + 1; j < nodes.length; j++) {
        const candidate = nodes[j];
        if (processed.has(candidate.id)) continue;

        const similarity = this.calculateSimilarity(
          nodeLabel,
          candidate.label.toLowerCase(),
        );
        if (similarity >= threshold) {
          similarNodes.push(candidate);
          processed.add(candidate.id);
        }
      }

      if (similarNodes.length > 1) {
        duplicateGroups.push({
          canonicalName: node.label,
          nodes: similarNodes,
          similarity: threshold,
        });
        processed.add(node.id);
      }
    }

    this.logger.log(`Found ${duplicateGroups.length} duplicate groups`);
    return duplicateGroups;
  }

  private async normalizeNodesOfType(
    nodes: GraphNode[],
    keyNodes: GraphNode[],
    options: NormalizeNodesDto,
  ): Promise<NormalizationResult> {
    const result: NormalizationResult = {
      normalized: 0,
      duplicates: [],
      errors: [],
    };

    const threshold = options.similarityThreshold || 0.8;
    const processed = new Set<string>();

    for (const node of nodes) {
      if (processed.has(node.id)) continue;

      // Find similar nodes
      const similarNodes = await this.findSimilarNodes(
        node,
        node.datasetId,
        threshold,
      );

      if (similarNodes.length > 0) {
        // Determine canonical node (prefer key nodes, then highest confidence)
        let canonicalNode = node;

        // Check if any key node is similar
        const similarKeyNode = keyNodes.find((keyNode) =>
          similarNodes.some((similar) => similar.id === keyNode.id),
        );

        if (similarKeyNode) {
          canonicalNode = similarKeyNode;
        } else {
          // Use the node with highest confidence
          const allSimilar = [node, ...similarNodes];
          canonicalNode = allSimilar.reduce((best, current) =>
            (current.properties?.confidence || 0) >
            (best.properties?.confidence || 0)
              ? current
              : best,
          );
        }

        // Merge similar nodes
        const nodesToMerge = similarNodes.filter(
          (similar) => similar.id !== canonicalNode.id,
        );

        if (nodesToMerge.length > 0) {
          try {
            await this.mergeNodes(
              nodesToMerge.map((n) => n.id),
              canonicalNode.id,
              node.datasetId,
            );

            result.normalized += nodesToMerge.length;
            result.duplicates.push(
              ...nodesToMerge.map((original) => ({
                original,
                normalized: canonicalNode,
                similarity: this.calculateSimilarity(
                  original.label.toLowerCase(),
                  canonicalNode.label.toLowerCase(),
                ),
              })),
            );

            // Mark as processed
            nodesToMerge.forEach((n) => processed.add(n.id));
          } catch (error) {
            result.errors.push(`Failed to merge nodes: ${error.message}`);
          }
        }
      }

      processed.add(node.id);
    }

    return result;
  }

  private async runNormalizationJob(
    datasetId: string,
    criteria: any,
  ): Promise<NormalizationResult> {
    this.logger.log(`Running normalization job for dataset ${datasetId}`);

    const whereClause: any = { datasetId };
    if (criteria.nodeTypes) {
      whereClause.nodeType = In(criteria.nodeTypes);
    }

    const nodes = await this.nodeRepository.find({
      where: whereClause,
    });

    const result: NormalizationResult = {
      normalized: 0,
      duplicates: [],
      errors: [],
    };

    // Group by type and normalize
    const nodesByType = nodes.reduce(
      (acc, node) => {
        if (!acc[node.nodeType]) {
          acc[node.nodeType] = [];
        }
        acc[node.nodeType].push(node);
        return acc;
      },
      {} as Record<string, GraphNode[]>,
    );

    for (const [nodeType, typeNodes] of Object.entries(nodesByType)) {
      const typeResult = await this.normalizeNodesOfType(
        typeNodes,
        [],
        criteria,
      );
      result.normalized += typeResult.normalized;
      result.duplicates.push(...typeResult.duplicates);
      result.errors.push(...typeResult.errors);
    }

    return result;
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
