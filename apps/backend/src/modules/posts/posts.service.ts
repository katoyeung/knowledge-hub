import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, ILike } from 'typeorm';
import { TypeOrmCrudService } from '@dataui/crud-typeorm';
import { createHash } from 'crypto';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { ConfigService } from '@nestjs/config';
import { Post } from './entities/post.entity';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { BulkCreatePostsDto } from './dto/bulk-create-posts.dto';
import { DeduplicationStrategy } from './enums/deduplication-strategy.enum';
import { PostStatus } from './enums/post-status.enum';
import {
  UpsertConfigDto,
  HashConfigDto,
  HashAlgorithm,
} from './dto/upsert-config.dto';

export interface PostSearchFilters {
  hash?: string;
  provider?: string;
  source?: string;
  title?: string;
  meta?: Record<string, any>;
  userId?: string;
  metaKey?: string;
  metaValue?: string;
  status?: PostStatus;
  startDate?: Date;
  endDate?: Date;
  postedAtStart?: Date;
  postedAtEnd?: Date;
  page?: number;
  limit?: number;
}

@Injectable()
export class PostsService extends TypeOrmCrudService<Post> {
  private readonly logger = new Logger(PostsService.name);
  private readonly hashCacheTTL: number; // TTL in milliseconds

  // Cache key prefix for hash deduplication
  private readonly HASH_CACHE_KEY_PREFIX = 'posts:hash:';

  constructor(
    @InjectRepository(Post)
    private readonly postRepository: Repository<Post>,
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
    private readonly configService: ConfigService,
  ) {
    super(postRepository);
    // Default to 30 days (1 month) in milliseconds, configurable via env
    const ttlDays = parseInt(
      this.configService.get<string>('POSTS_HASH_CACHE_TTL_DAYS', '30'),
      10,
    );
    this.hashCacheTTL = ttlDays * 24 * 60 * 60 * 1000; // Convert days to milliseconds
    this.logger.log(
      `Posts hash cache TTL set to ${ttlDays} days (${this.hashCacheTTL}ms)`,
    );
  }

  async create(postData: CreatePostDto): Promise<Post> {
    // Check if hash already exists (uses cache with DB fallback)
    const existing = await this.findByHash(postData.hash);
    if (existing) {
      throw new BadRequestException(
        `Post with hash ${postData.hash} already exists`,
      );
    }

    // Set status to pending for new posts
    const post = this.postRepository.create({
      ...postData,
      status: PostStatus.PENDING,
    });
    const savedPost = await this.postRepository.save(post);

    // Store in cache after creation
    const cacheKey = this.getHashCacheKey(savedPost.hash);
    try {
      await this.cacheManager.set(cacheKey, savedPost, this.hashCacheTTL);
      this.logger.debug(`Cached newly created post hash: ${savedPost.hash}`);
    } catch (error) {
      this.logger.warn(`Failed to cache post after creation: ${error.message}`);
    }

    return savedPost;
  }

  /**
   * Normalize content for comparison (trim and lowercase)
   */
  private normalizeContent(content: string | null | undefined): string {
    if (!content) return '';
    return content.trim().toLowerCase();
  }

  /**
   * Extract field value from nested object using dot notation
   */
  private extractFieldValue(data: Record<string, any>, fieldPath: string): any {
    const parts = fieldPath.split('.');
    let value = data;

    for (const part of parts) {
      if (value === null || value === undefined) {
        return null;
      }
      value = value[part];
    }

    return value;
  }

  /**
   * Transform string value based on transform type
   */
  private transformValue(value: any, transform?: string): any {
    if (typeof value !== 'string' || !transform) {
      return value;
    }

    switch (transform.toLowerCase()) {
      case 'trim':
        return value.trim();
      case 'lowercase':
        return value.toLowerCase();
      case 'uppercase':
        return value.toUpperCase();
      case 'trim_lowercase':
        return value.trim().toLowerCase();
      case 'trim_uppercase':
        return value.trim().toUpperCase();
      default:
        return value;
    }
  }

  /**
   * Calculate hash from source data based on hash configuration
   */
  private calculateHash(
    sourceData: Record<string, any>,
    hashConfig: HashConfigDto,
  ): string {
    const values: string[] = [];

    for (const fieldPath of hashConfig.fields) {
      const value = this.extractFieldValue(sourceData, fieldPath);
      if (value !== null && value !== undefined) {
        values.push(String(value));
      }
    }

    const separator = hashConfig.separator || '|';
    const combined = values.join(separator);
    const prefix = hashConfig.prefix || '';
    const toHash = prefix + combined;

    const hash = createHash(hashConfig.algorithm || HashAlgorithm.SHA256);
    hash.update(toHash);
    return hash.digest('hex');
  }

