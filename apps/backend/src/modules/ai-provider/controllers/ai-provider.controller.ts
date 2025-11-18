import {
  Controller,
  UseGuards,
  UseInterceptors,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  BadRequestException,
} from '@nestjs/common';
import { Crud, CrudController } from '@dataui/crud';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AiProvider } from '../entities/ai-provider.entity';
import { AiProviderService } from '../services/ai-provider.service';
import { CreateAiProviderDto } from '../dto/create-ai-provider.dto';
import { UpdateAiProviderDto } from '../dto/update-ai-provider.dto';
import { AddModelDto, UpdateModelDto } from '../dto/model.dto';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CrudAuthFilter } from '@modules/access/decorators/crud-auth-filter.decorator';
import { PopulateUserIdInterceptor } from '@common/interceptors/populate-user-id.interceptor';
import { LLMMessage } from '@common/interfaces/llm-client.interface';
import { LLMClientFactory } from '../services/llm-client-factory.service';
import { NotFoundException } from '@nestjs/common';

@Crud({
  model: {
    type: AiProvider,
  },
  params: {
    id: {
      field: 'id',
      type: 'uuid',
      primary: true,
    },
  },
  query: {
    sort: [
      {
        field: 'createdAt',
        order: 'DESC',
      },
    ],
    join: {
      user: {
        alias: 'user',
        eager: true,
      },
    },
  },
  dto: {
    create: CreateAiProviderDto,
    update: UpdateAiProviderDto,
  },
  routes: {
    exclude: ['createManyBase'],
  },
})
@Controller('ai-providers')
@UseGuards(JwtAuthGuard)
@UseInterceptors(PopulateUserIdInterceptor)
@CrudAuthFilter('userId')
@ApiTags('AI Providers')
export class AiProviderController implements CrudController<AiProvider> {
  constructor(
    public readonly service: AiProviderService,
    private readonly llmClientFactory: LLMClientFactory,
  ) {}

  // Model Management Endpoints

  @Get(':id/models')
  @ApiOperation({ summary: 'Get all models for an AI provider' })
  @ApiResponse({ status: 200, description: 'List of models' })
  async getModels(@Param('id') id: string) {
    return await this.service.getModels(id);
  }

  @Get(':id/models/:modelId')
  @ApiOperation({ summary: 'Get a specific model from an AI provider' })
  @ApiResponse({ status: 200, description: 'Model details' })
  async getModel(@Param('id') id: string, @Param('modelId') modelId: string) {
    // Decode URL-encoded modelId to handle special characters
    const decodedModelId = decodeURIComponent(modelId);
    return await this.service.getModel(id, decodedModelId);
  }

  @Post(':id/models')
  @ApiOperation({ summary: 'Add a new model to an AI provider' })
  @ApiResponse({ status: 201, description: 'Model added successfully' })
  async addModel(@Param('id') id: string, @Body() addModelDto: AddModelDto) {
    return await this.service.addModel(id, addModelDto);
  }

  @Patch(':id/models/:modelId')
  @ApiOperation({ summary: 'Update an existing model in an AI provider' })
  @ApiResponse({ status: 200, description: 'Model updated successfully' })
  async updateModel(
    @Param('id') id: string,
    @Param('modelId') modelId: string,
    @Body() updateModelDto: UpdateModelDto,
  ) {
    // Decode URL-encoded modelId to handle special characters
    const decodedModelId = decodeURIComponent(modelId);
    return await this.service.updateModel(id, decodedModelId, updateModelDto);
  }

  @Delete(':id/models/:modelId')
  @ApiOperation({ summary: 'Remove a model from an AI provider' })
  @ApiResponse({ status: 200, description: 'Model removed successfully' })
  async removeModel(
    @Param('id') id: string,
    @Param('modelId') modelId: string,
  ) {
    // Decode URL-encoded modelId to handle special characters
    const decodedModelId = decodeURIComponent(modelId);
    return await this.service.removeModel(id, decodedModelId);
  }

  @Post(':id/chat-completion')
  @ApiOperation({ summary: 'Call chat completion API for an AI provider' })
  @ApiResponse({ status: 200, description: 'Chat completion successful' })
  async chatCompletion(
    @Param('id') id: string,
    @Body()
    body: {
      messages: LLMMessage[];
      model: string;
      jsonSchema?: Record<string, any>;
      temperature?: number;
    },
  ) {
    if (
      !body.messages ||
      !Array.isArray(body.messages) ||
      body.messages.length === 0
    ) {
      throw new BadRequestException(
        'Messages array is required and must not be empty',
      );
    }
    if (!body.model) {
      throw new BadRequestException('Model is required');
    }

    // Get and validate AI provider
    const aiProvider = await this.service.findAiProviderById(id);
    if (!aiProvider) {
      throw new NotFoundException(`AI Provider with ID ${id} not found`);
    }

    if (!aiProvider.isActive) {
      throw new BadRequestException(
        `AI Provider ${aiProvider.name} is not active`,
      );
    }

    // Validate model exists
    const modelExists = aiProvider.models?.some((m) => m.id === body.model);
    if (!modelExists) {
      throw new BadRequestException(
        `Model ${body.model} not found in provider ${aiProvider.name}`,
      );
    }

    // Create LLM client and call chat completion
    const llmClient = this.llmClientFactory.createClient(aiProvider);
    const response = await llmClient.chatCompletion(
      body.messages,
      body.model,
      body.jsonSchema,
      body.temperature || 0.7,
    );

    return {
      success: true,
      data: response.data,
      status: response.status,
    };
  }
}
