import {
  Controller,
  UseGuards,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
  Post as PostDecorator,
  Body,
  Get,
  Param,
  Query,
  BadRequestException,
  Request,
} from '@nestjs/common';
import { Crud, CrudController } from '@dataui/crud';
import { validate } from 'class-validator';
import { plainToInstance, classToPlain } from 'class-transformer';
import { JwtOrApiKeyAuthGuard } from '@modules/api-key/guards/jwt-or-api-key.guard';
import { PopulateUserIdInterceptor } from '@common/interceptors/populate-user-id.interceptor';
import {
  ApiTags,
  ApiOperation,
  ApiQuery,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { PostsService, PostSearchFilters } from './posts.service';
import { Post } from './entities/post.entity';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { BulkCreatePostsDto } from './dto/bulk-create-posts.dto';
import { DeduplicationStrategy } from './enums/deduplication-strategy.enum';
import { PostStatus } from './enums/post-status.enum';
import { UpsertConfigDto } from './dto/upsert-config.dto';
import {
  TriggerPostApprovalDto,
  BatchTriggerPostApprovalDto,
} from './dto/trigger-post-approval.dto';
import { Logger } from '@nestjs/common';
import { PostApprovalJob } from '@modules/queue/jobs/posts/post-approval.job';
import { UserService } from '@modules/user/user.service';

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
    skipMissingProperties: true, // Skip validation for missing/undefined properties
    validatorPackage: { validate },
    transformerPackage: { plainToInstance, classToPlain },
  }),
)
export class PostsController implements CrudController<Post> {
  private readonly logger = new Logger(PostsController.name);