  /**
   * Transform source data to Post DTO using field mappings
   */
  private transformSourceData(
    sourceData: Record<string, any>,
    config: UpsertConfigDto,
  ): CreatePostDto {
    const result: Partial<CreatePostDto> = {
      meta: config.defaultMeta ? { ...config.defaultMeta } : {},
    };

    // Calculate hash if hashConfig provided
    if (config.hashConfig) {
      result.hash = this.calculateHash(sourceData, config.hashConfig);
    } else if (sourceData.hash) {
      // Fallback to provided hash
      result.hash = sourceData.hash;
    } else {
      throw new BadRequestException(
        'Hash is required. Provide hash in sourceData or configure hashConfig.',
      );
    }

    // Map title if titleMapping provided
    if (config.titleMapping) {
      const titleValue = this.extractFieldValue(
        sourceData,
        config.titleMapping,
      );
      if (titleValue !== null && titleValue !== undefined) {
        result.title = String(titleValue);
      }
    } else if (sourceData.title) {
      result.title = sourceData.title;
    }

    // Map provider and source if available
    if (sourceData.provider) {
      result.provider = sourceData.provider;
    }
    if (sourceData.source) {
      result.source = sourceData.source;
    }

    // Track which source fields have been mapped
    const mappedSourceFields = new Set<string>();

    // Apply field mappings
    if (config.fieldMappings && config.fieldMappings.length > 0) {
      for (const mapping of config.fieldMappings) {
        mappedSourceFields.add(mapping.from); // Track that this source field was mapped
        const sourceValue = this.extractFieldValue(sourceData, mapping.from);

        if (sourceValue !== null && sourceValue !== undefined) {
          const transformedValue = this.transformValue(
            sourceValue,
            mapping.transform,
          );

          // Handle special target fields
          if (mapping.to === 'title') {
            result.title = String(transformedValue);
          } else if (mapping.to === 'provider') {
            result.provider = String(transformedValue);
          } else if (mapping.to === 'source') {
            result.source = String(transformedValue);
          } else if (mapping.to.startsWith('meta.')) {
            // Map to meta field
            const metaField = mapping.to.substring(5); // Remove 'meta.' prefix
            if (!result.meta) {
              result.meta = {};
            }
            result.meta[metaField] = transformedValue;
          } else {
            // Default: add to meta
            if (!result.meta) {
              result.meta = {};
            }
            result.meta[mapping.to] = transformedValue;
          }
        }
      }
    }

    // Copy unmapped root-level fields to meta (except already mapped or excluded fields)
    const excludedFields = ['hash', 'title', 'provider', 'source'];
    for (const key in sourceData) {
      if (
        !excludedFields.includes(key) &&
        !mappedSourceFields.has(key) &&
        sourceData[key] !== undefined &&
        sourceData[key] !== null
      ) {
        if (!result.meta) {
          result.meta = {};
        }
        // Only copy primitive values, nested objects are handled separately
        if (
          typeof sourceData[key] !== 'object' ||
          Array.isArray(sourceData[key])
        ) {
          result.meta[key] = sourceData[key];
        } else {
          // Merge nested objects into meta
          result.meta[key] = { ...result.meta[key], ...sourceData[key] };
        }
      }
    }

    // Ensure meta object exists
    if (!result.meta) {
      result.meta = {};
    }

    return result as CreatePostDto;
  }

  /**
   * Find duplicate post based on deduplication strategy
   */
  async findDuplicate(
    postData: CreatePostDto | UpdatePostDto,
    strategy: DeduplicationStrategy = DeduplicationStrategy.HASH,
  ): Promise<Post | null> {
    // Strategy 1: Hash-based (if hash is provided)
    if (strategy === DeduplicationStrategy.HASH && postData.hash) {
      return this.findByHash(postData.hash);
    }

    // Strategy 2: Title + Content only (content from meta.content)
    if (strategy === DeduplicationStrategy.TITLE_CONTENT) {
      const content = postData.meta?.content;
      if (!postData.title && !content) {
        return null; // Can't deduplicate without title or content
      }

      const normalizedTitle = this.normalizeContent(postData.title);
      const normalizedContent = this.normalizeContent(content);

      const queryBuilder = this.postRepository.createQueryBuilder('post');

      if (normalizedTitle && normalizedContent) {
        queryBuilder
          .where('LOWER(TRIM(post.title)) = :title', { title: normalizedTitle })
          .andWhere("LOWER(TRIM(post.meta->>'content')) = :content", {
            content: normalizedContent,
          });
      } else if (normalizedTitle) {
        queryBuilder.where('LOWER(TRIM(post.title)) = :title', {
          title: normalizedTitle,
        });
      } else if (normalizedContent) {
        queryBuilder.where("LOWER(TRIM(post.meta->>'content')) = :content", {
          content: normalizedContent,
        });
      }

      return queryBuilder.getOne();
    }

    // Strategy 3: Title + Content + Site (content from meta.content)
    if (strategy === DeduplicationStrategy.TITLE_CONTENT_SITE) {
      const site = postData.meta?.site;
      const content = postData.meta?.content;
      if (!site) {
        // Fallback to title + content if site not available
        return this.findDuplicate(
          postData,
          DeduplicationStrategy.TITLE_CONTENT,
        );
      }

      const normalizedTitle = this.normalizeContent(postData.title);
      const normalizedContent = this.normalizeContent(content);

      const queryBuilder = this.postRepository.createQueryBuilder('post');

      if (normalizedTitle) {
        queryBuilder.where('LOWER(TRIM(post.title)) = :title', {
          title: normalizedTitle,
        });
      }
      if (normalizedContent) {
        queryBuilder.andWhere("LOWER(TRIM(post.meta->>'content')) = :content", {
          content: normalizedContent,
        });
      }
      queryBuilder.andWhere("post.meta->>'site' = :site", { site });

      return queryBuilder.getOne();
    }

    // Strategy 4: Title + Content + Channel (content from meta.content)
    if (strategy === DeduplicationStrategy.TITLE_CONTENT_CHANNEL) {
      const channel = postData.meta?.channel;
      const content = postData.meta?.content;
      if (!channel) {
        // Fallback to title + content if channel not available
        return this.findDuplicate(
          postData,
          DeduplicationStrategy.TITLE_CONTENT,
        );
      }

      const normalizedTitle = this.normalizeContent(postData.title);
      const normalizedContent = this.normalizeContent(content);

      const queryBuilder = this.postRepository.createQueryBuilder('post');

      if (normalizedTitle) {
        queryBuilder.where('LOWER(TRIM(post.title)) = :title', {
          title: normalizedTitle,
        });
      }
      if (normalizedContent) {
        queryBuilder.andWhere("LOWER(TRIM(post.meta->>'content')) = :content", {
          content: normalizedContent,
        });
      }
      queryBuilder.andWhere("post.meta->>'channel' = :channel", { channel });

      return queryBuilder.getOne();
    }

    // Strategy 5: Title + Content + Site + Channel (strictest, content from meta.content)
    if (strategy === DeduplicationStrategy.TITLE_CONTENT_SITE_CHANNEL) {
      const site = postData.meta?.site;
      const channel = postData.meta?.channel;
      const content = postData.meta?.content;

      const normalizedTitle = this.normalizeContent(postData.title);
      const normalizedContent = this.normalizeContent(content);

      const queryBuilder = this.postRepository.createQueryBuilder('post');

      if (normalizedTitle) {
        queryBuilder.where('LOWER(TRIM(post.title)) = :title', {
          title: normalizedTitle,
        });
      }
      if (normalizedContent) {
        queryBuilder.andWhere("LOWER(TRIM(post.meta->>'content')) = :content", {
          content: normalizedContent,
        });
      }
      if (site) {
        queryBuilder.andWhere("post.meta->>'site' = :site", { site });
      }
      if (channel) {
        queryBuilder.andWhere("post.meta->>'channel' = :channel", { channel });
      }

      return queryBuilder.getOne();
    }

    return null;
  }

