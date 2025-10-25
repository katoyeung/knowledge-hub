import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request as ExpressRequest } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { ApiKeyService } from './api-key.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { ApiKeyResponseDto } from './dto/api-key-response.dto';
import { ApiKeyCreateResponseDto } from './dto/api-key-create-response.dto';
import { JwtOrApiKeyAuthGuard } from './guards/jwt-or-api-key.guard';

@ApiTags('API Keys')
@Controller('api-keys')
@UseGuards(JwtOrApiKeyAuthGuard)
@ApiBearerAuth()
export class ApiKeyController {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new API key' })
  @ApiResponse({
    status: 201,
    description: 'API key created successfully',
    type: ApiKeyCreateResponseDto,
  })
  @ApiResponse({
    status: 409,
    description: 'API key with this name already exists',
  })
  async create(
    @Request() req: ExpressRequest & { user: any },
    @Body() createDto: CreateApiKeyDto,
  ): Promise<ApiKeyCreateResponseDto> {
    return this.apiKeyService.create(req.user.id, createDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all API keys for the current user' })
  @ApiResponse({
    status: 200,
    description: 'API keys retrieved successfully',
    type: [ApiKeyResponseDto],
  })
  async findAll(
    @Request() req: ExpressRequest & { user: any },
  ): Promise<ApiKeyResponseDto[]> {
    return this.apiKeyService.findAllByUser(req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific API key by ID' })
  @ApiResponse({
    status: 200,
    description: 'API key retrieved successfully',
    type: ApiKeyResponseDto,
  })
  @ApiResponse({ status: 404, description: 'API key not found' })
  async findOne(
    @Request() req: ExpressRequest & { user: any },
    @Param('id') id: string,
  ): Promise<ApiKeyResponseDto> {
    return this.apiKeyService.findOne(id, req.user.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an API key' })
  @ApiResponse({ status: 204, description: 'API key deleted successfully' })
  @ApiResponse({ status: 404, description: 'API key not found' })
  async remove(
    @Request() req: ExpressRequest & { user: any },
    @Param('id') id: string,
  ): Promise<void> {
    return this.apiKeyService.remove(id, req.user.id);
  }
}
