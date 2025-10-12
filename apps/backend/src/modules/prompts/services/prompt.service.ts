import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { Cacheable } from '../../../common/decorators/cacheable.decorator';
import { CacheEvict } from '../../../common/decorators/cache-evict.decorator';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { TypeOrmCrudService } from '@dataui/crud-typeorm';
import { Prompt } from '../entities/prompt.entity';
import { CrudRequest } from '@dataui/crud';

const promptCacheKeyGenerator = (id: string) => `prompt:${id}`;

const extractIdFromCrudRequest = (req: CrudRequest): string => {
  const id = req.parsed.paramsFilter.find((f) => f.field === 'id')
    ?.value as string;
  if (!id) {
    throw new Error('Prompt ID is required');
  }
  return id;
};

@Injectable()
export class PromptService extends TypeOrmCrudService<Prompt> {
  constructor(
    @InjectRepository(Prompt)
    private readonly promptRepository: Repository<Prompt>,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {
    super(promptRepository);
  }

  @Cacheable({
    keyPrefix: 'prompt',
    keyGenerator: promptCacheKeyGenerator,
    ttl: 3600,
  })
  async findPromptById(id: string): Promise<Prompt | null> {
    return this.promptRepository.findOne({ where: { id } });
  }

  @Cacheable({
    keyPrefix: 'prompt',
    keyGenerator: (req: CrudRequest) =>
      promptCacheKeyGenerator(extractIdFromCrudRequest(req)),
    ttl: 3600,
  })
  override async getOne(req: CrudRequest): Promise<Prompt> {
    const result = await super.getOne(req);
    return result;
  }

  override async createOne(req: CrudRequest, dto: Prompt): Promise<Prompt> {
    const result = await super.createOne(req, dto);
    // For now, we'll just return the result without cache eviction
    // In the future, we could implement a more sophisticated cache invalidation strategy
    return result;
  }

  @CacheEvict({
    keyGenerator: (req: CrudRequest) =>
      promptCacheKeyGenerator(extractIdFromCrudRequest(req)),
  })
  override async updateOne(
    req: CrudRequest,
    dto: Partial<Prompt>,
  ): Promise<Prompt> {
    const result = await super.updateOne(req, dto);
    return result;
  }

  @CacheEvict({
    keyGenerator: (req: CrudRequest) =>
      promptCacheKeyGenerator(extractIdFromCrudRequest(req)),
  })
  override async replaceOne(req: CrudRequest, dto: Prompt): Promise<Prompt> {
    const result = await super.replaceOne(req, dto);
    return result;
  }

  @CacheEvict({
    keyGenerator: (req: CrudRequest) =>
      promptCacheKeyGenerator(extractIdFromCrudRequest(req)),
  })
  override async deleteOne(req: CrudRequest): Promise<void | Prompt> {
    const result = await super.deleteOne(req);
    return result;
  }

  async searchPrompts(
    searchQuery?: string,
    page: number = 1,
    limit: number = 10,
    sort: string = 'createdAt,DESC',
  ) {
    const queryBuilder = this.promptRepository
      .createQueryBuilder('prompt')
      .leftJoinAndSelect('prompt.user', 'user');

    // Add search filter if provided
    if (searchQuery && searchQuery.trim()) {
      queryBuilder.where(
        '(prompt.name ILIKE :search OR prompt.description ILIKE :search OR prompt.systemPrompt ILIKE :search)',
        { search: `%${searchQuery}%` },
      );
    }

    // Parse sort parameter
    const [sortField, sortOrder] = sort.split(',');
    const validSortFields = ['name', 'createdAt', 'updatedAt', 'type'];
    const field = validSortFields.includes(sortField) ? sortField : 'createdAt';
    const order = sortOrder === 'ASC' ? 'ASC' : 'DESC';

    queryBuilder.orderBy(`prompt.${field}`, order);

    // Add pagination
    const offset = (page - 1) * limit;
    queryBuilder.skip(offset).take(limit);

    // Execute query
    const [data, total] = await queryBuilder.getManyAndCount();

    return {
      data,
      count: data.length,
      total,
      page,
      pageCount: Math.ceil(total / limit),
    };
  }
}
