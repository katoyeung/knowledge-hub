import { Injectable, Logger, NotFoundException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Like, ILike } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { Cacheable } from '../../../common/decorators/cacheable.decorator';
import { CacheEvict } from '../../../common/decorators/cache-evict.decorator';
import {
  PredefinedEntity,
  EntitySource,
} from '../entities/predefined-entity.entity';
import { EntityAlias } from '../entities/entity-alias.entity';
import { CreatePredefinedEntityDto } from '../dto/create-predefined-entity.dto';
import { UpdatePredefinedEntityDto } from '../dto/update-predefined-entity.dto';
import { BulkImportEntitiesDto } from '../dto/bulk-import-entities.dto';

export interface EntityMatch {
  entity: PredefinedEntity;
  alias?: EntityAlias;
  similarity: number;
  matchedText: string;
}

export interface EntityStatistics {
  totalEntities: number;
  entitiesByType: Record<string, number>;
  entitiesBySource: Record<string, number>;
  topEntities: Array<{
    entity: PredefinedEntity;
    usageCount: number;
    lastUsed?: Date;
  }>;
  recentActivity: Array<{
    entity: PredefinedEntity;
    action: string;
    timestamp: Date;
  }>;
}

@Injectable()
export class EntityDictionaryService {
  private readonly logger = new Logger(EntityDictionaryService.name);
  private readonly CACHE_TTL = 3600; // 1 hour

