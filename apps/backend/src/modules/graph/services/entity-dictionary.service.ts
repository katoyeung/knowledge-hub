import { Injectable, Logger, NotFoundException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { GraphEntity, EntitySource } from '../entities/graph-entity.entity';
import { EntityAlias } from '../entities/entity-alias.entity';
import { CreateEntityDto } from '../dto/create-entity.dto';
import { UpdateEntityDto } from '../dto/update-entity.dto';
import { BulkImportEntitiesDto } from '../dto/bulk-import-entities.dto';

export interface EntityMatch {
  entity: GraphEntity;
  alias?: EntityAlias;
  similarity: number;
  matchedText: string;
}

export interface EntityStatistics {
  totalEntities: number;
  entitiesByType: Record<string, number>;
  entitiesBySource: Record<string, number>;
  topEntities: Array<{
    entity: GraphEntity;
    usageCount: number;
    lastUsed?: Date;
  }>;
  recentActivity: Array<{
    entity: GraphEntity;
    action: string;
    timestamp: Date;
  }>;
}

@Injectable()
export class EntityDictionaryService {
  private readonly logger = new Logger(EntityDictionaryService.name);
  private readonly CACHE_TTL = 3600; // 1 hour

  constructor(
    @InjectRepository(GraphEntity)
    private readonly entityRepository: Repository<GraphEntity>,
    @InjectRepository(EntityAlias)
    private readonly aliasRepository: Repository<EntityAlias>,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async discoverEntitiesFromGraph(_userId: string): Promise<
    Array<{
      entityType: string;
      canonicalName: string;
      metadata?: {
        usage_count?: number;
        last_used?: Date;
        extraction_patterns?: string[];
      };
    }>
  > {
    this.logger.log(`Discovering entities from existing graph nodes`);

    // Get existing graph nodes to discover entities from
    const existingNodes = await this.entityRepository.query(
      `
      SELECT DISTINCT 
        gn.node_type as "entityType",
        gn.label as "canonicalName",
        COUNT(*) as "usageCount",
        MAX(gn.created_at) as "lastUsed"
      FROM graph_nodes gn 
      GROUP BY gn.node_type, gn.label
      ORDER BY COUNT(*) DESC
    `,
    );

    const discoveredEntities: Array<{
      entityType: string;
      canonicalName: string;
      metadata?: {
        usage_count?: number;
        last_used?: Date;
        extraction_patterns?: string[];
      };
    }> = [];

    for (const node of existingNodes) {
      discoveredEntities.push({
        entityType: node.entityType,
        canonicalName: node.canonicalName,
        metadata: {
          usage_count: parseInt(node.usageCount),
          last_used: node.lastUsed,
          extraction_patterns: [node.canonicalName],
        },
      });
    }

    this.logger.log(
      `Discovered ${discoveredEntities.length} entities from graph nodes`,
    );

    return discoveredEntities;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async discoverAliasesFromGraph(_userId: string): Promise<
    Array<{
      entityType: string;
      canonicalName: string;
      aliases: Array<{
        name: string;
        similarity: number;
      }>;
    }>
  > {
    this.logger.log(`Discovering aliases from existing graph nodes`);

    // Get all existing entities
    const entities = await this.entityRepository.find({
      relations: ['aliases'],
    });

    // Get all graph nodes grouped by type and label
    const nodes = await this.entityRepository.query(
      `
      SELECT DISTINCT 
        gn.node_type as "nodeType",
        gn.label as "label"
      FROM graph_nodes gn 
      ORDER BY gn.node_type, gn.label
    `,
    );

    const discoveredAliases: Array<{
      entityType: string;
      canonicalName: string;
      aliases: Array<{
        name: string;
        similarity: number;
      }>;
    }> = [];

    // For each entity, find potential aliases from graph nodes
    for (const entity of entities) {
      const potentialAliases: Array<{ name: string; similarity: number }> = [];
      const existingAliasNames = new Set(
        (entity.aliases || []).map((a) =>
          typeof a === 'string' ? a : (a as any).alias || (a as any).name,
        ),
      );

      // Find nodes of the same type that might be aliases
      const sameTypeNodes = nodes.filter(
        (node: { nodeType: string; label: string }) =>
          node.nodeType === entity.entityType &&
          node.label !== entity.canonicalName,
      );

      for (const node of sameTypeNodes) {
        // Calculate similarity using Levenshtein distance
        const similarity = this.calculateStringSimilarity(
          entity.canonicalName.toLowerCase(),
          node.label.toLowerCase(),
        );

        // If similarity is high enough and not already an alias
        if (similarity >= 0.8 && !existingAliasNames.has(node.label)) {
          potentialAliases.push({
            name: node.label,
            similarity,
          });
        }
      }

      if (potentialAliases.length > 0) {
        discoveredAliases.push({
          entityType: entity.entityType,
          canonicalName: entity.canonicalName,
          aliases: potentialAliases,
        });
      }
    }

    this.logger.log(
      `Discovered aliases for ${discoveredAliases.length} entities`,
    );

    return discoveredAliases;
  }

  private calculateStringSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) return 1.0;

    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }

  async buildInitialDictionary(userId: string): Promise<GraphEntity[]> {
    this.logger.log(`Building initial dictionary from existing graph nodes`);

    // Get existing graph nodes to build dictionary from
    const existingNodes = await this.entityRepository.query(
      `
      SELECT DISTINCT 
        gn.node_type as "entityType",
        gn.label as "canonicalName",
        COUNT(*) as "usageCount",
        MAX(gn.created_at) as "lastUsed"
      FROM graph_nodes gn 
      GROUP BY gn.node_type, gn.label
      ORDER BY COUNT(*) DESC
    `,
    );

    // Get existing entities to avoid duplicates
    const existingEntities = await this.entityRepository.find({
      select: ['canonicalName', 'entityType'],
    });

    // Create a set of existing entity keys for fast lookup
    const existingEntityKeys = new Set(
      existingEntities.map((e) => `${e.canonicalName}|${e.entityType}`),
    );

    const entities: GraphEntity[] = [];
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
        entityType: node.entityType,
        canonicalName: node.canonicalName,
        confidenceScore: 0.8,
        source: EntitySource.AUTO_DISCOVERED,
        metadata: {
          usage_count: parseInt(node.usageCount),
          last_used: node.lastUsed,
          extraction_patterns: [node.canonicalName],
        },
        userId: userId,
      });

      entities.push(entity);
    }

    if (entities.length > 0) {
      const savedEntities = await this.entityRepository.save(entities);
      await this.refreshCache();
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

  async addEntity(userId: string, data: CreateEntityDto): Promise<GraphEntity> {
    this.logger.log(`Adding entity: ${data.canonicalName}`);

    // Check for duplicates by entityId if provided
    if (data.entityId) {
      const existingById = await this.entityRepository.findOne({
        where: { entityId: data.entityId },
      });
      if (existingById) {
        throw new Error(
          `Entity with entityId "${data.entityId}" already exists`,
        );
      }
    }

    // Check for duplicates by canonicalName + entityType
    const existing = await this.entityRepository.findOne({
      where: {
        canonicalName: data.canonicalName,
        entityType: data.entityType,
      },
    });

    if (existing) {
      throw new Error(
        `Entity with canonical name "${data.canonicalName}" and type "${data.entityType}" already exists`,
      );
    }

    const { aliases, ...entityData } = data;
    const entity = this.entityRepository.create({
      userId,
      ...entityData,
      source: data.source || EntitySource.MANUAL,
    });

    const savedEntity = await this.entityRepository.save(entity);

    // Add aliases if provided
    if (aliases && aliases.length > 0) {
      await this.addAliases(savedEntity.id, aliases);
    }

    await this.refreshCache();
    return savedEntity;
  }

  async updateEntity(
    entityId: string,
    data: UpdateEntityDto,
  ): Promise<GraphEntity> {
    this.logger.log(`Updating entity: ${entityId}`);

    const entity = await this.entityRepository.findOne({
      where: { id: entityId },
      relations: ['aliases'],
    });

    if (!entity) {
      throw new NotFoundException(`Entity with ID ${entityId} not found`);
    }

    // Check for entityId conflicts if updating entityId
    if (data.entityId && data.entityId !== entity.entityId) {
      const existingById = await this.entityRepository.findOne({
        where: { entityId: data.entityId },
      });
      if (existingById) {
        throw new Error(
          `Entity with entityId "${data.entityId}" already exists`,
        );
      }
    }

    const { aliases, ...entityData } = data;

    // Update entity
    Object.assign(entity, entityData);
    const savedEntity = await this.entityRepository.save(entity);

    // Update aliases if provided
    if (aliases !== undefined) {
      // Remove existing aliases
      await this.aliasRepository.delete({ entityId: entityId });
      // Add new aliases
      if (aliases.length > 0) {
        await this.addAliases(entityId, aliases);
      }
    }

    await this.refreshCache();
    return savedEntity;
  }

  async deleteEntity(entityId: string): Promise<void> {
    this.logger.log(`Deleting entity: ${entityId}`);

    const entity = await this.entityRepository.findOne({
      where: { id: entityId },
    });

    if (!entity) {
      throw new NotFoundException(`Entity with ID ${entityId} not found`);
    }

    await this.entityRepository.delete(entityId);
    await this.refreshCache();
  }

  async bulkDeleteEntities(
    entityIds: string[],
  ): Promise<{ deleted: number; failed: number }> {
    this.logger.log(`Bulk deleting ${entityIds.length} entities`);

    let deleted = 0;
    let failed = 0;

    for (const entityId of entityIds) {
      try {
        await this.entityRepository.delete(entityId);
        deleted++;
      } catch (error) {
        this.logger.error(`Failed to delete entity ${entityId}:`, error);
        failed++;
      }
    }

    await this.refreshCache();
    return { deleted, failed };
  }

  async deleteAllEntities(): Promise<{ deleted: number }> {
    this.logger.log('Deleting all entities');

    // Use query builder to delete all entities
    const result = await this.entityRepository
      .createQueryBuilder()
      .delete()
      .execute();

    const deleted = result.affected || 0;

    await this.refreshCache();
    return { deleted };
  }

  async findMatchingEntities(
    text: string,
    threshold: number = 0.7,
  ): Promise<EntityMatch[]> {
    this.logger.debug(
      `Finding matching entities in text: "${text.substring(0, 100)}..."`,
    );

    // Try cache first
    const cacheKey = `entity:matches:${Buffer.from(text).toString('base64').substring(0, 50)}`;
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) {
      return JSON.parse(cached as string);
    }

    const matches: EntityMatch[] = [];
    const words = this.tokenizeText(text);

    // Get all entities
    const entities = await this.getCachedEntities();

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
        { entityId: entityId, alias: nodeData.matchedAlias },
        {
          matchCount: () => 'match_count + 1',
          lastMatchedAt: new Date(),
        },
      );
    }

    await this.refreshCache();
  }

  async getEntityStatistics(): Promise<EntityStatistics> {
    this.logger.log(`Getting entity statistics`);

    const entities = await this.entityRepository.find({
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
    userId: string,
    data: BulkImportEntitiesDto,
  ): Promise<{ created: number; skipped: number; errors: string[] }> {
    this.logger.log(`Bulk importing ${data.entities.length} entities`);

    const results = { created: 0, skipped: 0, errors: [] as string[] };

    for (const entityData of data.entities) {
      try {
        // Check for duplicates by entityId if provided
        if (entityData.entityId) {
          const existingById = await this.entityRepository.findOne({
            where: { entityId: entityData.entityId },
          });
          if (existingById) {
            if (data.options?.updateExisting) {
              await this.updateEntity(existingById.id, entityData);
              results.created++;
            } else {
              results.skipped++;
            }
            continue;
          }
        }

        // Check for duplicates by canonicalName + entityType
        const existing = await this.entityRepository.findOne({
          where: {
            canonicalName: entityData.canonicalName,
            entityType: entityData.entityType,
          },
        });

        if (existing) {
          if (data.options?.updateExisting) {
            await this.updateEntity(existing.id, entityData);
            results.created++;
          } else {
            results.skipped++;
          }
          continue;
        }

        const entity = this.entityRepository.create({
          userId,
          entityId: entityData.entityId,
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
          equivalentEntities: entityData.equivalentEntities,
          provenance: entityData.provenance,
        });

        const savedEntity = await this.entityRepository.save(entity);

        // Add aliases if provided
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

    await this.refreshCache();
    return results;
  }

  async exportEntities(
    filters: {
      entityType?: string;
      searchTerm?: string;
      source?: string;
      minConfidence?: number;
    } = {},
  ): Promise<any[]> {
    this.logger.log(
      `Exporting entities with filters: ${JSON.stringify(filters)}`,
    );

    const queryBuilder = this.entityRepository
      .createQueryBuilder('entity')
      .leftJoinAndSelect('entity.aliases', 'aliases');

    if (filters.entityType) {
      queryBuilder.andWhere('entity.entityType = :entityType', {
        entityType: filters.entityType,
      });
    }

    if (filters.searchTerm) {
      queryBuilder.andWhere(
        '(entity.canonicalName ILIKE :searchTerm OR entity.metadata::text ILIKE :searchTerm)',
        { searchTerm: `%${filters.searchTerm}%` },
      );
    }

    if (filters.source) {
      queryBuilder.andWhere('entity.source = :source', {
        source: filters.source,
      });
    }

    if (filters.minConfidence !== undefined) {
      queryBuilder.andWhere('entity.confidenceScore >= :minConfidence', {
        minConfidence: filters.minConfidence,
      });
    }

    const entities = await queryBuilder.getMany();

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
    filters: {
      entityType?: string;
      searchTerm?: string;
      source?: EntitySource;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<{ entities: GraphEntity[]; total: number }> {
    const queryBuilder = this.entityRepository
      .createQueryBuilder('entity')
      .leftJoinAndSelect('entity.aliases', 'aliases');

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

  private async addAliases(
    entityId: string,
    aliases: Array<{
      name: string;
      language?: string;
      script?: string;
      type?: any;
    }>,
  ): Promise<void> {
    const aliasEntities = aliases.map((aliasDto) =>
      this.aliasRepository.create({
        entityId: entityId,
        alias: aliasDto.name,
        language: aliasDto.language,
        script: aliasDto.script,
        type: aliasDto.type,
        similarityScore: 1.0,
      }),
    );

    await this.aliasRepository.save(aliasEntities);
  }

  private async getCachedEntities(): Promise<GraphEntity[]> {
    const cacheKey = `entity:dict:global`;
    const cached = await this.cacheManager.get(cacheKey);

    if (cached) {
      return JSON.parse(cached as string);
    }

    const entities = await this.entityRepository.find({
      relations: ['aliases'],
    });

    await this.cacheManager.set(cacheKey, entities, this.CACHE_TTL * 1000);
    return entities;
  }

  private async refreshCache(): Promise<void> {
    const cacheKey = `entity:dict:global`;
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