  /**
   * Find duplicate using custom field mappings
   * @param postData - Post data to check
   * @param fieldMappings - Array of field paths to match (e.g., ['title', 'content' (uses meta.content), 'meta.site', 'meta.channel'])
   */
  async findDuplicateByFieldMapping(
    postData: CreatePostDto | UpdatePostDto,
    fieldMappings: string[],
  ): Promise<Post | null> {
    if (!fieldMappings || fieldMappings.length === 0) {
      return null;
    }

    const queryBuilder = this.postRepository.createQueryBuilder('post');
    let hasConditions = false;

    for (const fieldPath of fieldMappings) {
      if (fieldPath === 'title') {
        if (!postData.title) continue;
        const normalizedTitle = this.normalizeContent(postData.title);
        queryBuilder.andWhere('LOWER(TRIM(post.title)) = :title', {
          title: normalizedTitle,
        });
        hasConditions = true;
      } else if (fieldPath === 'content') {
        // Content is stored in meta.content
        const content = postData.meta?.content;
        if (!content) continue;
        const normalizedContent = this.normalizeContent(content);
        queryBuilder.andWhere("LOWER(TRIM(post.meta->>'content')) = :content", {
          content: normalizedContent,
        });
        hasConditions = true;
      } else if (fieldPath.startsWith('meta.')) {
        // Extract meta field name (e.g., 'meta.site' -> 'site')
        const metaField = fieldPath.substring(5); // Remove 'meta.' prefix
        const metaValue = postData.meta?.[metaField];

        if (metaValue === null || metaValue === undefined) {
          // Skip this field if value doesn't exist
          continue;
        }

        // Handle different value types for JSONB comparison
        if (typeof metaValue === 'string') {
          queryBuilder.andWhere(`post.meta->>:metaField = :metaValue`, {
            metaField,
            metaValue: metaValue.trim(),
          });
        } else if (
          typeof metaValue === 'number' ||
          typeof metaValue === 'boolean'
        ) {
          queryBuilder.andWhere(`post.meta->>:metaField = :metaValue`, {
            metaField,
            metaValue,
          });
        } else {
          // For objects/arrays, use JSON comparison
          queryBuilder.andWhere(`post.meta->>:metaField = :metaValue::jsonb`, {
            metaField,
            metaValue: JSON.stringify(metaValue),
          });
        }
        hasConditions = true;
      }
    }

    if (!hasConditions) {
      return null;
    }

    return queryBuilder.getOne();
  }

  async upsertByHash(postData: CreatePostDto | UpdatePostDto): Promise<Post> {
    if (!postData.hash) {
      throw new BadRequestException('Hash is required for upsert operation');
    }

    // Check cache first, then DB if needed
    const existing = await this.findByHash(postData.hash);

    if (existing) {
      // Update existing post
      await this.postRepository.update(existing.id, postData);
      const updatedPost = await this.findById(existing.id);

      // Update cache with new data
      const cacheKey = this.getHashCacheKey(updatedPost.hash);
      try {
        await this.cacheManager.set(cacheKey, updatedPost, this.hashCacheTTL);
        this.logger.debug(`Updated cache for hash: ${updatedPost.hash}`);
      } catch (error) {
        this.logger.warn(
          `Failed to update cache after upsert: ${error.message}`,
        );
      }

      return updatedPost;
    } else {
      // Create new post - handle duplicate key errors gracefully
      const post = this.postRepository.create({
        ...postData,
        status: PostStatus.PENDING,
      });
      try {
        const savedPost = await this.postRepository.save(post);

        // Store in cache after creation
        const cacheKey = this.getHashCacheKey(savedPost.hash);
        try {
          await this.cacheManager.set(cacheKey, savedPost, this.hashCacheTTL);
          this.logger.debug(
            `Cached newly upserted post hash: ${savedPost.hash}`,
          );
        } catch (error) {
          this.logger.warn(
            `Failed to cache post after upsert: ${error.message}`,
          );
        }

        return savedPost;
      } catch (error: any) {
        // Handle unique constraint violation (duplicate hash)
        if (
          error.code === '23505' ||
          error.message?.includes('duplicate key') ||
          error.message?.includes('unique constraint')
        ) {
          this.logger.warn(
            `Duplicate key detected for hash ${postData.hash}, attempting to update existing post`,
          );

          // Try to find existing post by hash and update it
          const existing = await this.findByHash(postData.hash);
          if (existing) {
            await this.postRepository.update(existing.id, postData);
            const updatedPost = await this.findById(existing.id);

            // Update cache
            const cacheKey = this.getHashCacheKey(updatedPost.hash);
            try {
              await this.cacheManager.set(
                cacheKey,
                updatedPost,
                this.hashCacheTTL,
              );
              this.logger.debug(
                `Updated cache after duplicate key recovery for hash: ${updatedPost.hash}`,
              );
            } catch (cacheError) {
              this.logger.warn(
                `Failed to update cache after duplicate key recovery: ${cacheError.message}`,
              );
            }

            return updatedPost;
          }
        }

        // Re-throw if not a duplicate key error
        throw error;
      }
    }
  }

