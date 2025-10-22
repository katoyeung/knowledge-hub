import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { config } from 'dotenv';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';

// Load environment variables
config();

const configService = new ConfigService();

const AppDataSource = new DataSource({
  type: 'postgres',
  host: configService.get<string>('DB_HOST', 'localhost'),
  port: parseInt(configService.get<string>('DB_PORT', '5432'), 10),
  username: configService.get<string>('DB_USERNAME', 'postgres'),
  password: configService.get<string>('DB_PASSWORD', 'postgres'),
  database: configService.get<string>('DB_DATABASE', 'knowledge_hub'),

  // For development: use TypeScript files directly
  entities: [
    process.env.NODE_ENV === 'production'
      ? 'dist/**/*.entity.js'
      : 'src/**/*.entity.ts',
  ],

  migrations: [
    process.env.NODE_ENV === 'production'
      ? 'dist/database/migrations/*.js'
      : 'src/database/migrations/*.ts',
  ],

  migrationsTableName: 'migrations',
  namingStrategy: new SnakeNamingStrategy(),

  // Enable logging for development
  logging:
    process.env.NODE_ENV !== 'production' ? ['query', 'error'] : ['error'],

  // Synchronize in development (be careful in production)
  synchronize: false, // Keep false to use migrations
});

export default AppDataSource;
