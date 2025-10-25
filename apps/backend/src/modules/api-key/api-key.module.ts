import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CacheModule } from '@nestjs/cache-manager';
import { ApiKey } from './api-key.entity';
import { ApiKeyService } from './api-key.service';
import { ApiKeyController } from './api-key.controller';
import { ApiKeyStrategy } from './strategies/api-key.strategy';

@Module({
  imports: [TypeOrmModule.forFeature([ApiKey]), CacheModule.register()],
  providers: [ApiKeyService, ApiKeyStrategy],
  controllers: [ApiKeyController],
  exports: [ApiKeyService, ApiKeyStrategy],
})
export class ApiKeyModule {}