  /**
   * Upsert post using specified deduplication strategy
   */
  async upsert(
    postData: CreatePostDto | UpdatePostDto,
    strategy: DeduplicationStrategy = DeduplicationStrategy.HASH,
    fieldMappings?: string[],
  ): Promise<Post> {
    // Try hash-based first if hash is provided
    if (postData.hash && strategy === DeduplicationStrategy.HASH) {
      return this.upsertByHash(postData);
    }

    // Find duplicate based on strategy
    let existing: Post | null = null;

    if (strategy === DeduplicationStrategy.CUSTOM && fieldMappings) {
      existing = await this.findDuplicateByFieldMapping(
        postData,
        fieldMappings,
      );
    } else {
      existing = await this.findDuplicate(postData, strategy);
    }

    if (existing) {
      // Update existing post
      await this.postRepository.update(existing.id, postData);
      const updatedPost = await this.findById(existing.id);

      // Update cache if hash exists
      if (postData.hash) {
        const cacheKey = this.getHashCacheKey(updatedPost.hash);
        try {
          await this.cacheManager.set(cacheKey, updatedPost, this.hashCacheTTL);
          this.logger.debug(`Updated cache for hash: ${updatedPost.hash}`);
        } catch (error) {
          this.logger.warn(
            `Failed to update cache after upsert: ${error.message}`,
          );
        }
      }

      return updatedPost;
    } else {
      // Create new post - handle duplicate key errors gracefully
      const post = this.postRepository.create({
        ...postData,
        status: PostStatus.PENDING,
      });
      try {
        const savedPost = await this.postRepository.save(post);

        // Cache new post if hash exists
        if (postData.hash) {
          const cacheKey = this.getHashCacheKey(savedPost.hash);
          try {
            await this.cacheManager.set(cacheKey, savedPost, this.hashCacheTTL);
            this.logger.debug(
              `Cached newly upserted post hash: ${savedPost.hash}`,
            );
          } catch (error) {
            this.logger.warn(
              `Failed to cache post after upsert: ${error.message}`,
            );
          }
        }

        return savedPost;
      } catch (error: any) {
        // Handle unique constraint violation (duplicate hash)
        if (
          error.code === '23505' ||
          error.message?.includes('duplicate key') ||
          error.message?.includes('unique constraint')
        ) {
          this.logger.warn(
            `Duplicate key detected for hash ${postData.hash}, attempting to update existing post`,
          );

          // Try to find existing post by hash and update it
          if (postData.hash) {
            const existing = await this.findByHash(postData.hash);
            if (existing) {
              await this.postRepository.update(existing.id, postData);
              const updatedPost = await this.findById(existing.id);

              // Update cache
              if (postData.hash) {
                const cacheKey = this.getHashCacheKey(updatedPost.hash);
                try {
                  await this.cacheManager.set(
                    cacheKey,
                    updatedPost,
                    this.hashCacheTTL,
                  );
                  this.logger.debug(
                    `Updated cache after duplicate key recovery for hash: ${updatedPost.hash}`,
                  );
                } catch (cacheError) {
                  this.logger.warn(
                    `Failed to update cache after duplicate key recovery: ${cacheError.message}`,
                  );
                }
              }

              return updatedPost;
            }
          }

          // Fallback: try finding by other strategy
          const fallbackExisting = await this.findDuplicate(postData, strategy);
          if (fallbackExisting) {
            await this.postRepository.update(fallbackExisting.id, postData);
            return await this.findById(fallbackExisting.id);
          }
        }

        // Re-throw if not a duplicate key error
        throw error;
      }
    }
  }

  /**
   * Flexible upsert with field mapping and hash calculation
   * @param sourceData - Raw source data (any structure)
   * @param config - Configuration for hash calculation and field mapping
   * @param strategy - Deduplication strategy (optional, defaults to HASH)
   */
  async upsertWithConfig(
    sourceData: Record<string, any>,
    config: UpsertConfigDto,
    strategy: DeduplicationStrategy = DeduplicationStrategy.HASH,
  ): Promise<Post> {
    // Transform source data to Post DTO
    const postData = this.transformSourceData(sourceData, config);

    // Upsert using the transformed data
    return this.upsert(postData, strategy);
  }

