import {
  Controller,
  UseGuards,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
  Post,
  Body,
  Request,
  UploadedFiles,
  Param,
  Get,
  Put,
  Query,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { DatasetService } from './dataset.service';
import {
  Crud,
  CrudController,
  Override,
  ParsedRequest,
  CrudRequest,
} from '@dataui/crud';
import { Dataset } from './entities/dataset.entity';
import { validate } from 'class-validator';
import { plainToInstance, classToPlain } from 'class-transformer';
import { JwtOrApiKeyAuthGuard } from '@modules/api-key/guards/jwt-or-api-key.guard';
import { CreateDatasetDto } from './dto/create-dataset.dto';
import { UpdateDatasetDto } from './dto/update-dataset.dto';
import { UpdateChatSettingsDto } from './dto/update-chat-settings.dto';
import { UpdateGraphSettingsDto } from './dto/update-graph-settings.dto';
import { UploadDocumentDto, SyncPostsDto } from './dto/upload-document.dto';
import {
  getEffectiveChunkSize,
  getEffectiveChunkOverlap,
  getModelDefaults,
  EmbeddingModel,
  RerankerType,
} from './dto/create-dataset-step.dto';
import {
  CreateDatasetStepOneDto,
  CreateDatasetStepTwoDto,
  ProcessDocumentsDto,
  SearchDocumentsDto,
} from './dto/create-dataset-step.dto';
import { Resource } from '@modules/access/enums/permission.enum';
import { CrudPermissions } from '@modules/access/decorators/crud-permissions.decorator';
import { PopulateUserIdInterceptor } from '@common/interceptors/populate-user-id.interceptor';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { DocumentSegmentService } from './document-segment.service';
import {
  HybridSearchService,
  HybridSearchResponse,
} from './services/hybrid-search.service';
import { DocumentService } from './document.service';
import { EmbeddingV2Service } from './services/embedding-v2.service';
import { DocumentProcessingService } from './services/document-processing.service';
import { Logger } from '@nestjs/common';

@Crud({
  model: {
    type: Dataset,
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
      documents: {
        alias: 'documents',
        eager: false,
      },
      segments: {
        alias: 'segments',
        eager: false,
      },
      keywordTable: {
        alias: 'keywordTable',
        eager: false,
      },
    },
  },
  dto: {
    create: CreateDatasetDto,
    update: UpdateDatasetDto,
  },
  routes: {
    exclude: ['createManyBase'],
    ...CrudPermissions(Resource.DATASET),
  },
})
@Controller('datasets')
@ApiTags('Datasets')
//@UseGuards(JwtAuthGuard, PermsGuard)
@UseGuards(JwtOrApiKeyAuthGuard)
@UseInterceptors(PopulateUserIdInterceptor)
@UsePipes(
  new ValidationPipe({
    transform: true,
    validatorPackage: { validate },
    transformerPackage: { plainToInstance, classToPlain },
  }),
)
export class DatasetController implements CrudController<Dataset> {
  private readonly logger = new Logger(DatasetController.name);

  constructor(
    public readonly service: DatasetService,
    private readonly documentService: DocumentService,
    private readonly documentSegmentService: DocumentSegmentService,
    private readonly embeddingService: EmbeddingV2Service,
    private readonly hybridSearchService: HybridSearchService,
    private readonly documentProcessingService: DocumentProcessingService,
  ) {}

  @Override('deleteOneBase')
  async deleteOne(@ParsedRequest() req: CrudRequest) {
    const id = req.parsed.paramsFilter.find((f) => f.field === 'id')?.value;
    if (!id) {
      throw new Error('Dataset ID is required');
    }

    // Delete the dataset first
    await this.service.deleteDataset(id);

    // Stop ALL ongoing processing jobs asynchronously (don't wait)
    this.documentProcessingService
      .stopAllProcessingJobs(
        'Dataset deleted by user - clearing all processing jobs',
      )
      .catch((error) => {
        this.logger.error('Failed to stop processing jobs:', error);
      });

    return { deleted: true };
  }

  @Post('create-step-one')
  async createDatasetStepOne(
    @Body() createDatasetDto: CreateDatasetStepOneDto,
    @Request() req: any,
  ) {
    const userId = req.user?.id || req.user?.sub;

    if (!userId) {
      throw new Error('User not authenticated');
    }

    const dataset = await this.service.createDatasetStepOne(
      createDatasetDto,
      userId,
    );

    return {
      success: true,
      message: 'Dataset created successfully',
      data: dataset,
    };
  }