  constructor(
    public readonly service: PostsService,
    private readonly postApprovalJob: PostApprovalJob,
    private readonly userService: UserService,
  ) {}

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
      return result;
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
      return result;
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
    name: 'postedAtStart',
    required: false,
    description: 'Start date for posted_at range filter',
  })
  @ApiQuery({
    name: 'postedAtEnd',
    required: false,
    description: 'End date for posted_at range filter',
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
    @Query('metaKey') metaKey?: string,
    @Query('metaValue') metaValue?: string,
    @Query('status') status?: PostStatus,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('postedAtStart') postedAtStart?: string,
    @Query('postedAtEnd') postedAtEnd?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    try {
      // Parse metaValue safely - handle both JSON strings and plain values
      let parsedMetaValue: any = undefined;
      if (metaValue) {
        try {
          // First, try parsing as JSON (handles quoted strings, booleans, numbers, objects, arrays)
          parsedMetaValue = JSON.parse(metaValue);
        } catch {
          // If JSON parsing fails, treat as plain string value
          // Also handle common boolean/number string representations
          const trimmed = metaValue.trim();
          if (trimmed === 'true') {
            parsedMetaValue = true;
          } else if (trimmed === 'false') {
            parsedMetaValue = false;
          } else if (trimmed === 'null') {
            parsedMetaValue = null;
          } else if (!isNaN(Number(trimmed)) && trimmed !== '') {
            // Numeric string
            parsedMetaValue = Number(trimmed);
          } else {
            // Plain string value
            parsedMetaValue = metaValue;
          }
        }
      }

      const filters: PostSearchFilters = {
        hash,
        provider,
        source,
        title,
        userId,
        metaKey,
        metaValue: parsedMetaValue,
        status,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        postedAtStart: postedAtStart ? new Date(postedAtStart) : undefined,
        postedAtEnd: postedAtEnd ? new Date(postedAtEnd) : undefined,
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

  @PostDecorator('batch-delete')
  @ApiOperation({ summary: 'Delete multiple posts by IDs' })
  async batchDelete(@Body() body: { postIds: string[] }) {
    try {
      const result = await this.service.batchDelete(body.postIds);
      return {
        success: true,
        ...result,
      };
    } catch (error) {
      throw new BadRequestException(
        `Failed to batch delete posts: ${error.message}`,
      );
    }
  }

  @PostDecorator('delete-all')
  @ApiOperation({ summary: 'Delete all posts matching current filters' })
  @ApiBody({ required: false })
  @ApiQuery({ name: 'hash', required: false, description: 'Filter by hash' })
  @ApiQuery({
    name: 'provider',
    required: false,
    description: 'Filter by provider',
  })
  @ApiQuery({
    name: 'source',
    required: false,
    description: 'Filter by source',
  })
  @ApiQuery({ name: 'title', required: false, description: 'Filter by title' })
  @ApiQuery({
    name: 'userId',
    required: false,
    description: 'Filter by user ID',
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
    name: 'postedAtStart',
    required: false,
    description: 'Start date for posted_at range filter',
  })
  @ApiQuery({
    name: 'postedAtEnd',
    required: false,
    description: 'End date for posted_at range filter',
  })
  async deleteAll(
    @Query('hash') hash?: string,
    @Query('provider') provider?: string,
    @Query('source') source?: string,
    @Query('title') title?: string,
    @Query('userId') userId?: string,
    @Query('metaKey') metaKey?: string,
    @Query('metaValue') metaValue?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('postedAtStart') postedAtStart?: string,
    @Query('postedAtEnd') postedAtEnd?: string,
    @Body() body?: any, // Accept optional body to prevent parsing errors
  ) {
    // Ignore body content - all filtering is done via query parameters
    // Body can be null, undefined, empty object, or the string "null" - all are acceptable
    if (
      body === null ||
      body === 'null' ||
      (typeof body === 'object' && Object.keys(body).length === 0)
    ) {
      body = undefined;
    }
    try {
      // Parse metaValue safely
      let parsedMetaValue: any = undefined;
      if (metaValue) {
        try {
          parsedMetaValue = JSON.parse(metaValue);
        } catch {
          const trimmed = metaValue.trim();
          if (trimmed === 'true') {
            parsedMetaValue = true;
          } else if (trimmed === 'false') {
            parsedMetaValue = false;
          } else if (trimmed === 'null') {
            parsedMetaValue = null;
          } else if (!isNaN(Number(trimmed)) && trimmed !== '') {
            parsedMetaValue = Number(trimmed);
          } else {
            parsedMetaValue = metaValue;
          }
        }
      }

      const filters: PostSearchFilters = {
        hash,
        provider,
        source,
        title,
        userId,
        metaKey,
        metaValue: parsedMetaValue,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        postedAtStart: postedAtStart ? new Date(postedAtStart) : undefined,
        postedAtEnd: postedAtEnd ? new Date(postedAtEnd) : undefined,
      };

      const result = await this.service.deleteAllByFilters(filters);
      return {
        success: true,
        ...result,
      };
    } catch (error) {
      throw new BadRequestException(
        `Failed to delete all posts: ${error.message}`,
      );
    }
  }

  @PostDecorator(':id/approve')
  @ApiOperation({
    summary: 'Trigger post approval job for a single post',
    description:
      'Uses user post settings if not provided, or provided settings override user settings',
  })
  @ApiParam({ name: 'id', description: 'Post ID' })
  @ApiBody({ type: TriggerPostApprovalDto, required: false })
  async triggerPostApproval(
    @Param('id') postId: string,
    @Body() dto: TriggerPostApprovalDto,
    @Request() req: any,
  ) {
    try {
      const userId = req.user.id;

      // Get user post settings if not provided
      let settings = dto;
      if (!dto.aiProviderId || !dto.promptId || !dto.model) {
        const userSettings = await this.userService.getUserPostSettings(userId);
        settings = {
          ...userSettings,
          ...dto,
        } as TriggerPostApprovalDto;
      }

      // Validate required fields
      if (!settings.aiProviderId || !settings.promptId || !settings.model) {
        throw new BadRequestException(
          'Missing required fields: aiProviderId, promptId, and model must be provided either in request body or user post settings',
        );
      }

      // Dispatch the job
      this.logger.log(
        `[POSTS_CONTROLLER] Dispatching post approval job for post ${postId}`,
      );
      this.logger.log(
        `[POSTS_CONTROLLER] Job data: ${JSON.stringify({
          postId,
          promptId: settings.promptId,
          aiProviderId: settings.aiProviderId,
          model: settings.model,
          temperature: settings.temperature,
          userId,
        })}`,
      );

      const jobDispatcher = PostApprovalJob.dispatch({
        postId,
        promptId: settings.promptId,
        aiProviderId: settings.aiProviderId,
        model: settings.model,
        temperature: settings.temperature,
        userId,
      });

      this.logger.log(
        `[POSTS_CONTROLLER] Job dispatcher created, calling dispatch()...`,
      );

      await jobDispatcher.dispatch();

      this.logger.log(
        `[POSTS_CONTROLLER] Post approval job dispatched successfully for post ${postId}`,
      );

      return {
        success: true,
        message: 'Post approval job queued successfully',
        postId,
      };
    } catch (error) {
      throw new BadRequestException(
        `Failed to trigger post approval: ${error.message}`,
      );
    }
  }

  @PostDecorator('batch-approve')
  @ApiOperation({
    summary: 'Trigger post approval jobs for multiple posts',
    description:
      'Uses user post settings if not provided, or provided settings override user settings',
  })
  @ApiBody({ type: BatchTriggerPostApprovalDto })
  async batchTriggerPostApproval(
    @Body() dto: BatchTriggerPostApprovalDto,
    @Request() req: any,
  ) {
    try {
      const userId = req.user.id;
      const { postIds, ...approvalSettings } = dto;

      if (!postIds || postIds.length === 0) {
        throw new BadRequestException('At least one post ID is required');
      }

      // Get user post settings if not provided
      let settings = { ...approvalSettings };
      const needsUserSettings =
        !settings.aiProviderId || !settings.promptId || !settings.model;

      if (needsUserSettings) {
        const userSettings = await this.userService.getUserPostSettings(userId);
        // Merge user settings with provided settings (provided settings take precedence)
        settings = {
          ...userSettings,
          ...approvalSettings,
        } as TriggerPostApprovalDto;
      }

      // Validate required fields
      if (!settings.aiProviderId || !settings.promptId || !settings.model) {
        const missingFields = [];
        if (!settings.aiProviderId) missingFields.push('aiProviderId');
        if (!settings.promptId) missingFields.push('promptId');
        if (!settings.model) missingFields.push('model');

        throw new BadRequestException(
          `Missing required fields: ${missingFields.join(', ')}. These must be provided either in the request body or configured in user post settings.`,
        );
      }

      // Dispatch jobs for all posts
      this.logger.log(
        `[POSTS_CONTROLLER] Dispatching batch post approval jobs for ${postIds.length} posts`,
      );
      this.logger.log(
        `[POSTS_CONTROLLER] Settings: ${JSON.stringify({
          promptId: settings.promptId,
          aiProviderId: settings.aiProviderId,
          model: settings.model,
          temperature: settings.temperature,
          userId,
        })}`,
      );

      const jobPromises = postIds.map(async (postId) => {
        this.logger.log(
          `[POSTS_CONTROLLER] Creating job dispatcher for post ${postId}`,
        );
        const jobDispatcher = PostApprovalJob.dispatch({
          postId,
          promptId: settings.promptId!,
          aiProviderId: settings.aiProviderId!,
          model: settings.model!,
          temperature: settings.temperature,
          userId,
        });
        this.logger.log(
          `[POSTS_CONTROLLER] Job dispatcher created for post ${postId}, calling dispatch()...`,
        );
        await jobDispatcher.dispatch();
        this.logger.log(
          `[POSTS_CONTROLLER] Job dispatched successfully for post ${postId}`,
        );
      });

      await Promise.all(jobPromises);

      this.logger.log(
        `[POSTS_CONTROLLER] All ${postIds.length} batch post approval jobs dispatched successfully`,
      );

      return {
        success: true,
        message: `${postIds.length} post approval jobs queued successfully`,
        postIds,
        jobCount: postIds.length,
      };
    } catch (error) {
      throw new BadRequestException(
        `Failed to trigger batch post approval: ${error.message}`,
      );
    }
  }

  @PostDecorator('approve-all')
  @ApiOperation({
    summary: 'Trigger post approval jobs for all posts matching filters',
    description:
      'Uses user post settings if not provided, or provided settings override user settings',
  })
  @ApiBody({ type: TriggerPostApprovalDto, required: false })
  async approveAllPosts(
    @Body() dto: TriggerPostApprovalDto,
    @Query() query: any,
    @Request() req: any,
  ) {
    try {
      const userId = req.user.id;

      // Get user post settings if not provided
      let settings = dto;
      if (!dto.aiProviderId || !dto.promptId || !dto.model) {
        const userSettings = await this.userService.getUserPostSettings(userId);
        settings = {
          ...userSettings,
          ...dto,
        } as TriggerPostApprovalDto;
      }

      // Validate required fields
      if (!settings.aiProviderId || !settings.promptId || !settings.model) {
        throw new BadRequestException(
          'Missing required fields: aiProviderId, promptId, and model must be provided either in request body or user post settings',
        );
      }

      // Get all posts matching filters (similar to search endpoint)
      // Build filters from query params
      const filters: PostSearchFilters = {
        hash: query['filter[hash]'] as string | undefined,
        provider: query['filter[provider]'] as string | undefined,
        source: query['filter[source]'] as string | undefined,
        title: query['filter[title]'] as string | undefined,
        metaKey: query['filter[metaKey]'] as string | undefined,
        metaValue: query['filter[metaValue]'] as string | undefined,
        postedAtStart: query['filter[postedAtStart]']
          ? new Date(query['filter[postedAtStart]'] as string)
          : undefined,
        postedAtEnd: query['filter[postedAtEnd]']
          ? new Date(query['filter[postedAtEnd]'] as string)
          : undefined,
        limit: 10000, // Large limit for "all"
      };

      const searchResult = await this.service.search(filters);

      if (!searchResult.data || searchResult.data.length === 0) {
        return {
          success: true,
          message: 'No posts found to approve',
          jobCount: 0,
        };
      }

      // Dispatch jobs for all posts
      this.logger.log(
        `[POSTS_CONTROLLER] Dispatching approve-all jobs for ${searchResult.data.length} posts`,
      );
      this.logger.log(
        `[POSTS_CONTROLLER] Settings: ${JSON.stringify({
          promptId: settings.promptId,
          aiProviderId: settings.aiProviderId,
          model: settings.model,
          temperature: settings.temperature,
          userId,
        })}`,
      );

      const jobPromises = searchResult.data.map(async (post: Post) => {
        this.logger.log(
          `[POSTS_CONTROLLER] Creating job dispatcher for post ${post.id}`,
        );
        const jobDispatcher = PostApprovalJob.dispatch({
          postId: post.id,
          promptId: settings.promptId!,
          aiProviderId: settings.aiProviderId!,
          model: settings.model!,
          temperature: settings.temperature,
          userId,
        });
        this.logger.log(
          `[POSTS_CONTROLLER] Job dispatcher created for post ${post.id}, calling dispatch()...`,
        );
        await jobDispatcher.dispatch();
        this.logger.log(
          `[POSTS_CONTROLLER] Job dispatched successfully for post ${post.id}`,
        );
      });

      await Promise.all(jobPromises);

      this.logger.log(
        `[POSTS_CONTROLLER] All ${searchResult.data.length} approve-all jobs dispatched successfully`,
      );

      return {
        success: true,
        message: `${searchResult.data.length} post approval jobs queued successfully`,
        jobCount: searchResult.data.length,
      };
    } catch (error) {
      throw new BadRequestException(
        `Failed to trigger approve all: ${error.message}`,
      );
    }
  }
}
