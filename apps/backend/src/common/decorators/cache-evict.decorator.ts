import { Logger } from '@nestjs/common';
import { Cache } from 'cache-manager';

export interface CacheEvictConfig {
  keyGenerator: (...args: any[]) => string;
}

export function CacheEvict(config: CacheEvictConfig) {
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
      const result = await originalMethod.apply(this, args);
      const cacheKey = config.keyGenerator(...args);

      if (!this.cacheManager) {
        throw new Error(
          `Cache manager not found in ${target.constructor.name}.`,
        );
      }

      try {
        await this.cacheManager.del(cacheKey);
        logger.debug(`Cache evicted for key: ${cacheKey}`);
      } catch (error) {
        logger.error(`Failed to evict cache for key: ${cacheKey}`, error);
      }

      return result;
    };

    return descriptor;
  };
}