  constructor(
    @InjectRepository(PredefinedEntity)
    private readonly entityRepository: Repository<PredefinedEntity>,
    @InjectRepository(EntityAlias)
    private readonly aliasRepository: Repository<EntityAlias>,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  async buildInitialDictionary(
    datasetId: string,
    userId: string,
  ): Promise<PredefinedEntity[]> {
    this.logger.log(`Building initial dictionary for dataset ${datasetId}`);

    // Get existing graph nodes to build dictionary from
    const existingNodes = await this.entityRepository.query(
      `
      SELECT DISTINCT 
        gn.node_type as "entityType",
        gn.label as "canonicalName",
        COUNT(*) as "usageCount",
        MAX(gn.created_at) as "lastUsed"
      FROM graph_nodes gn 
      WHERE gn.dataset_id = $1 
      GROUP BY gn.node_type, gn.label
      ORDER BY COUNT(*) DESC
    `,
      [datasetId],
    );

    // Get existing entities to avoid duplicates
    const existingEntities = await this.entityRepository.find({
      where: { datasetId },
      select: ['canonicalName', 'entityType'],
    });

    // Create a set of existing entity keys for fast lookup
    const existingEntityKeys = new Set(
      existingEntities.map((e) => `${e.canonicalName}|${e.entityType}`),
    );

    const entities: PredefinedEntity[] = [];
    let skippedCount = 0;

    for (const node of existingNodes) {
      const entityKey = `${node.canonicalName}|${node.entityType}`;

      // Skip if entity already exists
      if (existingEntityKeys.has(entityKey)) {
        skippedCount++;
        this.logger.debug(
          `Skipping existing entity: ${node.canonicalName} (${node.entityType})`,
        );
        continue;
      }

      const entity = this.entityRepository.create({
        datasetId,
        entityType: node.entityType,
        canonicalName: node.canonicalName,
        confidenceScore: 0.8,
        source: EntitySource.AUTO_DISCOVERED,
        metadata: {
          usage_count: parseInt(node.usageCount),
          last_used: node.lastUsed,
          extraction_patterns: [node.canonicalName],
        },
        userId: userId, // Use the authenticated user ID
      });

      entities.push(entity);
    }

    if (entities.length > 0) {
      const savedEntities = await this.entityRepository.save(entities);
      await this.refreshCache(datasetId);
      this.logger.log(
        `Created ${savedEntities.length} new entities from existing graph data (skipped ${skippedCount} existing entities)`,
      );
    } else {
      this.logger.log(
        `No new entities to create - all ${existingNodes.length} graph nodes already exist as entities (skipped ${skippedCount} duplicates)`,
      );
    }

    return entities;
  }

  async addPredefinedEntity(
    datasetId: string,
    userId: string,
    data: CreatePredefinedEntityDto,
  ): Promise<PredefinedEntity> {
    this.logger.log(`Adding predefined entity: ${data.canonicalName}`);

    // Check for duplicates
    const existing = await this.entityRepository.findOne({
      where: {
        datasetId,
        canonicalName: data.canonicalName,
      },
    });

    if (existing) {
      throw new Error(
        `Entity with canonical name "${data.canonicalName}" already exists`,
      );
    }

    const { aliases, ...entityData } = data;
    const entity = this.entityRepository.create({
      datasetId,
      userId,
      ...entityData,
      source: data.source || EntitySource.MANUAL,
    });

    const savedEntity = await this.entityRepository.save(entity);

    // Add aliases if provided
    if (data.aliases && data.aliases.length > 0) {
      await this.addAliases(savedEntity.id, data.aliases);
    }

    await this.refreshCache(datasetId);
    return savedEntity;
  }

  async updatePredefinedEntity(
    entityId: string,
    data: UpdatePredefinedEntityDto,
  ): Promise<PredefinedEntity> {
    this.logger.log(`Updating predefined entity: ${entityId}`);

    const entity = await this.entityRepository.findOne({
      where: { id: entityId },
      relations: ['aliases'],
    });

    if (!entity) {
      throw new NotFoundException(`Entity with ID ${entityId} not found`);
    }

    // Update entity
    Object.assign(entity, data);
    const savedEntity = await this.entityRepository.save(entity);

    // Update aliases if provided
    if (data.aliases) {
      // Remove existing aliases
      await this.aliasRepository.delete({ predefinedEntityId: entityId });
      // Add new aliases
      if (data.aliases.length > 0) {
        await this.addAliases(entityId, data.aliases);
      }
    }

    await this.refreshCache(entity.datasetId);
    return savedEntity;
  }

  async deletePredefinedEntity(entityId: string): Promise<void> {
    this.logger.log(`Deleting predefined entity: ${entityId}`);

    const entity = await this.entityRepository.findOne({
      where: { id: entityId },
    });

    if (!entity) {
      throw new NotFoundException(`Entity with ID ${entityId} not found`);
    }

    await this.entityRepository.delete(entityId);
    await this.refreshCache(entity.datasetId);
  }

  async findMatchingEntities(
    text: string,
    datasetId: string,
    threshold: number = 0.7,
  ): Promise<EntityMatch[]> {
    this.logger.debug(
      `Finding matching entities in text: "${text.substring(0, 100)}..."`,
    );

    // Try cache first
    const cacheKey = `entity:matches:${datasetId}:${Buffer.from(text).toString('base64').substring(0, 50)}`;
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) {
      return JSON.parse(cached as string);
    }

    const matches: EntityMatch[] = [];
    const words = this.tokenizeText(text);

    // Get all entities for this dataset
    const entities = await this.getCachedEntities(datasetId);

    for (const entity of entities) {
      // Check canonical name
      const canonicalMatch = this.calculateSimilarity(
        entity.canonicalName,
        words,
      );
      if (canonicalMatch.similarity >= threshold) {
        matches.push({
          entity,
          similarity: canonicalMatch.similarity,
          matchedText: canonicalMatch.matchedText,
        });
      }

      // Check aliases
      for (const alias of entity.aliases || []) {
        const aliasMatch = this.calculateSimilarity(alias.alias, words);
        if (aliasMatch.similarity >= threshold) {
          matches.push({
            entity,
            alias,
            similarity: aliasMatch.similarity,
            matchedText: aliasMatch.matchedText,
          });
        }
      }
    }

    // Sort by similarity descending
    matches.sort((a, b) => b.similarity - a.similarity);

    // Cache results for 1 hour
    await this.cacheManager.set(cacheKey, matches, this.CACHE_TTL * 1000);

    return matches;
  }