  /**
   * Bulk upsert with field mapping and hash calculation
   * @param sourceDataArray - Array of raw source data
   * @param config - Configuration for hash calculation and field mapping
   * @param strategy - Deduplication strategy (optional, defaults to HASH)
   */
  async bulkUpsertWithConfig(
    sourceDataArray: Record<string, any>[],
    config: UpsertConfigDto,
    strategy: DeduplicationStrategy = DeduplicationStrategy.HASH,
  ): Promise<{ items: string[]; total: number; lastUpdated: string }> {
    const items: string[] = [];
    let created = 0;
    let updated = 0;

    for (const sourceData of sourceDataArray) {
      try {
        // Transform source data to Post DTO
        const postData = this.transformSourceData(sourceData, config);

        // Find duplicate
        let existing: Post | null = null;

        if (strategy === DeduplicationStrategy.CUSTOM && config.fieldMappings) {
          // Extract field mappings for deduplication from config
          const dedupFields = config.hashConfig
            ? config.hashConfig.fields
            : ['hash'];
          existing = await this.findDuplicateByFieldMapping(
            postData,
            dedupFields,
          );
        } else {
          existing = await this.findDuplicate(postData, strategy);
        }

        if (existing) {
          await this.postRepository.update(existing.id, postData);
          const updatedPost = await this.findById(existing.id);

          // Update cache if hash exists
          if (postData.hash) {
            const cacheKey = this.getHashCacheKey(updatedPost.hash);
            try {
              await this.cacheManager.set(
                cacheKey,
                updatedPost,
                this.hashCacheTTL,
              );
            } catch (error) {
              this.logger.warn(
                `Failed to update cache in bulk upsert with config: ${error.message}`,
              );
            }
          }

          items.push(existing.id);
          updated++;
        } else {
          // Create new post - handle duplicate key errors gracefully
          const post = this.postRepository.create({
            ...postData,
            status: PostStatus.PENDING,
          });
          try {
            const savedPost = await this.postRepository.save(post);

            // Cache new post if hash exists
            if (postData.hash) {
              const cacheKey = this.getHashCacheKey(savedPost.hash);
              try {
                await this.cacheManager.set(
                  cacheKey,
                  savedPost,
                  this.hashCacheTTL,
                );
              } catch (error) {
                this.logger.warn(
                  `Failed to cache in bulk upsert with config: ${error.message}`,
                );
              }
            }

            items.push(savedPost.id);
            created++;
          } catch (error: any) {
            // Handle unique constraint violation (duplicate hash)
            if (
              error.code === '23505' ||
              error.message?.includes('duplicate key') ||
              error.message?.includes('unique constraint')
            ) {
              this.logger.warn(
                `Duplicate key detected for hash ${postData.hash} in bulk upsert, attempting to update existing post`,
              );

              // Try to find existing post by hash and update it
              let existingPost: Post | null = null;
              if (postData.hash) {
                existingPost = await this.findByHash(postData.hash);
              }
              if (
                !existingPost &&
                strategy === DeduplicationStrategy.CUSTOM &&
                config.fieldMappings
              ) {
                const dedupFields = config.hashConfig
                  ? config.hashConfig.fields
                  : ['hash'];
                existingPost = await this.findDuplicateByFieldMapping(
                  postData,
                  dedupFields,
                );
              }
              if (!existingPost) {
                existingPost = await this.findDuplicate(postData, strategy);
              }

              if (existingPost) {
                await this.postRepository.update(existingPost.id, postData);
                const updatedPost = await this.findById(existingPost.id);

                // Update cache if hash exists
                if (postData.hash) {
                  const cacheKey = this.getHashCacheKey(updatedPost.hash);
                  try {
                    await this.cacheManager.set(
                      cacheKey,
                      updatedPost,
                      this.hashCacheTTL,
                    );
                  } catch (cacheError) {
                    this.logger.warn(
                      `Failed to update cache after duplicate key recovery: ${cacheError.message}`,
                    );
                  }
                }

                items.push(updatedPost.id);
                updated++;
              } else {
                // Could not find existing post, log error and skip
                this.logger.error(
                  `Duplicate key error but could not find existing post for hash ${postData.hash}`,
                );
              }
            } else {
              // Re-throw if not a duplicate key error
              throw error;
            }
          }
        }
      } catch (error) {
        this.logger.error(
          `Error processing post from source data: ${error.message}`,
        );
        // Continue with next post
      }
    }

    return {
      items,
      total: items.length,
      lastUpdated: new Date().toISOString(),
    };
  }

