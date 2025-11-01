import {
  Controller,
  UseGuards,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
  Post as PostDecorator,
  Body,
  Get,
  Put,
  Delete,
  Param,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { Crud, CrudController, ParsedRequest, CrudRequest } from '@dataui/crud';
import { validate } from 'class-validator';
import { plainToInstance, classToPlain } from 'class-transformer';
import { JwtOrApiKeyAuthGuard } from '@modules/api-key/guards/jwt-or-api-key.guard';
import { PopulateUserIdInterceptor } from '@common/interceptors/populate-user-id.interceptor';
import { ApiTags, ApiOperation, ApiQuery, ApiParam } from '@nestjs/swagger';
import { PostsService, PostSearchFilters } from './posts.service';
import { Post } from './entities/post.entity';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { BulkCreatePostsDto } from './dto/bulk-create-posts.dto';
import { DeduplicationStrategy } from './enums/deduplication-strategy.enum';
import { UpsertConfigDto } from './dto/upsert-config.dto';
import { Logger } from '@nestjs/common';

@Crud({
  model: {
    type: Post,
  },
  params: {
    id: {
      field: 'id',
      type: 'string',
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
        eager: false,
      },
      dataset: {
        alias: 'dataset',
        eager: false,
      },
    },
  },
  dto: {
    create: CreatePostDto,
    update: UpdatePostDto,
  },
})
@Controller('posts')
@ApiTags('Posts')
@UseGuards(JwtOrApiKeyAuthGuard)
@UseInterceptors(PopulateUserIdInterceptor)
@UsePipes(
  new ValidationPipe({
    transform: true,
    validatorPackage: { validate },
    transformerPackage: { plainToInstance, classToPlain },
  }),
)
export class PostsController implements CrudController<Post> {
  private readonly logger = new Logger(PostsController.name);

  constructor(public readonly service: PostsService) {}

  @PostDecorator('upsert')
  @ApiOperation({
    summary:
      'Upsert a post (create if not exists, update if exists). Supports multiple deduplication strategies including custom field mappings.',
    description:
      'For custom strategy, include deduplicationFields in body: ["title", "content", "meta.site", "meta.channel"]',
  })
  @ApiQuery({
    name: 'strategy',
    required: false,
    enum: DeduplicationStrategy,
    description: 'Deduplication strategy to use',
  })
  async upsert(
    @Body()
    body: (CreatePostDto | UpdatePostDto) & {
      deduplicationFields?: string[];
    },
    @Query('strategy') strategy?: DeduplicationStrategy,
  ) {
    try {
      const { deduplicationFields, ...postData } = body;
      const dedupStrategy = strategy || DeduplicationStrategy.HASH;

      // If using custom strategy and fields are provided in body, use them
      const fieldMappings =
        dedupStrategy === DeduplicationStrategy.CUSTOM &&
        deduplicationFields &&
        deduplicationFields.length > 0
          ? deduplicationFields
          : undefined;

      const post = await this.service.upsert(
        postData,
        dedupStrategy,
        fieldMappings,
      );
      return {
        success: true,
        data: post,
        message: 'Post upserted successfully',
      };
    } catch (error) {
      throw new BadRequestException(`Failed to upsert post: ${error.message}`);
    }
  }

  @PostDecorator('upsert-with-config')
  @ApiOperation({
    summary: 'Flexible upsert with field mapping and hash calculation',
    description:
      'Accept raw source data and transform it using config. Automatically calculates hash and maps fields to Post structure.',
  })
  async upsertWithConfig(
    @Body()
    body: {
      sourceData: Record<string, any>;
      config: UpsertConfigDto;
      strategy?: DeduplicationStrategy;
    },
  ) {
    try {
      const { sourceData, config, strategy } = body;
      const post = await this.service.upsertWithConfig(
        sourceData,
        config,
        strategy || DeduplicationStrategy.HASH,
      );
      return {
        success: true,
        data: post,
        message: 'Post upserted successfully with field mapping',
      };
    } catch (error) {
      throw new BadRequestException(
        `Failed to upsert post with config: ${error.message}`,
      );
    }
  }