  @Post(':id/upload-documents')
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      storage: diskStorage({
        destination: './uploads/documents',
        filename: (req, file, cb) => {
          const randomName = Array(32)
            .fill(null)
            .map(() => Math.round(Math.random() * 16).toString(16))
            .join('');
          cb(null, `${randomName}${extname(file.originalname)}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        // Allow common document types
        const allowedMimes = [
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'text/plain',
          'text/markdown',
          'application/json',
          'text/csv',
        ];

        if (allowedMimes.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(
            new Error(
              'Invalid file type. Only PDF, Word, Text, Markdown, JSON, and CSV files are allowed.',
            ),
            false,
          );
        }
      },
      limits: {
        fileSize: parseInt(process.env.MAX_FILE_SIZE || '100') * 1024 * 1024,
      },
    }),
  )
  async uploadDocuments(
    @Param('id') datasetId: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Body() uploadDto: UploadDocumentDto,
    @Request() req: any,
  ) {
    if (!files || files.length === 0) {
      throw new Error('No files uploaded');
    }

    const userId = req.user?.id || req.user?.sub;

    if (!userId) {
      throw new Error('User not authenticated');
    }

    const result = await this.service.uploadDocumentsToDataset(
      datasetId,
      files,
      userId,
      uploadDto,
    );

    return {
      success: true,
      message: `Successfully uploaded ${files.length} document(s)`,
      data: {
        dataset: result.dataset,
        documents: result.documents,
        uploadedFiles: files.map((file) => ({
          originalName: file.originalname,
          filename: file.filename,
          size: file.size,
          mimetype: file.mimetype,
        })),
      },
    };
  }

  @Post(':id/sync-posts')
  @ApiOperation({ summary: 'Sync posts to dataset using filters' })
  async syncPosts(
    @Param('id') datasetId: string,
    @Body() syncDto: SyncPostsDto,
    @Request() req: any,
  ) {
    const userId = req.user?.id || req.user?.sub;

    if (!userId) {
      throw new Error('User not authenticated');
    }

    const result = await this.service.syncPostsToDataset(
      datasetId,
      syncDto,
      userId,
    );

    return {
      success: true,
      message: `Successfully synced ${result.documents.length} post(s) to dataset`,
      data: {
        dataset: result.dataset,
        documents: result.documents,
      },
    };
  }

  @Post('process-documents')
  async processDocuments(
    @Body() processDto: ProcessDocumentsDto,
    @Request() req: any,
  ) {
    const userId = req.user?.id || req.user?.sub;

    if (!userId) {
      throw new Error('User not authenticated');
    }

    const result = await this.service.processDocuments(processDto, userId);

    return {
      success: true,
      message: 'Documents processing started successfully',
      data: result,
    };
  }

  @Post(':id/complete-setup')
  @UsePipes(new ValidationPipe({ transform: true }))
  async completeDatasetSetup(
    @Param('id') datasetId: string,
    @Body() setupDto: CreateDatasetStepTwoDto,
    @Request() req: any,
  ) {
    const userId = req.user?.id || req.user?.sub;

    if (!userId) {
      throw new Error('User not authenticated');
    }

    const result = await this.service.completeDatasetSetup(
      datasetId,
      setupDto,
      userId,
    );

    return {
      success: true,
      message: 'Dataset setup completed successfully',
      data: result,
    };
  }

  @Get('search')
  @ApiOperation({ summary: 'Search datasets with pagination' })
  @ApiQuery({ name: 'q', required: false, description: 'Search query' })
  @ApiQuery({
    name: 'page',
    required: false,
    description: 'Page number',
    type: Number,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Items per page',
    type: Number,
  })
  @ApiQuery({ name: 'sort', required: false, description: 'Sort field' })
  async searchDatasets(
    @Query('q') searchQuery?: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('sort') sort: string = 'createdAt,DESC',
  ) {
    return this.service.searchDatasets(searchQuery, page, limit, sort);
  }

  @Post('search-documents')
  async searchDocuments(
    @Body() searchDto: SearchDocumentsDto,
  ): Promise<HybridSearchResponse> {
    try {
      const {
        documentId,
        query,
        limit = 10,
        rerankerType = RerankerType.NONE,
        bm25Weight,
        embeddingWeight,
      } = searchDto;

      this.logger.log(
        `🔍 Starting hybrid search for document ${documentId} with query: "${query}" (limit: ${limit})`,
      );

      // First, get the document to check if it exists
      const document = await this.documentService.findById(documentId);

      if (!document) {
        throw new NotFoundException('Document not found');
      }

      // Get dataset to retrieve stored search weights if not provided in request
      const dataset = await this.service.findById(document.datasetId);

      // Use request weights if provided, otherwise use dataset chat settings, finally fallback to hardcoded defaults
      const datasetChatSettings =
        (dataset?.settings as any)?.chat_settings || {};
      const finalBm25Weight =
        bm25Weight ?? datasetChatSettings.bm25Weight ?? 0.4;
      const finalEmbeddingWeight =
        embeddingWeight ?? datasetChatSettings.embeddingWeight ?? 0.6;

      this.logger.log(
        `⚖️ Using search weights - BM25: ${finalBm25Weight}, Embedding: ${finalEmbeddingWeight}`,
      );

      // Check if document has segments
      const segmentsCount =
        await this.documentSegmentService.countSegmentsWithEmbeddings(
          documentId,
        );

      if (segmentsCount === 0) {
        return {
          results: [],
          query,
          count: 0,
          message:
            'No segments found for this document. Please process the document first.',
        };
      }

      this.logger.log(
        `📊 Document has ${segmentsCount} segments available for search`,
      );

      // Use hybrid search with configured weights
      const hybridResults = await this.hybridSearchService.hybridSearch(
        documentId,
        query,
        limit,
        finalEmbeddingWeight, // semantic weight
        finalBm25Weight, // keyword weight
        rerankerType,
      );

      this.logger.log(`✅ Hybrid search found ${hybridResults.count} results`);

      return hybridResults;
    } catch (error) {
      this.logger.error('🚨 Hybrid search error:', error);
      throw new BadRequestException(`Search failed: ${error.message}`);
    }
  }

  @Put('/:id/chat-settings')
  @UsePipes(new ValidationPipe({ transform: true }))
  async updateChatSettings(
    @Param('id') datasetId: string,
    @Body() updateChatSettingsDto: UpdateChatSettingsDto,
    @Request() req: any,
  ) {
    try {
      const userId = req.user?.id || req.user?.sub;
      if (!userId) {
        throw new BadRequestException('User not authenticated');
      }

      const updatedDataset = await this.service.updateChatSettings(
        datasetId,
        updateChatSettingsDto,
        userId,
      );

      return {
        success: true,
        dataset: updatedDataset,
        message: 'Chat settings updated successfully',
      };
    } catch (error) {
      throw new BadRequestException(
        `Failed to update chat settings: ${error.message}`,
      );
    }
  }

  @Put('/:id/graph-settings')
  @UsePipes(new ValidationPipe({ transform: true }))
  async updateGraphSettings(
    @Param('id') datasetId: string,
    @Body() updateGraphSettingsDto: UpdateGraphSettingsDto,
    @Request() req: any,
  ) {
    try {
      const userId = req.user?.id || req.user?.sub;
      if (!userId) {
        throw new BadRequestException('User not authenticated');
      }

      const updatedDataset = await this.service.updateGraphSettings(
        datasetId,
        updateGraphSettingsDto,
        userId,
      );

      return {
        success: true,
        dataset: updatedDataset,
        message: 'Graph settings updated successfully',
      };
    } catch (error) {
      throw new BadRequestException(
        `Failed to update graph settings: ${error.message}`,
      );
    }
  }

  @Get('/:id/graph-settings')
  async getGraphSettings(@Param('id') datasetId: string, @Request() req: any) {
    try {
      const userId = req.user?.id || req.user?.sub;
      if (!userId) {
        throw new BadRequestException('User not authenticated');
      }

      const graphSettings = await this.service.getGraphSettings(
        datasetId,
        userId,
      );

      return {
        success: true,
        graphSettings,
        message: 'Graph settings retrieved successfully',
      };
    } catch (error) {
      throw new BadRequestException(
        `Failed to get graph settings: ${error.message}`,
      );
    }
  }

  @Get('/:id/resolved-graph-settings')
  async getResolvedGraphSettings(
    @Param('id') datasetId: string,
    @Request() req: any,
  ) {
    try {
      const userId = req.user?.id || req.user?.sub;
      if (!userId) {
        throw new BadRequestException('User not authenticated');
      }

      const resolvedSettings = await this.service.resolveGraphSettings(
        datasetId,
        userId,
      );

      return {
        success: true,
        graphSettings: resolvedSettings,
        message: 'Resolved graph settings retrieved successfully',
      };
    } catch (error) {
      throw new BadRequestException(
        `Failed to get resolved graph settings: ${error.message}`,
      );
    }
  }

  @Get('/effective-config/:id')
  async getEffectiveConfig(@Param('id') datasetId: string) {
    try {
      const dataset = await this.service.findOne({ where: { id: datasetId } });
      if (!dataset) {
        throw new Error('Dataset not found');
      }

      // Parse the index structure to get current configuration
      let indexStruct: any = {};
      try {
        indexStruct = dataset.indexStruct
          ? JSON.parse(dataset.indexStruct)
          : {};
      } catch (error) {
        this.logger.warn(
          `Failed to parse indexStruct for dataset ${datasetId}: ${error.message}`,
        );
      }

      const userChunkSize = indexStruct.chunkSize || 1000;
      const userChunkOverlap = indexStruct.chunkOverlap || 200;
      const embeddingModel =
        (dataset.embeddingModel as EmbeddingModel) ||
        EmbeddingModel.XENOVA_BGE_M3;
      const useModelDefaults = indexStruct.useModelDefaults !== false; // Default to true

      // Calculate effective values
      const effectiveChunkSize = getEffectiveChunkSize(
        userChunkSize,
        embeddingModel,
        useModelDefaults,
      );
      const effectiveChunkOverlap = getEffectiveChunkOverlap(
        userChunkOverlap,
        embeddingModel,
        effectiveChunkSize,
        useModelDefaults,
      );

      // Get model defaults for additional info
      const modelDefaults = getModelDefaults(embeddingModel);

      return {
        datasetId: dataset.id,
        embeddingModel: dataset.embeddingModel,
        userConfiguration: {
          chunkSize: userChunkSize,
          chunkOverlap: userChunkOverlap,
          useModelDefaults: useModelDefaults,
        },
        effectiveConfiguration: {
          chunkSize: effectiveChunkSize,
          chunkOverlap: effectiveChunkOverlap,
          textSplitter:
            indexStruct.textSplitter || modelDefaults.recommendedTextSplitter,
        },
        modelOptimizations: {
          enabled: useModelDefaults,
          description: modelDefaults.description,
          recommendedChunkSize: modelDefaults.recommendedChunkSize,
          recommendedChunkOverlap: modelDefaults.recommendedChunkOverlap,
          maxTokens: modelDefaults.maxTokens,
        },
        optimizationApplied:
          effectiveChunkSize !== userChunkSize ||
          effectiveChunkOverlap !== userChunkOverlap,
      };
    } catch (error) {
      this.logger.error(
        `Failed to get effective config for dataset ${datasetId}: ${error.message}`,
      );
      throw new Error(
        `Failed to get effective configuration: ${error.message}`,
      );
    }
  }

  // Add a simple status endpoint without auth
  @Get('/status/:id')
  async getDatasetStatus(@Param('id') datasetId: string) {
    try {
      const segments =
        await this.documentSegmentService.findByDatasetId(datasetId);

      return {
        datasetId,
        totalSegments: segments.length,
        segmentsWithEmbeddings: segments.filter((s) => s.embeddingId).length,
        segmentStatuses: segments.reduce(
          (acc, segment) => {
            acc[segment.status] = (acc[segment.status] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>,
        ),
        sampleSegment: segments[0]
          ? {
              id: segments[0].id,
              status: segments[0].status,
              hasEmbeddingId: !!segments[0].embeddingId,
              content: segments[0].content.substring(0, 50) + '...',
            }
          : null,
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  @Post('/cleanup-embeddings/:id')
  async cleanupOrphanedEmbeddings(@Param('id') datasetId: string) {
    try {
      const dataset = await this.service.findOne({ where: { id: datasetId } });
      if (!dataset) {
        throw new NotFoundException('Dataset not found');
      }

      // Use the existing cleanup method in DocumentSegmentService
      const cleanupResult =
        await this.documentSegmentService.removeInconsistentEmbeddings(
          datasetId,
        );

      if (cleanupResult.removedCount > 0) {
        // Trigger reprocessing for segments that lost their embeddings
        const documents = await this.documentService.findByDatasetId(datasetId);
        const documentIds = documents.map((d) => d.id);

        if (documentIds.length > 0 && dataset.embeddingModel) {
          // Parse the indexStruct to get chunking configuration
          let chunkingConfig: {
            textSplitter: string;
            chunkSize: number;
            chunkOverlap: number;
            separators?: string[];
          } = {
            textSplitter: 'recursive_character',
            chunkSize: 1000,
            chunkOverlap: 200,
          };

          try {
            if (dataset.indexStruct) {
              chunkingConfig = {
                ...chunkingConfig,
                ...JSON.parse(dataset.indexStruct),
              };
            }
          } catch {
            this.logger.warn('Failed to parse indexStruct, using defaults');
          }

          // Trigger reprocessing for the cleaned segments
          this.service.processDocuments(
            {
              datasetId,
              documentIds,
              embeddingModel: dataset.embeddingModel as any,
              textSplitter: chunkingConfig.textSplitter as any,
              chunkSize: chunkingConfig.chunkSize,
              chunkOverlap: chunkingConfig.chunkOverlap,
              separators: chunkingConfig.separators,
            },
            'system-cleanup',
          );
        }
      }

      return {
        message: `Cleanup completed: ${cleanupResult.removedCount} inconsistent embeddings removed, ${cleanupResult.keptCount} kept`,
        cleanedEmbeddings: cleanupResult.removedCount,
        keptEmbeddings: cleanupResult.keptCount,
        dimensionCounts: cleanupResult.dimensionCounts,
        reprocessingTriggered: cleanupResult.removedCount > 0,
      };
    } catch (error) {
      throw new BadRequestException(`Cleanup failed: ${error.message}`);
    }
  }

  @Get('/all-orphaned-embeddings')
  async getAllOrphanedEmbeddings() {
    try {
      const orphanedEmbeddings = await this.service.findOrphanedEmbeddings();

      return {
        count: orphanedEmbeddings.length,
        embeddings: orphanedEmbeddings.map((e) => ({
          id: e.id,
          modelName: e.modelName,
          dimensions: e.embedding?.length || 0,
          createdAt: e.createdAt,
        })),
        message:
          orphanedEmbeddings.length > 0
            ? `Found ${orphanedEmbeddings.length} orphaned embeddings that should be cleaned up`
            : 'No orphaned embeddings found',
      };
    } catch (error) {
      throw new BadRequestException(
        `Failed to check orphaned embeddings: ${error.message}`,
      );
    }
  }

  @Post('/cleanup-all-orphaned-embeddings')
  async cleanupAllOrphanedEmbeddings() {
    try {
      const result = await this.service.cleanupOrphanedEmbeddings();

      return {
        message: `Cleaned up ${result.deletedCount} orphaned embeddings`,
        deletedCount: result.deletedCount,
        deletedEmbeddings: result.deletedEmbeddings,
      };
    } catch (error) {
      throw new BadRequestException(
        `Failed to cleanup orphaned embeddings: ${error.message}`,
      );
    }
  }

  @Get(':id/graph/status')
  async getGraphExtractionStatus(@Param('id') id: string, @Request() req: any) {
    try {
      // Get documents with their processing status
      const documents = await this.documentService.findByDatasetId(id);

      const graphStatus = documents.map((doc: any) => ({
        documentId: doc.id,
        documentName: doc.name,
        status: doc.indexingStatus,
        graphExtraction: doc.processingMetadata?.graphExtraction || null,
      }));

      return {
        success: true,
        data: {
          datasetId: id,
          totalDocuments: documents.length,
          documents: graphStatus,
        },
      };
    } catch (error) {
      throw new BadRequestException(
        `Failed to get graph extraction status: ${error.message}`,
      );
    }
  }

  @Get(':id/documents')
  async getDocumentsByDataset(
    @Param('id') id: string,
    @Request() req: any,
    @Query('q') searchTerm?: string,
  ) {
    try {
      const documents = await this.documentService.findByDatasetId(id);

      let filteredDocuments = documents;
      if (searchTerm) {
        filteredDocuments = documents.filter(
          (doc: any) =>
            doc.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            doc.description?.toLowerCase().includes(searchTerm.toLowerCase()),
        );
      }

      return {
        success: true,
        data: filteredDocuments.map((doc: any) => ({
          id: doc.id,
          name: doc.name,
          description: doc.description,
          status: doc.indexingStatus,
          createdAt: doc.createdAt,
          updatedAt: doc.updatedAt,
        })),
      };
    } catch (error) {
      throw new BadRequestException(
        `Failed to get documents: ${error.message}`,
      );
    }
  }

  @Get(':datasetId/documents/:documentId/segments')
  async getSegmentsByDocument(
    @Param('datasetId') datasetId: string,
    @Param('documentId') documentId: string,
    @Request() req: any,
    @Query('q') searchTerm?: string,
  ) {
    try {
      const segments =
        await this.documentSegmentService.findByDocumentId(documentId);

      let filteredSegments = segments;
      if (searchTerm) {
        filteredSegments = segments.filter((segment: any) =>
          segment.content.toLowerCase().includes(searchTerm.toLowerCase()),
        );
      }

      return {
        success: true,
        data: filteredSegments.map((segment: any) => ({
          id: segment.id,
          content:
            segment.content.substring(0, 200) +
            (segment.content.length > 200 ? '...' : ''),
          wordCount: segment.wordCount,
          tokens: segment.tokens,
          status: segment.status,
          createdAt: segment.createdAt,
        })),
      };
    } catch (error) {
      throw new BadRequestException(`Failed to get segments: ${error.message}`);
    }
  }
}