  async bulkUpsert(
    postsData: BulkCreatePostsDto,
    strategy: DeduplicationStrategy = DeduplicationStrategy.HASH,
    fieldMappings?: string[],
  ): Promise<{ items: string[]; total: number; lastUpdated: string }> {
    const items: string[] = [];
    let created = 0;
    let updated = 0;

    for (const postData of postsData.posts) {
      try {
        let existing: Post | null = null;

        if (strategy === DeduplicationStrategy.CUSTOM && fieldMappings) {
          existing = await this.findDuplicateByFieldMapping(
            postData,
            fieldMappings,
          );
        } else {
          existing = await this.findDuplicate(postData, strategy);
        }

        if (existing) {
          await this.postRepository.update(existing.id, postData);
          items.push(existing.id);
          updated++;
        } else {
          const post = this.postRepository.create({
            ...postData,
            status: PostStatus.PENDING,
          });
          const savedPost = await this.postRepository.save(post);
          items.push(savedPost.id);
          created++;
        }
      } catch (error) {
        this.logger.error(
          `Error processing post with hash ${postData.hash}: ${error.message}`,
        );
        // Continue with next post
      }
    }

    return {
      items,
      total: items.length,
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Get cache key for hash
   */
  private getHashCacheKey(hash: string): string {
    return `${this.HASH_CACHE_KEY_PREFIX}${hash}`;
  }

  /**
   * Check if hash exists in cache, fallback to database if not found
   * Stores result in cache if found in database
   */
  async findByHash(hash: string): Promise<Post | null> {
    const cacheKey = this.getHashCacheKey(hash);

    try {
      // Try to get from cache first
      const cachedPost = await this.cacheManager.get<Post>(cacheKey);
      if (cachedPost) {
        this.logger.debug(`Cache hit for hash: ${hash}`);
        return cachedPost;
      }

      this.logger.debug(`Cache miss for hash: ${hash}, querying database`);

      // If not in cache, query database
      const post = await this.postRepository.findOne({
        where: { hash },
      });

      // If found in database, store in cache with TTL
      if (post) {
        await this.cacheManager.set(cacheKey, post, this.hashCacheTTL);
        this.logger.debug(
          `Cached hash: ${hash} with TTL: ${this.hashCacheTTL}ms`,
        );
      }

      return post;
    } catch (error) {
      // If cache operation fails, fallback to database query
      this.logger.warn(
        `Cache operation failed for hash ${hash}, falling back to database: ${error.message}`,
      );
      return this.postRepository.findOne({
        where: { hash },
      });
    }
  }

  /**
   * Invalidate hash from cache (useful when post is updated or deleted)
   */
  async invalidateHashCache(hash: string): Promise<void> {
    const cacheKey = this.getHashCacheKey(hash);
    try {
      await this.cacheManager.del(cacheKey);
      this.logger.debug(`Invalidated cache for hash: ${hash}`);
    } catch (error) {
      this.logger.warn(
        `Failed to invalidate cache for hash ${hash}: ${error.message}`,
      );
    }
  }

  async findById(id: string): Promise<Post> {
    const post = await this.postRepository.findOne({
      where: { id },
      relations: ['user'],
    });

    if (!post) {
      throw new NotFoundException(`Post with id ${id} not found`);
    }

    return post;
  }

  async search(
    filters: PostSearchFilters,
  ): Promise<{ data: Post[]; total: number; page: number; limit: number }> {
    const page = filters.page || 1;
    const limit = filters.limit || 10;
    const skip = (page - 1) * limit;

    const where: FindOptionsWhere<Post> = {};

    if (filters.hash) {
      where.hash = filters.hash;
    }

    if (filters.provider) {
      where.provider = filters.provider;
    }

    if (filters.source) {
      where.source = filters.source;
    }

    if (filters.title) {
      where.title = ILike(`%${filters.title}%`);
    }

    // Content is stored in meta.content, use metaKey filter to search it
    // Example: metaKey=content&metaValue="search term"

    if (filters.userId) {
      where.userId = filters.userId;
    }

    if (filters.status) {
      where.status = filters.status;
    }

    // Build query builder for complex queries
    const queryBuilder = this.postRepository.createQueryBuilder('post');

    // Apply basic filters
    if (where.hash)
      queryBuilder.andWhere('post.hash = :hash', { hash: where.hash });
    if (where.provider)
      queryBuilder.andWhere('post.provider = :provider', {
        provider: where.provider,
      });
    if (where.source)
      queryBuilder.andWhere('post.source = :source', { source: where.source });
    if (where.title)
      queryBuilder.andWhere('post.title ILIKE :title', {
        title: `%${filters.title}%`,
      });
    // Content is stored in meta.content - use metaKey filter to search it
    if (where.userId)
      queryBuilder.andWhere('post.user_id = :userId', { userId: where.userId });
    if (where.status)
      queryBuilder.andWhere('post.status = :status', { status: where.status });

    // Handle date range filtering on meta field
    if (filters.startDate || filters.endDate) {
      if (filters.startDate && filters.endDate) {
        queryBuilder.andWhere(
          "(post.meta->>'post_timestamp' >= :startDate AND post.meta->>'post_timestamp' <= :endDate)",
          {
            startDate: filters.startDate.toISOString(),
            endDate: filters.endDate.toISOString(),
          },
        );
      } else if (filters.startDate) {
        queryBuilder.andWhere("post.meta->>'post_timestamp' >= :startDate", {
          startDate: filters.startDate.toISOString(),
        });
      } else if (filters.endDate) {
        queryBuilder.andWhere("post.meta->>'post_timestamp' <= :endDate", {
          endDate: filters.endDate.toISOString(),
        });
      }
    }

    // Handle posted_at date range filtering
    if (filters.postedAtStart || filters.postedAtEnd) {
      if (filters.postedAtStart && filters.postedAtEnd) {
        queryBuilder.andWhere(
          'post.posted_at >= :postedAtStart AND post.posted_at <= :postedAtEnd',
          {
            postedAtStart: filters.postedAtStart,
            postedAtEnd: filters.postedAtEnd,
          },
        );
      } else if (filters.postedAtStart) {
        queryBuilder.andWhere('post.posted_at >= :postedAtStart', {
          postedAtStart: filters.postedAtStart,
        });
      } else if (filters.postedAtEnd) {
        queryBuilder.andWhere('post.posted_at <= :postedAtEnd', {
          postedAtEnd: filters.postedAtEnd,
        });
      }
    }

    // Handle meta field queries
    if (filters.metaKey && filters.metaValue) {
      const metaValueStr = String(filters.metaValue);

      // Check if metaValue is a regex pattern (format: /pattern/flags)
      const regexPattern = /^\/(.+)\/([gimsuvy]*)$/;
      const regexMatch = metaValueStr.match(regexPattern);

      // Also check if the value contains regex metacharacters (indicating it's likely a regex pattern)
      const hasRegexMetacharacters = /[()|\[\]*+?{}^$\.]/.test(metaValueStr);
      const isRegexFormat = regexMatch !== null;

      if (isRegexFormat) {
        // Extract pattern and flags from /pattern/flags format
        const pattern = regexMatch[1];
        const flags = regexMatch[2];

        // Determine case sensitivity from flags
        const caseInsensitive = flags.includes('i');
        const regexOperator = caseInsensitive ? '~*' : '~';

        // Use PostgreSQL regex matching on the JSONB text value
        // Convert JSONB to text for regex matching
        queryBuilder.andWhere(
          `CAST(post.meta->>:metaKey AS TEXT) ${regexOperator} :regexPattern`,
          {
            metaKey: filters.metaKey,
            regexPattern: pattern,
          },
        );
      } else if (hasRegexMetacharacters && !metaValueStr.includes('/')) {
        // If it contains regex metacharacters but isn't in /pattern/flags format,
        // treat it as a regex pattern (for backward compatibility and ease of use)
        const regexOperator = '~*'; // Default to case-insensitive for better matching

        queryBuilder.andWhere(
          `CAST(post.meta->>:metaKey AS TEXT) ${regexOperator} :regexPattern`,
          {
            metaKey: filters.metaKey,
            regexPattern: metaValueStr,
          },
        );
      } else {
        // Exact match (original behavior)
        queryBuilder.andWhere(`post.meta->>:metaKey = :metaValue`, {
          metaKey: filters.metaKey,
          metaValue: JSON.stringify(filters.metaValue),
        });
      }
    } else if (filters.metaKey) {
      queryBuilder.andWhere(`post.meta ? :metaKey`, {
        metaKey: filters.metaKey,
      });
    }

    // Get total count
    const total = await queryBuilder.getCount();

    // Apply pagination
    queryBuilder.skip(skip).take(limit);

    // Order by created date descending
    queryBuilder.orderBy('post.createdAt', 'DESC');

    // Don't load user relation - userId is sufficient and user data should not be exposed

    const data = await queryBuilder.getMany();

    return {
      data,
      total,
      page,
      limit,
    };
  }

  async findByMetaField(key: string, value?: any): Promise<Post[]> {
    const queryBuilder = this.postRepository.createQueryBuilder('post');

    if (value !== undefined) {
      queryBuilder.where(`post.meta->>:key = :value`, {
        key,
        value: JSON.stringify(value),
      });
    } else {
      queryBuilder.where(`post.meta ? :key`, {
        key,
      });
    }

    return queryBuilder.getMany();
  }

  async update(id: string, data: UpdatePostDto): Promise<Post> {
    // Get existing post to check for hash change
    const existingPost = await this.findById(id);
    if (!existingPost) {
      throw new NotFoundException(`Post with id ${id} not found`);
    }

    await this.postRepository.update(id, data);
    const updatedPost = await this.findById(id);

    // If hash changed, invalidate old cache and cache new hash
    if (data.hash && data.hash !== existingPost.hash) {
      await this.invalidateHashCache(existingPost.hash);
      const cacheKey = this.getHashCacheKey(updatedPost.hash);
      try {
        await this.cacheManager.set(cacheKey, updatedPost, this.hashCacheTTL);
        this.logger.debug(`Updated cache for new hash: ${updatedPost.hash}`);
      } catch (error) {
        this.logger.warn(`Failed to cache after hash change: ${error.message}`);
      }
    } else if (updatedPost.hash) {
      // Update cache with new data if hash unchanged
      const cacheKey = this.getHashCacheKey(updatedPost.hash);
      try {
        await this.cacheManager.set(cacheKey, updatedPost, this.hashCacheTTL);
        this.logger.debug(`Updated cache for hash: ${updatedPost.hash}`);
      } catch (error) {
        this.logger.warn(`Failed to update cache: ${error.message}`);
      }
    }

    return updatedPost;
  }

  async delete(id: string): Promise<void> {
    // Get post before deletion to invalidate cache by hash
    const post = await this.findById(id);
    if (!post) {
      throw new NotFoundException(`Post with id ${id} not found`);
    }

    const result = await this.postRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Post with id ${id} not found`);
    }

    // Invalidate cache after deletion
    if (post.hash) {
      await this.invalidateHashCache(post.hash);
    }
  }

  async batchDelete(postIds: string[]): Promise<{ deleted: number }> {
    this.logger.log(`🗑️ Bulk deleting ${postIds.length} posts`);

    if (!postIds || postIds.length === 0) {
      throw new BadRequestException('No post IDs provided');
    }

    // Get posts before deletion to invalidate cache
    const posts = await this.postRepository.find({
      where: postIds.map((id) => ({ id })),
      select: ['id', 'hash'],
    });

    if (posts.length === 0) {
      this.logger.warn('No posts found for bulk delete');
      return { deleted: 0 };
    }

    // Delete posts
    const deleteResult = await this.postRepository.delete(
      posts.map((p) => p.id),
    );

    // Invalidate cache for all deleted posts
    for (const post of posts) {
      if (post.hash) {
        await this.invalidateHashCache(post.hash);
      }
    }

    this.logger.log(`✅ Deleted ${deleteResult.affected || 0} posts`);
    return { deleted: deleteResult.affected || 0 };
  }

  async deleteAllByFilters(
    filters: PostSearchFilters,
  ): Promise<{ deleted: number }> {
    this.logger.log(`🗑️ Deleting all posts matching filters`);

    // Build the same query as search but without pagination
    const queryBuilder = this.postRepository.createQueryBuilder('post');

    // Apply filters (same logic as search method)
    if (filters.hash)
      queryBuilder.andWhere('post.hash = :hash', { hash: filters.hash });
    if (filters.provider)
      queryBuilder.andWhere('post.provider = :provider', {
        provider: filters.provider,
      });
    if (filters.source)
      queryBuilder.andWhere('post.source = :source', {
        source: filters.source,
      });
    if (filters.title)
      queryBuilder.andWhere('post.title ILIKE :title', {
        title: `%${filters.title}%`,
      });
    if (filters.userId)
      queryBuilder.andWhere('post.user_id = :userId', {
        userId: filters.userId,
      });

    // Handle date range filtering
    if (filters.startDate || filters.endDate) {
      if (filters.startDate && filters.endDate) {
        queryBuilder.andWhere(
          "(post.meta->>'post_timestamp' >= :startDate AND post.meta->>'post_timestamp' <= :endDate)",
          {
            startDate: filters.startDate.toISOString(),
            endDate: filters.endDate.toISOString(),
          },
        );
      } else if (filters.startDate) {
        queryBuilder.andWhere("post.meta->>'post_timestamp' >= :startDate", {
          startDate: filters.startDate.toISOString(),
        });
      } else if (filters.endDate) {
        queryBuilder.andWhere("post.meta->>'post_timestamp' <= :endDate", {
          endDate: filters.endDate.toISOString(),
        });
      }
    }

    // Handle posted_at date range filtering
    if (filters.postedAtStart || filters.postedAtEnd) {
      if (filters.postedAtStart && filters.postedAtEnd) {
        queryBuilder.andWhere(
          'post.posted_at >= :postedAtStart AND post.posted_at <= :postedAtEnd',
          {
            postedAtStart: filters.postedAtStart,
            postedAtEnd: filters.postedAtEnd,
          },
        );
      } else if (filters.postedAtStart) {
        queryBuilder.andWhere('post.posted_at >= :postedAtStart', {
          postedAtStart: filters.postedAtStart,
        });
      } else if (filters.postedAtEnd) {
        queryBuilder.andWhere('post.posted_at <= :postedAtEnd', {
          postedAtEnd: filters.postedAtEnd,
        });
      }
    }

    // Handle meta field queries
    if (filters.metaKey && filters.metaValue) {
      const metaValueStr = String(filters.metaValue);

      // Check if metaValue is a regex pattern (format: /pattern/flags)
      const regexPattern = /^\/(.+)\/([gimsuvy]*)$/;
      const regexMatch = metaValueStr.match(regexPattern);

      // Also check if the value contains regex metacharacters (indicating it's likely a regex pattern)
      const hasRegexMetacharacters = /[()|\[\]*+?{}^$\.]/.test(metaValueStr);
      const isRegexFormat = regexMatch !== null;

      if (isRegexFormat) {
        // Extract pattern and flags from /pattern/flags format
        const pattern = regexMatch[1];
        const flags = regexMatch[2];

        // Determine case sensitivity from flags
        const caseInsensitive = flags.includes('i');
        const regexOperator = caseInsensitive ? '~*' : '~';

        // Use PostgreSQL regex matching on the JSONB text value
        // Convert JSONB to text for regex matching
        queryBuilder.andWhere(
          `CAST(post.meta->>:metaKey AS TEXT) ${regexOperator} :regexPattern`,
          {
            metaKey: filters.metaKey,
            regexPattern: pattern,
          },
        );
      } else if (hasRegexMetacharacters && !metaValueStr.includes('/')) {
        // If it contains regex metacharacters but isn't in /pattern/flags format,
        // treat it as a regex pattern (for backward compatibility and ease of use)
        const regexOperator = '~*'; // Default to case-insensitive for better matching

        queryBuilder.andWhere(
          `CAST(post.meta->>:metaKey AS TEXT) ${regexOperator} :regexPattern`,
          {
            metaKey: filters.metaKey,
            regexPattern: metaValueStr,
          },
        );
      } else {
        // Exact match (original behavior)
        queryBuilder.andWhere(`post.meta->>:metaKey = :metaValue`, {
          metaKey: filters.metaKey,
          metaValue: JSON.stringify(filters.metaValue),
        });
      }
    } else if (filters.metaKey) {
      queryBuilder.andWhere(`post.meta ? :metaKey`, {
        metaKey: filters.metaKey,
      });
    }

    // Get posts to invalidate cache
    const postsToDelete = await queryBuilder
      .select(['post.id', 'post.hash'])
      .getMany();

    if (postsToDelete.length === 0) {
      this.logger.warn('No posts found matching filters');
      return { deleted: 0 };
    }

    // Delete posts
    const deleteResult = await this.postRepository.delete(
      postsToDelete.map((p) => p.id),
    );

    // Invalidate cache for all deleted posts
    for (const post of postsToDelete) {
      if (post.hash) {
        await this.invalidateHashCache(post.hash);
      }
    }

    this.logger.log(`✅ Deleted ${deleteResult.affected || 0} posts`);
    return { deleted: deleteResult.affected || 0 };
  }
}
