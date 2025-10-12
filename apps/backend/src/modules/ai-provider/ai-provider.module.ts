import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiProvider } from './entities/ai-provider.entity';
import { AiProviderService } from './services/ai-provider.service';
import { AiProviderController } from './controllers/ai-provider.controller';

@Module({
  imports: [TypeOrmModule.forFeature([AiProvider])],
  providers: [AiProviderService],
  controllers: [AiProviderController],
  exports: [AiProviderService, TypeOrmModule],
})
export class AiProviderModule {}
