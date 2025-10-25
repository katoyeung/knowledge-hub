import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiKey } from './api-key.entity';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { ApiKeyResponseDto } from './dto/api-key-response.dto';
import { ApiKeyCreateResponseDto } from './dto/api-key-create-response.dto';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

@Injectable()
export class ApiKeyService {
  constructor(
    @InjectRepository(ApiKey)
    private readonly apiKeyRepository: Repository<ApiKey>,
  ) {}

  async create(
    userId: string,
    createDto: CreateApiKeyDto,
  ): Promise<ApiKeyCreateResponseDto> {
    // Generate a secure API key
    const keyPrefix = 'sk-';
    const randomBytes = crypto.randomBytes(32);
    const keySuffix = randomBytes.toString('hex');
    const fullKey = `${keyPrefix}${keySuffix}`;

    // Hash the full key for storage
    const keyHash = await bcrypt.hash(fullKey, 12);

    // Create prefix for display (first 12 characters)
    const prefix = fullKey.substring(0, 12) + '...';

    // Check if a key with this name already exists for this user
    const existingKey = await this.apiKeyRepository.findOne({
      where: { userId, name: createDto.name },
    });

    if (existingKey) {
      throw new ConflictException('An API key with this name already exists');
    }

    // Create the API key entity
    const apiKey = this.apiKeyRepository.create({
      name: createDto.name,
      keyHash,
      prefix,
      userId,
    });

    const savedApiKey = await this.apiKeyRepository.save(apiKey);

    return {
      id: savedApiKey.id,
      name: savedApiKey.name,
      key: fullKey, // Return the full key only once
      prefix: savedApiKey.prefix,
      createdAt: savedApiKey.createdAt,
    };
  }

  async findAllByUser(userId: string): Promise<ApiKeyResponseDto[]> {
    const apiKeys = await this.apiKeyRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });

    return apiKeys.map((key) => ({
      id: key.id,
      name: key.name,
      prefix: key.prefix,
      createdAt: key.createdAt,
      lastUsedAt: key.lastUsedAt,
      keyHash: key.keyHash,
      userId: key.userId,
    }));
  }

  async findOne(id: string, userId: string): Promise<ApiKeyResponseDto> {
    const apiKey = await this.apiKeyRepository.findOne({
      where: { id, userId },
    });

    if (!apiKey) {
      throw new NotFoundException('API key not found');
    }

    return {
      id: apiKey.id,
      name: apiKey.name,
      prefix: apiKey.prefix,
      createdAt: apiKey.createdAt,
      lastUsedAt: apiKey.lastUsedAt,
      keyHash: apiKey.keyHash,
      userId: apiKey.userId,
    };
  }

  async remove(id: string, userId: string): Promise<void> {
    const result = await this.apiKeyRepository.delete({ id, userId });

    if (result.affected === 0) {
      throw new NotFoundException('API key not found');
    }
  }

  async validateApiKey(apiKey: string): Promise<ApiKey | null> {
    if (!apiKey.startsWith('sk-')) {
      return null;
    }

    // Extract prefix from the full key
    const prefix = apiKey.substring(0, 12) + '...';

    // Find API key by prefix first (much more efficient)
    const key = await this.apiKeyRepository.findOne({
      where: { prefix },
      relations: ['user', 'user.roles', 'user.roles.permissions'],
    });

    if (!key) {
      return null;
    }

    // Verify the key by comparing with stored hash
    const isValid = await bcrypt.compare(apiKey, key.keyHash);

    if (!isValid) {
      return null;
    }

    // Update last used timestamp
    await this.apiKeyRepository.update(key.id, {
      lastUsedAt: new Date(),
    });

    return key;
  }
}
