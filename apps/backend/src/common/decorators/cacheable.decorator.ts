import { Logger } from '@nestjs/common';
import { Cache } from 'cache-manager';

export interface CacheableConfig<T = any> {
  keyPrefix: string;
  keyGenerator: (...args: any[]) => string;
  shouldRefresh?: (data: T) => boolean;
  ttl: number | ((...args: any[]) => number);
  // Keep only cache-related features
  onCacheHit?: (key: string, result: any) => void;
  onCacheMiss?: (key: string) => void;
  tags?: string[];
}

export function Cacheable<T = any>(config: CacheableConfig<T>) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value;
    const logger = new Logger(`${target.constructor.name}.${propertyKey}`);

    descriptor.value = async function (
      this: { cacheManager: Cache },
      ...args: any[]
    ) {
      if (!this.cacheManager) {
        throw new Error(
          `Cache manager not found in ${target.constructor.name}. ` +
            `Please inject CACHE_MANAGER in the constructor:\n` +
            `constructor(@Inject(CACHE_MANAGER) private readonly cacheManager: Cache) {}`,
        );
      }

      const cacheKey = config.keyGenerator(...args);
      const ttl =
        typeof config.ttl === 'function' ? config.ttl(...args) : config.ttl;
      const shouldRefresh = config.shouldRefresh?.(args[1]) || false;

      try {
        // Try to get from cache if not forcing refresh
        if (!shouldRefresh) {
          const cachedResult = await this.cacheManager.get(cacheKey);
          if (cachedResult) {
            logger.debug(`Cache hit for key: ${cacheKey}`);
            config.onCacheHit?.(cacheKey, cachedResult);
            return cachedResult;
          }
          logger.debug(`Cache miss for key: ${cacheKey}`);
          config.onCacheMiss?.(cacheKey);
        }

        // Execute original method
        const result = await originalMethod.apply(this, args);

        // Cache the result
        await this.cacheManager.set(cacheKey, result, ttl);

        // Store cache tags if provided
        if (config.tags?.length) {
          const tagKey = `tags:${cacheKey}`;
          await this.cacheManager.set(tagKey, config.tags, ttl);
        }

        return result;
      } catch (error) {
        logger.error(`Cache error for key: ${cacheKey}`, error);
        throw error;
      }
    };

    return descriptor;
  };
}
