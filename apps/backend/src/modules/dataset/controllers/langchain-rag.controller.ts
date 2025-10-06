import { Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { LangChainRAGService } from '../services/langchain-rag.service';
import { IsString, IsUUID, MinLength, MaxLength } from 'class-validator';

export class QueryRAGDto {
  @IsUUID(4, { message: 'Dataset ID must be a valid UUID' })
  datasetId: string;

  @IsString()
  @MinLength(1, { message: 'Query cannot be empty' })
  @MaxLength(1000, { message: 'Query must not exceed 1000 characters' })
  query: string;

  @IsString()
  llmProvider?: string = 'local-direct';

  @IsString()
  llmModel?: string = 'google/gemma-2-9b-it';

  @IsString()
  embeddingModel?: string = 'BAAI/bge-m3';

  numChunks?: number = 5;
}

@Controller('langchain-rag')
@UseGuards(JwtAuthGuard)
export class LangChainRAGController {
  constructor(private readonly langChainRAGService: LangChainRAGService) {}

  @Post('query')
  async queryRAG(@Body() queryDto: QueryRAGDto, @Request() req: any) {
    const userId = req.user?.id || req.user?.sub;

    if (!userId) {
      throw new Error('User not authenticated');
    }

    const config = {
      chunkSize: 1000,
      chunkOverlap: 200,
      numChunks: queryDto.numChunks || 5,
      llmProvider: queryDto.llmProvider || 'local-direct',
      llmModel: queryDto.llmModel || 'google/gemma-2-9b-it',
      embeddingModel: queryDto.embeddingModel || 'BAAI/bge-m3',
    };

    try {
      const result = await this.langChainRAGService.queryWithLangChainRAG(
        queryDto.datasetId,
        queryDto.query,
        config,
      );

      return {
        success: true,
        data: {
          query: queryDto.query,
          answer: result.answer,
          sourceChunks: result.sourceChunks,
          config,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
        data: {
          query: queryDto.query,
          answer: 'Unable to process query',
          sourceChunks: [],
          config,
        },
      };
    }
  }
}