  @PostDecorator('bulk-upsert')
  @ApiOperation({
    summary: 'Bulk upsert posts with flexible deduplication strategy',
    description:
      'Supports predefined strategies or custom field mappings. For custom strategy, provide deduplicationFields in body: ["title", "content", "meta.site"]',
  })
  @ApiQuery({
    name: 'strategy',
    required: false,
    enum: DeduplicationStrategy,
    description: 'Deduplication strategy to use',
  })
  async bulkUpsert(
    @Body()
    body: BulkCreatePostsDto & {
      deduplicationFields?: string[];
    },
    @Query('strategy') strategy?: DeduplicationStrategy,
  ) {
    try {
      const { deduplicationFields, ...bulkData } = body;
      const dedupStrategy = strategy || DeduplicationStrategy.HASH;

      // If using custom strategy and fields are provided in body, use them
      const fieldMappings =
        dedupStrategy === DeduplicationStrategy.CUSTOM &&
        deduplicationFields &&
        deduplicationFields.length > 0
          ? deduplicationFields
          : undefined;

      const result = await this.service.bulkUpsert(
        bulkData,
        dedupStrategy,
        fieldMappings,
      );
      return {
        success: true,
        data: result,
        message: `Bulk upsert completed: ${result.created} created, ${result.updated} updated`,
      };
    } catch (error) {
      throw new BadRequestException(
        `Failed to bulk upsert posts: ${error.message}`,
      );
    }
  }

  @PostDecorator('bulk-upsert-with-config')
  @ApiOperation({
    summary: 'Bulk upsert posts with field mapping and hash calculation',
    description:
      'Accept array of raw source data and transform each using the same config. Automatically calculates hash and maps fields.',
  })
  async bulkUpsertWithConfig(
    @Body()
    body: {
      sourceDataArray: Record<string, any>[];
      config: UpsertConfigDto;
      strategy?: DeduplicationStrategy;
    },
  ) {
    try {
      const { sourceDataArray, config, strategy } = body;
      const result = await this.service.bulkUpsertWithConfig(
        sourceDataArray,
        config,
        strategy || DeduplicationStrategy.HASH,
      );
      return {
        success: true,
        data: result,
        message: `Bulk upsert with config completed: ${result.created} created, ${result.updated} updated`,
      };
    } catch (error) {
      throw new BadRequestException(
        `Failed to bulk upsert posts with config: ${error.message}`,
      );
    }
  }

  @Get('search')
  @ApiOperation({ summary: 'Advanced search for posts with filters' })
  @ApiQuery({ name: 'hash', required: false, description: 'Filter by hash' })
  @ApiQuery({
    name: 'provider',
    required: false,
    description: 'Filter by provider (e.g., "google api", "lenx api")',
  })
  @ApiQuery({
    name: 'source',
    required: false,
    description: 'Filter by source/platform (e.g., "facebook", "twitter")',
  })
  @ApiQuery({ name: 'title', required: false, description: 'Search in title' })
  @ApiQuery({
    name: 'userId',
    required: false,
    description: 'Filter by user ID',
  })
  @ApiQuery({
    name: 'datasetId',
    required: false,
    description: 'Filter by dataset ID',
  })
  @ApiQuery({
    name: 'metaKey',
    required: false,
    description: 'Filter by meta key',
  })
  @ApiQuery({
    name: 'metaValue',
    required: false,
    description: 'Filter by meta value',
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    description: 'Start date for date range',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    description: 'End date for date range',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page',
  })
  async search(
    @Query('hash') hash?: string,
    @Query('provider') provider?: string,
    @Query('source') source?: string,
    @Query('title') title?: string,
    @Query('userId') userId?: string,
    @Query('datasetId') datasetId?: string,
    @Query('metaKey') metaKey?: string,
    @Query('metaValue') metaValue?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    try {
      const filters: PostSearchFilters = {
        hash,
        provider,
        source,
        title,
        userId,
        datasetId,
        metaKey,
        metaValue: metaValue ? JSON.parse(metaValue) : undefined,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
      };

      const result = await this.service.search(filters);
      return {
        success: true,
        ...result,
      };
    } catch (error) {
      throw new BadRequestException(`Search failed: ${error.message}`);
    }
  }

  @Get('by-hash/:hash')
  @ApiOperation({ summary: 'Get post by hash' })
  @ApiParam({ name: 'hash', description: 'Post hash' })
  async getByHash(@Param('hash') hash: string) {
    try {
      const post = await this.service.findByHash(hash);
      if (!post) {
        return {
          success: false,
          data: null,
          message: 'Post not found',
        };
      }
      return {
        success: true,
        data: post,
      };
    } catch (error) {
      throw new BadRequestException(`Failed to get post: ${error.message}`);
    }
  }

  @Get('by-meta')
  @ApiOperation({ summary: 'Get posts by meta field' })
  @ApiQuery({ name: 'key', required: true, description: 'Meta key' })
  @ApiQuery({
    name: 'value',
    required: false,
    description: 'Meta value (JSON string)',
  })
  async getByMeta(@Query('key') key: string, @Query('value') value?: string) {
    try {
      const metaValue = value ? JSON.parse(value) : undefined;
      const posts = await this.service.findByMetaField(key, metaValue);
      return {
        success: true,
        data: posts,
        total: posts.length,
      };
    } catch (error) {
      throw new BadRequestException(
        `Failed to get posts by meta: ${error.message}`,
      );
    }
  }
}
