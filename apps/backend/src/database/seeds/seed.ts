import { DataSource } from 'typeorm';
import { SeedRunner } from './run-seed';
import dataSourceConfig from '../../config/typeorm.config';
import { ConfigService } from '@nestjs/config';
import { createKeyv } from '@keyv/redis';

async function runSeed() {
  const dataSource = new DataSource({
    ...dataSourceConfig.options,
    entities: ['src/**/*.entity.ts'],
    synchronize: true,
  });

  const configService = new ConfigService();

  // Create cache manager using Keyv
  const redisUrl = `redis://${configService.get<string>('REDIS_HOST', 'localhost')}:${configService.get<string>('REDIS_PORT', '6379')}`;
  const cache = createKeyv(redisUrl);

  try {
    await dataSource.initialize();
    console.log('📦 Connected to database');

    const seedRunner = new SeedRunner(dataSource, cache);
    await seedRunner.run();

    console.log('✨ Seeding completed successfully');
  } catch (error) {
    console.error('❌ Error during seeding:', error);
    process.exit(1);
  } finally {
    await dataSource.destroy();
    await cache.disconnect();
  }
}

runSeed().catch(console.error);
