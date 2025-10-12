import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { Cacheable } from '../../../common/decorators/cacheable.decorator';
import { CacheEvict } from '../../../common/decorators/cache-evict.decorator';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TypeOrmCrudService } from '@dataui/crud-typeorm';
import { AiProvider } from '../entities/ai-provider.entity';
import { CrudRequest } from '@dataui/crud';
import { AddModelDto, UpdateModelDto } from '../dto/model.dto';

const aiProviderCacheKeyGenerator = (id: string) => `ai-provider:${id}`;

const extractIdFromCrudRequest = (req: CrudRequest): string => {
  const id = req.parsed.paramsFilter.find((f) => f.field === 'id')
    ?.value as string;
  if (!id) {
    throw new Error('AI Provider ID is required');
  }
  return id;
};

@Injectable()
export class AiProviderService extends TypeOrmCrudService<AiProvider> {
  constructor(
    @InjectRepository(AiProvider)
    private readonly aiProviderRepository: Repository<AiProvider>,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {
    super(aiProviderRepository);
  }

  @Cacheable({
    keyPrefix: 'ai-provider',
    keyGenerator: aiProviderCacheKeyGenerator,
    ttl: 3600,
  })
  async findAiProviderById(id: string): Promise<AiProvider | null> {
    return this.aiProviderRepository.findOne({ where: { id } });
  }

  @Cacheable({
    keyPrefix: 'ai-provider-by-type',
    keyGenerator: (type: string, userId: string) =>
      `ai-provider-by-type:${type}:${userId}`,
    ttl: 3600,
  })
  async findAiProviderByType(
    type: string,
    userId: string,
  ): Promise<AiProvider | null> {
    // Use raw query to prioritize providers with models
    // Order by JSONB array length to get providers with models first
    const result = await this.aiProviderRepository
      .createQueryBuilder('provider')
      .where('provider.type = :type', { type })
      .andWhere('provider.userId = :userId', { userId })
      .andWhere('provider.isActive = :isActive', { isActive: true })
      .orderBy('jsonb_array_length(provider.models)', 'DESC', 'NULLS LAST')
      .addOrderBy('provider.createdAt', 'ASC')
      .getOne();

    return result;
  }

  @Cacheable({
    keyPrefix: 'ai-provider',
    keyGenerator: (req: CrudRequest) =>
      aiProviderCacheKeyGenerator(extractIdFromCrudRequest(req)),
    ttl: 3600,
  })
  override async getOne(req: CrudRequest): Promise<AiProvider> {
    const result = await super.getOne(req);
    console.log('AI Provider getOne result:', result);
    return result;
  }

  override async getMany(req: CrudRequest) {
    const result = await super.getMany(req);
    console.log('AI Provider getMany result:', result);
    return result;
  }

  override async createOne(
    req: CrudRequest,
    dto: AiProvider,
  ): Promise<AiProvider> {
    const result = await super.createOne(req, dto);
    // For now, we'll just return the result without cache eviction
    // In the future, we could implement a more sophisticated cache invalidation strategy
    return result;
  }

  @CacheEvict({
    keyGenerator: (req: CrudRequest) =>
      aiProviderCacheKeyGenerator(extractIdFromCrudRequest(req)),
  })
  override async updateOne(
    req: CrudRequest,
    dto: Partial<AiProvider>,
  ): Promise<AiProvider> {
    const result = await super.updateOne(req, dto);
    return result;
  }

  @CacheEvict({
    keyGenerator: (req: CrudRequest) =>
      aiProviderCacheKeyGenerator(extractIdFromCrudRequest(req)),
  })
  override async replaceOne(
    req: CrudRequest,
    dto: AiProvider,
  ): Promise<AiProvider> {
    const result = await super.replaceOne(req, dto);
    return result;
  }

  @CacheEvict({
    keyGenerator: (req: CrudRequest) =>
      aiProviderCacheKeyGenerator(extractIdFromCrudRequest(req)),
  })
  override async deleteOne(req: CrudRequest): Promise<void | AiProvider> {
    const result = await super.deleteOne(req);
    return result;
  }

  // Model Management Methods

  /**
   * Add a new model to an AI provider
   */
  @CacheEvict({
    keyGenerator: (providerId: string) =>
      aiProviderCacheKeyGenerator(providerId),
  })
  async addModel(
    providerId: string,
    modelDto: AddModelDto,
  ): Promise<AiProvider> {
    const provider = await this.aiProviderRepository.findOne({
      where: { id: providerId },
    });

    if (!provider) {
      throw new NotFoundException(
        `AI Provider with ID ${providerId} not found`,
      );
    }

    // Check if model with same ID already exists
    const existingModel = provider.models?.find(
      (model) => model.id === modelDto.id,
    );
    if (existingModel) {
      throw new BadRequestException(
        `Model with ID ${modelDto.id} already exists`,
      );
    }

    // Add the new model
    const updatedModels = [...(provider.models || []), modelDto];

    await this.aiProviderRepository.update(providerId, {
      models: updatedModels,
    });

    const updatedProvider = await this.aiProviderRepository.findOne({
      where: { id: providerId },
    });
    if (!updatedProvider) {
      throw new NotFoundException(
        `AI Provider with ID ${providerId} not found after update`,
      );
    }
    return updatedProvider;
  }

  /**
   * Update an existing model in an AI provider
   */
  @CacheEvict({
    keyGenerator: (providerId: string) =>
      aiProviderCacheKeyGenerator(providerId),
  })
  async updateModel(
    providerId: string,
    modelId: string,
    updateDto: UpdateModelDto,
  ): Promise<AiProvider> {
    const provider = await this.aiProviderRepository.findOne({
      where: { id: providerId },
    });

    if (!provider) {
      throw new NotFoundException(
        `AI Provider with ID ${providerId} not found`,
      );
    }

    const modelIndex = provider.models?.findIndex(
      (model) => model.id === modelId,
    );
    if (modelIndex === -1 || modelIndex === undefined) {
      throw new NotFoundException(`Model with ID ${modelId} not found`);
    }

    // Update the model
    const updatedModels = [...(provider.models || [])];
    updatedModels[modelIndex] = {
      ...updatedModels[modelIndex],
      ...updateDto,
    };

    await this.aiProviderRepository.update(providerId, {
      models: updatedModels,
    });

    const updatedProvider = await this.aiProviderRepository.findOne({
      where: { id: providerId },
    });
    if (!updatedProvider) {
      throw new NotFoundException(
        `AI Provider with ID ${providerId} not found after update`,
      );
    }
    return updatedProvider;
  }

  /**
   * Remove a model from an AI provider
   */
  @CacheEvict({
    keyGenerator: (providerId: string) =>
      aiProviderCacheKeyGenerator(providerId),
  })
  async removeModel(providerId: string, modelId: string): Promise<AiProvider> {
    const provider = await this.aiProviderRepository.findOne({
      where: { id: providerId },
    });

    if (!provider) {
      throw new NotFoundException(
        `AI Provider with ID ${providerId} not found`,
      );
    }

    const modelExists = provider.models?.some((model) => model.id === modelId);
    if (!modelExists) {
      throw new NotFoundException(`Model with ID ${modelId} not found`);
    }

    // Remove the model
    const updatedModels =
      provider.models?.filter((model) => model.id !== modelId) || [];

    await this.aiProviderRepository.update(providerId, {
      models: updatedModels,
    });

    const updatedProvider = await this.aiProviderRepository.findOne({
      where: { id: providerId },
    });
    if (!updatedProvider) {
      throw new NotFoundException(
        `AI Provider with ID ${providerId} not found after update`,
      );
    }
    return updatedProvider;
  }

  /**
   * Get all models for an AI provider
   */
  async getModels(providerId: string): Promise<any[]> {
    const provider = await this.aiProviderRepository.findOne({
      where: { id: providerId },
    });

    if (!provider) {
      throw new NotFoundException(
        `AI Provider with ID ${providerId} not found`,
      );
    }

    return provider.models || [];
  }

  /**
   * Get a specific model from an AI provider
   */
  async getModel(providerId: string, modelId: string): Promise<any> {
    const provider = await this.aiProviderRepository.findOne({
      where: { id: providerId },
    });

    if (!provider) {
      throw new NotFoundException(
        `AI Provider with ID ${providerId} not found`,
      );
    }

    const model = provider.models?.find((model) => model.id === modelId);
    if (!model) {
      throw new NotFoundException(`Model with ID ${modelId} not found`);
    }

    return model;
  }
}
