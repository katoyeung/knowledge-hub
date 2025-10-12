import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Prompt } from './entities/prompt.entity';
import { PromptService } from './services/prompt.service';
import { PromptController } from './controllers/prompt.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Prompt])],
  providers: [PromptService],
  controllers: [PromptController],
  exports: [PromptService, TypeOrmModule],
})
export class PromptsModule {}
