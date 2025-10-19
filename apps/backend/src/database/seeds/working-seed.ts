import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import { config } from 'dotenv';

// Load environment variables
config();

async function runWorkingSeed() {
  // Create a simple data source without the problematic config
  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
    database: process.env.DB_DATABASE || 'knowledge_hub',
    entities: ['src/**/*.entity.ts'],
    synchronize: false,
    namingStrategy: new SnakeNamingStrategy(),
  });

  try {
    await dataSource.initialize();
    console.log('📦 Connected to database');

    // Import and run the seed runner
    const { SeedRunner } = await import('./run-seed.js');
    const Keyv = require('keyv');

    // Create cache manager using Keyv
    const redisUrl = `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || '6379'}`;
    const cache = new Keyv(redisUrl);

    const seedRunner = new SeedRunner(dataSource, cache);
    await seedRunner.run();

    console.log('✨ Seeding completed successfully');
  } catch (error) {
    console.error('❌ Error during seeding:', error);
    process.exit(1);
  } finally {
    await dataSource.destroy();
  }
}

runWorkingSeed().catch(console.error);
