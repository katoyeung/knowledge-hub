import { Logger } from '@nestjs/common';
import { Cache } from 'cache-manager';

export interface CachePutConfig {
  keyGenerator: (...args: any[]) => string;
  ttl: number | ((...args: any[]) => number);
}

export function CachePut(config: CachePutConfig) {
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

      if (!this.cacheManager) {
        throw new Error(
          `Cache manager not found in ${target.constructor.name}.`,
        );
      }

      const cacheKey = config.keyGenerator(result);
      const ttl =
        typeof config.ttl === 'function' ? config.ttl(result) : config.ttl;

      try {
        await this.cacheManager.set(cacheKey, result, ttl);
        logger.debug(`Cache updated for key: ${cacheKey}`);
      } catch (error) {
        logger.error(`Failed to update cache for key: ${cacheKey}`, error);
      }

      return result;
    };

    return descriptor;
  };
}
