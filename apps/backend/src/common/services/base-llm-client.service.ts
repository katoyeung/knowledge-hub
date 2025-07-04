import { Injectable } from '@nestjs/common';
import { BaseApiClient } from './base-api-client.service';
import { HttpService } from '@nestjs/axios';
import { Cache } from 'cache-manager';
import { ConfigService } from '@nestjs/config';
import {
  LLMClient,
  LLMMessage,
  LLMResponse,
} from '../interfaces/llm-client.interface';
import { ApiResponse } from '../interfaces/api-client.interface';
import { createHash } from 'crypto';
import { CACHE_KEYS } from '@common/constants/cache-keys';

@Injectable()
export abstract class BaseLLMClient extends BaseApiClient implements LLMClient {
  protected abstract readonly defaultModel: string;
  protected readonly cacheTTL: number;

  constructor(
    configService: ConfigService,
    httpService: HttpService,
    cacheManager: Cache,
    config: {
      baseUrl: string;
      apiKeyEnv: string;
      timeout?: number;
      cacheTTL?: number;
    },
  ) {
    super(
      {
        baseUrl: config.baseUrl,
        apiKey: configService.get<string>(config.apiKeyEnv),
        timeout: config.timeout || 30000,
        cacheTTL: config.cacheTTL || 0, // Set to 0 for never expire
      },
      httpService,
      cacheManager,
    );
    this.cacheTTL = config.cacheTTL || 0;
  }

  protected getLLMCacheKey(
    messages: LLMMessage[],
    model: string,
    jsonSchema?: Record<string, any>,
  ): string {
    const content = JSON.stringify({
      messages,
      model,
      jsonSchema,
    });
    const hash = createHash('sha256').update(content).digest('hex');
    return `${CACHE_KEYS.LLM.RESPONSE}:${this.constructor.name}:${hash}`;
  }

  protected async getCachedResponse<T>(
    cacheKey: string,
  ): Promise<ApiResponse<T> | null> {
    try {
      const cachedData = await this.cacheManager.get<ApiResponse<T>>(cacheKey);
      if (cachedData) {
        this.logger.debug(
          `Cache hit for ${cacheKey} - TTL: ${this.cacheTTL}ms`,
        );
        return cachedData;
      }
    } catch (error) {
      this.logger.warn(`Cache error: ${error.message}`);
    }
    return null;
  }

  protected async setCachedResponse<T>(
    cacheKey: string,
    response: ApiResponse<T>,
  ): Promise<void> {
    try {
      await this.cacheManager.set(cacheKey, response, this.cacheTTL);
      this.logger.debug(`Cached response for ${cacheKey}`);
    } catch (error) {
      this.logger.warn(`Cache error: ${error.message}`);
    }
  }

  abstract chatCompletion(
    messages: LLMMessage[],
    model?: string,
    jsonSchema?: Record<string, any>,
  ): Promise<ApiResponse<LLMResponse>>;
}
