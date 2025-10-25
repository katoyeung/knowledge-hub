import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule } from '@nestjs/config';
import { AiProvider } from './entities/ai-provider.entity';
import { AiProviderService } from './services/ai-provider.service';
import { AiProviderController } from './controllers/ai-provider.controller';
import { AiProviderConfigResolver } from './services/ai-provider-config-resolver.service';
import { LLMClientFactory } from './services/llm-client-factory.service';
import { UserModule } from '../user/user.module';
import { DatasetModule } from '../dataset/dataset.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AiProvider]),
    HttpModule,
    CacheModule.register(),
    ConfigModule,
    UserModule,
    forwardRef(() => DatasetModule),
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
