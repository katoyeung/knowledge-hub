import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { SeedRunner } from './run-seed';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import { createKeyv } from '@keyv/redis';

async function runSeed() {
  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
    database: process.env.DB_DATABASE || 'knowledge_hub',
    entities: ['src/**/*.entity.ts'],
    synchronize: true,
    namingStrategy: new SnakeNamingStrategy(),
  });

  // Create cache manager using Keyv
  const redisUrl = `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || '6379'}`;
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
