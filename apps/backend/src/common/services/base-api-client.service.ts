import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { Cache } from 'cache-manager';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject } from '@nestjs/common';
import {
  ApiClient,
  ApiClientConfig,
  ApiResponse,
} from '../interfaces/api-client.interface';
import { firstValueFrom } from 'rxjs';
import { CacheControl } from '../interfaces/cache-control.interface';
import { CACHE_KEYS } from '@common/constants/cache-keys';

@Injectable()
export abstract class BaseApiClient implements ApiClient {
  protected readonly logger: Logger;
  protected readonly cacheTTL: number;

  constructor(
    protected readonly config: ApiClientConfig,
    protected readonly httpService: HttpService,
    @Inject(CACHE_MANAGER) protected readonly cacheManager: Cache,
  ) {
    this.logger = new Logger(this.constructor.name);
    this.cacheTTL = config.cacheTTL || 30 * 24 * 60 * 60 * 1000; // Default 30 days in milliseconds
  }

  protected getCacheKey(
    endpoint: string,
    params?: Record<string, any>,
  ): string {
    return `${CACHE_KEYS.API.RESPONSE}:${this.constructor.name}:${endpoint}:${JSON.stringify(params || {})}`;
  }

  protected async getCachedData<T>(
    cacheKey: string,
    cacheControl?: CacheControl,
  ): Promise<ApiResponse<T> | null> {
    if (cacheControl?.enabled === false) {
      return null;
    }

    if (cacheControl?.forceRefresh) {
      await this.cacheManager.del(cacheKey);
      return null;
    }

    const cachedData = await this.cacheManager.get<ApiResponse<T>>(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    return null;
  }

  async get<T>(
    endpoint: string,
    params?: Record<string, any>,
    cacheControl?: CacheControl,
  ): Promise<ApiResponse<T>> {
    const cacheKey = this.getCacheKey(endpoint, params);
    const fullUrl = `${this.config.baseUrl}${endpoint}`;

    // Try to get from cache with cache control
    const cachedData = await this.getCachedData<T>(cacheKey, cacheControl);
    if (cachedData) {
      this.logger.debug(`Cache hit for ${cacheKey}`);
      return cachedData;
    }

    try {
      const response = await firstValueFrom(
        this.httpService.get<T>(fullUrl, {
          params: {
            ...params,
            api_token: this.config.apiKey,
          },
          timeout: this.config.timeout,
        }),
      );

      const apiResponse: ApiResponse<T> = {
        data: response.data,
        status: response.status,
        headers: response.headers as Record<string, string>,
      };

      // Cache the response with custom TTL if provided
      if (cacheControl?.enabled !== false) {
        const ttl = cacheControl?.ttl ?? this.cacheTTL;
        this.logger.debug(`Caching response for ${cacheKey} with TTL ${ttl}`);
        await this.cacheManager.set(cacheKey, apiResponse, ttl);
      }

      return apiResponse;
    } catch (error) {
      this.logger.error(`API request failed for ${fullUrl}: ${error.message}`, {
        endpoint,
        params,
        timeout: this.config.timeout,
        error: error.stack,
      });
      throw error;
    }
  }

  async post<T>(endpoint: string, data?: any): Promise<ApiResponse<T>> {
    const fullUrl = `${this.config.baseUrl}${endpoint}`;
    try {
      const response = await firstValueFrom(
        this.httpService.post<T>(fullUrl, data, {
          params: {
            api_token: this.config.apiKey,
          },
          timeout: this.config.timeout,
        }),
      );

      return {
        data: response.data,
        status: response.status,
        headers: response.headers as Record<string, string>,
      };
    } catch (error) {
      this.logger.error(`API request failed for ${fullUrl}: ${error.message}`, {
        endpoint,
        data,
        timeout: this.config.timeout,
        error: error.stack,
      });
      throw error;
    }
  }
}