  async updateEntityFromUsage(entityId: string, nodeData: any): Promise<void> {
    this.logger.debug(`Updating entity usage: ${entityId}`);

    const entity = await this.entityRepository.findOne({
      where: { id: entityId },
    });

    if (!entity) {
      return;
    }

    // Update usage count in metadata
    const metadata = entity.metadata || {};
    metadata.usage_count = (metadata.usage_count || 0) + 1;
    metadata.last_used = new Date();

    // Update confidence based on usage
    const usageCount = metadata.usage_count;
    const newConfidence = Math.min(
      1.0,
      entity.confidenceScore + usageCount * 0.01,
    );

    await this.entityRepository.update(entityId, {
      metadata,
      confidenceScore: newConfidence,
    });

    // Update alias match count if applicable
    if (nodeData.matchedAlias) {
      await this.aliasRepository.update(
        { predefinedEntityId: entityId, alias: nodeData.matchedAlias },
        {
          matchCount: () => 'match_count + 1',
          lastMatchedAt: new Date(),
        },
      );
    }

    await this.refreshCache(entity.datasetId);
  }

  async getEntityStatistics(datasetId: string): Promise<EntityStatistics> {
    this.logger.log(`Getting entity statistics for dataset ${datasetId}`);

    const entities = await this.entityRepository.find({
      where: { datasetId },
      relations: ['aliases'],
      order: { createdAt: 'DESC' },
    });

    const entitiesByType = entities.reduce(
      (acc, entity) => {
        acc[entity.entityType] = (acc[entity.entityType] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    const entitiesBySource = entities.reduce(
      (acc, entity) => {
        acc[entity.source] = (acc[entity.source] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    const topEntities = entities
      .map((entity) => ({
        entity,
        usageCount: entity.metadata?.usage_count || 0,
        lastUsed: entity.metadata?.last_used,
      }))
      .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, 10);

    const recentActivity = entities.slice(0, 10).map((entity) => ({
      entity,
      action: 'created',
      timestamp: entity.createdAt,
    }));

    return {
      totalEntities: entities.length,
      entitiesByType,
      entitiesBySource,
      topEntities,
      recentActivity,
    };
  }

  async bulkImportEntities(
    datasetId: string,
    userId: string,
    data: BulkImportEntitiesDto,
  ): Promise<{ created: number; skipped: number; errors: string[] }> {
    this.logger.log(
      `Bulk importing ${data.entities.length} entities for dataset ${datasetId}`,
    );

    const results = { created: 0, skipped: 0, errors: [] as string[] };

    for (const entityData of data.entities) {
      try {
        // Check for duplicates
        const existing = await this.entityRepository.findOne({
          where: {
            datasetId,
            canonicalName: entityData.canonicalName,
          },
        });

        if (existing) {
          if (data.options?.updateExisting) {
            await this.updatePredefinedEntity(existing.id, entityData);
            results.created++;
          } else {
            results.skipped++;
          }
          continue;
        }

        const entity = this.entityRepository.create({
          datasetId,
          userId,
          entityType: entityData.entityType,
          canonicalName: entityData.canonicalName,
          confidenceScore: data.options?.defaultConfidence || 0.8,
          source: EntitySource.IMPORTED,
          metadata: {
            description: entityData.description,
            category: entityData.category,
            tags: entityData.tags,
            ...entityData.metadata,
          },
        });

        const savedEntity = await this.entityRepository.save(entity);

        // Add aliases
        if (entityData.aliases && entityData.aliases.length > 0) {
          await this.addAliases(savedEntity.id, entityData.aliases);
        }

        results.created++;
      } catch (error) {
        results.errors.push(
          `Failed to import "${entityData.canonicalName}": ${error.message}`,
        );
      }
    }

    await this.refreshCache(datasetId);
    return results;
  }

  async exportEntities(datasetId: string): Promise<any[]> {
    this.logger.log(`Exporting entities for dataset ${datasetId}`);

    const entities = await this.entityRepository.find({
      where: { datasetId },
      relations: ['aliases'],
    });

    return entities.map((entity) => ({
      entityType: entity.entityType,
      canonicalName: entity.canonicalName,
      confidenceScore: entity.confidenceScore,
      source: entity.source,
      description: entity.metadata?.description,
      category: entity.metadata?.category,
      tags: entity.metadata?.tags,
      aliases: entity.aliases?.map((alias) => alias.alias) || [],
      metadata: entity.metadata,
    }));
  }

  async findEntities(
    datasetId: string,
    filters: {
      entityType?: string;
      searchTerm?: string;
      source?: EntitySource;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<{ entities: PredefinedEntity[]; total: number }> {
    const queryBuilder = this.entityRepository
      .createQueryBuilder('entity')
      .leftJoinAndSelect('entity.aliases', 'aliases')
      .where('entity.datasetId = :datasetId', { datasetId });

    if (filters.entityType) {
      queryBuilder.andWhere('entity.entityType = :entityType', {
        entityType: filters.entityType,
      });
    }

    if (filters.searchTerm) {
      queryBuilder.andWhere(
        '(entity.canonicalName ILIKE :searchTerm OR aliases.alias ILIKE :searchTerm)',
        { searchTerm: `%${filters.searchTerm}%` },
      );
    }

    if (filters.source) {
      queryBuilder.andWhere('entity.source = :source', {
        source: filters.source,
      });
    }

    const total = await queryBuilder.getCount();

    if (filters.limit) {
      queryBuilder.limit(filters.limit);
    }
    if (filters.offset) {
      queryBuilder.offset(filters.offset);
    }

    queryBuilder.orderBy('entity.createdAt', 'DESC');

    const entities = await queryBuilder.getMany();

    return { entities, total };
  }

  private async addAliases(entityId: string, aliases: string[]): Promise<void> {
    const aliasEntities = aliases.map((alias) =>
      this.aliasRepository.create({
        predefinedEntityId: entityId,
        alias,
        similarityScore: 1.0,
      }),
    );

    await this.aliasRepository.save(aliasEntities);
  }

  private async getCachedEntities(
    datasetId: string,
  ): Promise<PredefinedEntity[]> {
    const cacheKey = `entity:dict:${datasetId}`;
    const cached = await this.cacheManager.get(cacheKey);

    if (cached) {
      return JSON.parse(cached as string);
    }

    const entities = await this.entityRepository.find({
      where: { datasetId },
      relations: ['aliases'],
    });

    await this.cacheManager.set(cacheKey, entities, this.CACHE_TTL * 1000);
    return entities;
  }

  private async refreshCache(datasetId: string): Promise<void> {
    const cacheKey = `entity:dict:${datasetId}`;
    await this.cacheManager.del(cacheKey);
  }

  private tokenizeText(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 2);
  }

  private calculateSimilarity(
    entityName: string,
    words: string[],
  ): {
    similarity: number;
    matchedText: string;
  } {
    const entityWords = this.tokenizeText(entityName);
    let maxSimilarity = 0;
    let matchedText = '';

    // Check for exact matches first
    for (let i = 0; i <= words.length - entityWords.length; i++) {
      const window = words.slice(i, i + entityWords.length);
      const exactMatch = window.every(
        (word, index) => word === entityWords[index],
      );

      if (exactMatch) {
        return {
          similarity: 1.0,
          matchedText: window.join(' '),
        };
      }

      // Calculate fuzzy similarity
      const similarity = this.calculateFuzzySimilarity(entityWords, window);
      if (similarity > maxSimilarity) {
        maxSimilarity = similarity;
        matchedText = window.join(' ');
      }
    }

    return {
      similarity: maxSimilarity,
      matchedText,
    };
  }

  private calculateFuzzySimilarity(
    entityWords: string[],
    textWords: string[],
  ): number {
    if (entityWords.length !== textWords.length) {
      return 0;
    }

    let matches = 0;
    for (let i = 0; i < entityWords.length; i++) {
      if (this.levenshteinDistance(entityWords[i], textWords[i]) <= 1) {
        matches++;
      }
    }

    return matches / entityWords.length;
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
