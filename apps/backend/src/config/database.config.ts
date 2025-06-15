import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';

export const getDatabaseConfig = (
  configService: ConfigService,
): TypeOrmModuleOptions => ({
  type: 'postgres',
  host: configService.get<string>('DB_HOST'),
  port: parseInt(configService.get<string>('DB_PORT', '5432'), 10),
  username: configService.get<string>('DB_USERNAME'),
  password: configService.get<string>('DB_PASSWORD'),
  database: configService.get<string>('DB_DATABASE'),
  autoLoadEntities: true,
  synchronize: configService.get<string>('NODE_ENV') !== 'production',
  migrations: ['dist/migrations/*.js'],
  migrationsRun: configService.get<string>('NODE_ENV') === 'production',
  migrationsTableName: 'migrations',
  namingStrategy: new SnakeNamingStrategy(),
});
