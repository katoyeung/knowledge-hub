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
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CreateDatasetDto } from './dto/create-dataset.dto';
import { UpdateDatasetDto } from './dto/update-dataset.dto';
import {
  CreateDatasetStepOneDto,
  CreateDatasetStepTwoDto,
  ProcessDocumentsDto,
  SearchDocumentsDto,
  EmbeddingModel,
  RerankerType,
} from './dto/create-dataset-step.dto';
import { Resource } from '@modules/access/enums/permission.enum';
import { CrudPermissions } from '@modules/access/decorators/crud-permissions.decorator';
import { PopulateUserIdInterceptor } from '@common/interceptors/populate-user-id.interceptor';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { DocumentSegmentService } from './document-segment.service';
import { HybridSearchService, HybridSearchResponse } from './services/hybrid-search.service';
import { DocumentService } from './document.service';
import { EmbeddingService } from './services/embedding.service';
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
        eager: true,
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
//@UseGuards(JwtAuthGuard, PermsGuard)
@UseGuards(JwtAuthGuard)
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
    private readonly embeddingService: EmbeddingService,
    private readonly hybridSearchService: HybridSearchService,
  ) {}

  @Override('deleteOneBase')
  async deleteOne(@ParsedRequest() req: CrudRequest) {
    const id = req.parsed.paramsFilter.find((f) => f.field === 'id')?.value;
    if (!id) {
      throw new Error('Dataset ID is required');
    }

    await this.service.deleteDataset(id);
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

  @Post('search-documents')
  async searchDocuments(@Body() searchDto: SearchDocumentsDto): Promise<HybridSearchResponse> {
    try {
      const {
        documentId,
        query,
        limit = 10,
        similarityThreshold = 0.7,
        rerankerType = 'ml-cross-encoder',
      } = searchDto;

      this.logger.log(
        `🔍 Starting hybrid search for document ${documentId} with query: "${query}" (limit: ${limit})`,
      );

      // First, get the document to check if it exists
      const document = await this.documentService.findById(documentId);

      if (!document) {
        throw new NotFoundException('Document not found');
      }

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

      // Use hybrid search (BM25 + Semantic + Reranker)
      const hybridResults = await this.hybridSearchService.hybridSearch(
        documentId,
        query,
        limit,
        0.4, // semantic weight (reduced from 0.6)
        0.6, // keyword weight (increased from 0.4)
        rerankerType as 'mathematical' | 'ml-cross-encoder', // Use the selected reranker type
      );

      this.logger.log(`✅ Hybrid search found ${hybridResults.count} results`);

      return hybridResults;
    } catch (error) {
      this.logger.error('🚨 Hybrid search error:', error);
      throw new BadRequestException(`Search failed: ${error.message}`);
    }
  }

  @Get('/debug/:id')
  async debugDataset(@Param('id') datasetId: string) {
    try {
      // Get dataset info
      const dataset = await this.service.findOne({ where: { id: datasetId } });
      if (!dataset) {
        throw new NotFoundException('Dataset not found');
      }

      // Get all segments for the dataset
      const segments =
        await this.documentSegmentService.findByDatasetId(datasetId);

      // Get segments with embeddings
      const segmentsWithEmbeddings = await Promise.all(
        segments
          .filter((segment) => segment.embeddingId)
          .map(async (segment) => {
            const segmentWithEmbedding =
              await this.documentSegmentService.findOne({
                where: { id: segment.id },
                relations: ['embedding', 'document'],
              });
            return segmentWithEmbedding;
          }),
      );

      const validSegments = segmentsWithEmbeddings.filter(
        (segment) => segment !== null && segment.embedding !== null,
      );

      // Get dimension analysis
      const dimensionAnalysis =
        validSegments.length > 0 && validSegments[0]?.document
          ? await this.documentSegmentService.getEmbeddingDimensionsForDocument(
              validSegments[0].document.id,
            )
          : null;

      // Parse index structure
      let parsedIndexStruct = null;
      try {
        parsedIndexStruct = dataset.indexStruct
          ? JSON.parse(dataset.indexStruct)
          : null;
      } catch {
        parsedIndexStruct = {
          error: 'Failed to parse indexStruct',
          raw: dataset.indexStruct,
        };
      }

      return {
        dataset: {
          id: dataset.id,
          name: dataset.name,
          embeddingModel: dataset.embeddingModel,
          embeddingModelProvider: dataset.embeddingModelProvider,
          indexStruct: parsedIndexStruct,
          rawIndexStruct: dataset.indexStruct,
        },
        embeddingAnalysis: {
          configuredModel: dataset.embeddingModel,
          actualModelFromEmbeddings:
            validSegments.length > 0 && validSegments[0]?.embedding
              ? validSegments[0].embedding.modelName
              : null,
          dimensionAnalysis,
          embeddingDimensions: validSegments
            .filter(
              (s): s is NonNullable<typeof s> =>
                s != null && s.embedding != null,
            )
            .map((s) => ({
              segmentId: s.id,
              embeddingId: s.embedding.id,
              modelName: s.embedding.modelName,
              dimensions: s.embedding.embedding?.length || 0,
              hasEmbedding: !!s.embedding.embedding,
            }))
            .slice(0, 5), // First 5 for sample
        },
        segments: {
          total: segments.length,
          withEmbeddings: validSegments.length,
          withoutEmbeddings: segments.length - validSegments.length,
          sampleSegments: validSegments
            .slice(0, 3)
            .map((segment) => {
              if (!segment) return null;
              return {
                id: segment.id,
                position: segment.position,
                status: segment.status,
                wordCount: segment.wordCount,
                hasEmbedding: !!segment.embedding,
                embeddingDimensions: segment.embedding?.embedding?.length || 0,
                embeddingModelName: segment.embedding?.modelName,
                content: segment.content.substring(0, 100) + '...',
                contentLength: segment.content.length,
                documentEmbeddingModel: segment.document?.embeddingModel,
                documentEmbeddingDimensions:
                  segment.document?.embeddingDimensions,
              };
            })
            .filter(Boolean),
          allSegmentStatuses: segments.map((s) => ({
            id: s.id,
            position: s.position,
            status: s.status,
            embeddingId: s.embeddingId,
            hasEmbeddingId: !!s.embeddingId,
          })),
        },
        documents:
          segments.length > 0
            ? await Promise.all(
                Array.from(new Set(segments.map((s) => s.documentId))).map(
                  async (docId) => {
                    const doc = await this.documentService.findById(docId);
                    if (!doc) return null;
                    return {
                      id: doc.id,
                      name: doc.name,
                      embeddingModel: doc.embeddingModel,
                      embeddingDimensions: doc.embeddingDimensions,
                      indexingStatus: doc.indexingStatus,
                      wordCount: doc.wordCount,
                      tokens: doc.tokens,
                    };
                  },
                ),
              ).then((docs) => docs.filter(Boolean))
            : [],
        environment: {
          hasHuggingFaceToken: !!process.env.HUGGINGFACE_API_TOKEN,
          nodeEnv: process.env.NODE_ENV,
        },
      };
    } catch (error) {
      throw new BadRequestException(`Debug failed: ${error.message}`);
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

  @Get('/debug-embeddings/:documentId')
  async debugEmbeddingsForDocument(@Param('documentId') documentId: string) {
    try {
      // Get document info
      const document = await this.documentService.findById(documentId);
      if (!document) {
        throw new NotFoundException('Document not found');
      }

      // Get all segments for this document
      const segments =
        await this.documentSegmentService.findByDocumentId(documentId);

      // Get segments with embeddings
      const segmentsWithEmbeddings = await Promise.all(
        segments
          .filter((segment) => segment.embeddingId)
          .map(async (segment) => {
            const segmentWithEmbedding =
              await this.documentSegmentService.findOne({
                where: { id: segment.id },
                relations: ['embedding'],
              });
            return segmentWithEmbedding;
          }),
      );

      const validSegments = segmentsWithEmbeddings.filter(
        (s) => s && s.embedding,
      );

      // Analyze dimensions
      const dimensionAnalysis = validSegments.reduce(
        (acc, segment) => {
          if (segment?.embedding?.embedding) {
            const dims = segment.embedding.embedding.length;
            acc[dims] = (acc[dims] || 0) + 1;
          }
          return acc;
        },
        {} as Record<number, number>,
      );

      // Check database-wide embedding dimensions
      const allEmbeddingDimensions =
        await this.service.getAllEmbeddingDimensions();

      return {
        document: {
          id: document.id,
          name: document.name,
          embeddingModel: document.embeddingModel,
          embeddingDimensions: document.embeddingDimensions,
          datasetId: document.datasetId,
        },
        segments: {
          total: segments.length,
          withEmbeddings: validSegments.length,
          dimensionAnalysis,
          hasConsistentDimensions: Object.keys(dimensionAnalysis).length <= 1,
        },
        databaseWide: {
          allDimensions: allEmbeddingDimensions,
          hasMixedDimensions: Object.keys(allEmbeddingDimensions).length > 1,
          recommendation:
            Object.keys(allEmbeddingDimensions).length > 1
              ? 'Mixed dimensions detected. Use cleanup endpoints to remove orphaned embeddings.'
              : 'All embeddings have consistent dimensions.',
        },
        sampleEmbeddings: validSegments
          .slice(0, 3)
          .filter(
            (s): s is NonNullable<typeof s> => s != null && s.embedding != null,
          )
          .map((s) => ({
            segmentId: s.id,
            embeddingId: s.embedding.id,
            modelName: s.embedding.modelName,
            dimensions: s.embedding.embedding?.length || 0,
            content: s.content.substring(0, 100) + '...',
          })),
      };
    } catch (error) {
      throw new BadRequestException(`Debug failed: ${error.message}`);
    }
  }

  @Get('/debug-all-embeddings')
  async debugAllEmbeddings() {
    try {
      const allDimensions = await this.service.getAllEmbeddingDimensions();
      const orphanedEmbeddings = await this.service.findOrphanedEmbeddings();

      // Get sample embeddings for each dimension
      const samplesByDimension =
        await this.service.getSampleEmbeddingsByDimension();

      return {
        summary: {
          totalDimensionTypes: Object.keys(allDimensions).length,
          hasMixedDimensions: Object.keys(allDimensions).length > 1,
          orphanedCount: orphanedEmbeddings.length,
        },
        dimensionCounts: allDimensions,
        orphanedEmbeddings: orphanedEmbeddings.map((e) => ({
          id: e.id,
          modelName: e.modelName,
          dimensions: e.embedding?.length || 0,
          createdAt: e.createdAt,
        })),
        samplesByDimension,
        recommendations: this.generateCleanupRecommendations(
          allDimensions,
          orphanedEmbeddings.length,
        ),
      };
    } catch (error) {
      throw new BadRequestException(`Debug failed: ${error.message}`);
    }
  }

  private generateCleanupRecommendations(
    dimensionCounts: Record<number, number>,
    orphanedCount: number,
  ): string[] {
    const recommendations: string[] = [];

    if (Object.keys(dimensionCounts).length > 1) {
      recommendations.push(
        '🚨 Mixed embedding dimensions detected - this will cause search failures',
      );
      recommendations.push(
        '📋 Use GET /datasets/debug-all-embeddings to identify problematic embeddings',
      );
      recommendations.push(
        '🧹 Use POST /datasets/cleanup-all-orphaned-embeddings to remove orphaned embeddings',
      );
      recommendations.push(
        '🗑️ Consider deleting datasets with wrong dimensions and recreating them',
      );
    }

    if (orphanedCount > 0) {
      recommendations.push(
        `🧹 ${orphanedCount} orphaned embeddings found - clean them up with POST /datasets/cleanup-all-orphaned-embeddings`,
      );
    }

    if (recommendations.length === 0) {
      recommendations.push(
        '✅ All embeddings have consistent dimensions - no cleanup needed',
      );
    }

    return recommendations;
  }
}
