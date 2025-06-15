import { CacheModuleOptions } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { createKeyv } from '@keyv/redis';

const logger = new Logger('CacheConfig');

export const getCacheConfig = async (
  configService: ConfigService,
): Promise<CacheModuleOptions> => {
  const redisUrl = `redis://${configService.get<string>('REDIS_HOST', 'localhost')}:${configService.get<string>('REDIS_PORT', '6379')}`;

  const config = {
    stores: [
      createKeyv(redisUrl), // Redis store
    ],
  };

  logger.debug(`Cache configuration: ${JSON.stringify(config)}`);

  return config;
};
