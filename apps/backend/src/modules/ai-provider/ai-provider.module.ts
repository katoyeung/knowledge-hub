import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule } from '@nestjs/config';
import { AiProvider } from './entities/ai-provider.entity';
import { AiProviderService } from './services/ai-provider.service';
import { AiProviderController } from './controllers/ai-provider.controller';
import { AiProviderConfigResolver } from './services/ai-provider-config-resolver.service';
import { LLMClientFactory } from './services/llm-client-factory.service';
import { DatasetModule } from '../dataset/dataset.module';
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AiProvider]),
    HttpModule,
    CacheModule.register(),
    ConfigModule,
    DatasetModule,
    UserModule,
  ],
  providers: [AiProviderService, AiProviderConfigResolver, LLMClientFactory],
  controllers: [AiProviderController],
  exports: [
    AiProviderService,
    AiProviderConfigResolver,
    LLMClientFactory,
    TypeOrmModule,
  ],
})
export class AiProviderModule {}
