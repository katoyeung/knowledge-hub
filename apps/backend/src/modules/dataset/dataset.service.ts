import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { JobDispatcherService } from '../queue/services/job-dispatcher.service';
import { Dataset } from './entities/dataset.entity';
import { Document } from './entities/document.entity';
import { DocumentSegment } from './entities/document-segment.entity';
import { Embedding } from './entities/embedding.entity';
import { ChatConversation } from '../chat/entities/chat-conversation.entity';
import { ChatMessage } from '../chat/entities/chat-message.entity';
import { TypeOrmCrudService } from '@dataui/crud-typeorm';
import { Cache } from 'cache-manager';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { CreateDatasetDto } from './dto/create-dataset.dto';
import { UpdateDatasetDto } from './dto/update-dataset.dto';
import {
  CreateDatasetStepOneDto,
  CreateDatasetStepTwoDto,
  ProcessDocumentsDto,
} from './dto/create-dataset-step.dto';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { EventTypes } from '../event/constants/event-types';
import { CsvParserService } from '../csv-connector/services/csv-parser.service';
import { CsvConnectorTemplateService } from '../csv-connector/services/csv-connector-template.service';
import { DocumentUploadedEvent } from '../event/interfaces/document-events.interface';
import { Logger } from '@nestjs/common';
import { EmbeddingConfigProcessorService } from './services/embedding-config-processor.service';
import { UpdateGraphSettingsDto } from './dto/update-graph-settings.dto';
import { UserService } from '../user/user.service';
import { PostsService } from '../posts/posts.service';
import { SyncPostsDto } from './dto/upload-document.dto';

@Injectable()
export class DatasetService extends TypeOrmCrudService<Dataset> {
  private readonly logger = new Logger(DatasetService.name);

  constructor(
    @InjectRepository(Dataset)
    private readonly datasetRepository: Repository<Dataset>,
    @InjectRepository(Document)
    private readonly documentRepository: Repository<Document>,
    @InjectRepository(DocumentSegment)
    private readonly segmentRepository: Repository<DocumentSegment>,
    @InjectRepository(Embedding)
    private readonly embeddingRepository: Repository<Embedding>,
    @InjectRepository(ChatConversation)
    private readonly chatConversationRepository: Repository<ChatConversation>,
    @InjectRepository(ChatMessage)
    private readonly chatMessageRepository: Repository<ChatMessage>,
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
    private readonly eventEmitter: EventEmitter2,
    private readonly embeddingConfigProcessor: EmbeddingConfigProcessorService,
    private readonly jobDispatcher: JobDispatcherService,
    private readonly csvParserService: CsvParserService,
    private readonly csvTemplateService: CsvConnectorTemplateService,
    private readonly userService: UserService,
    private readonly postsService: PostsService,
  ) {
    super(datasetRepository);
  }

  async findById(id: string): Promise<Dataset | null> {
    return this.datasetRepository.findOne({
      where: { id },
      relations: ['user', 'documents', 'segments', 'keywordTable'],
    });
  }

  async create(data: CreateDatasetDto): Promise<Dataset> {
    const dataset = this.datasetRepository.create(data);
    return this.datasetRepository.save(dataset);
  }

  async update(id: string, data: UpdateDatasetDto): Promise<Dataset> {
    await this.datasetRepository.update(id, data);
    const dataset = await this.findById(id);
    if (!dataset) {
      throw new Error('Dataset not found');
    }
    await this.invalidateDatasetCache(id);
    return dataset;
  }

  async invalidateDatasetCache(datasetId: string): Promise<void> {
    await this.cacheManager.del(`dataset:${datasetId}`);
    await this.cacheManager.del('datasets:all');
  }

  async updateDataset(id: string, data: UpdateDatasetDto): Promise<Dataset> {
    const dataset = await this.datasetRepository.save({ id, ...data });
    await this.invalidateDatasetCache(id);
    return dataset;
  }

  async deleteDataset(id: string): Promise<void> {
    this.logger.log(`🗑️ Starting dataset deletion: ${id}`);

    // Use a transaction to ensure all deletions happen atomically
    const queryRunner =
      this.datasetRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Get counts for logging
      const segmentCount = await queryRunner.manager.count(DocumentSegment, {
        where: { datasetId: id },
      });
      const documentCount = await queryRunner.manager.count(Document, {
        where: { datasetId: id },
      });
      this.logger.log(
        `🗑️ Found ${segmentCount} segments and ${documentCount} documents to delete`,
      );

      // Step 1: Delete all segments for this dataset
      this.logger.log(`🗑️ Deleting segments for dataset ${id}...`);

      // First, clear parent_id references to break foreign key chains
      await queryRunner.query(
        `UPDATE document_segments SET parent_id = NULL WHERE dataset_id = $1`,
        [id],
      );
      this.logger.log(`✅ Cleared parent_id references`);

      // Delete all segments
      const deletedSegments = await queryRunner.query(
        `DELETE FROM document_segments WHERE dataset_id = $1`,
        [id],
      );
      this.logger.log(`✅ Deleted ${deletedSegments.length || 0} segments`);

      // Step 2: Delete all documents for this dataset
      this.logger.log(`🗑️ Deleting documents for dataset ${id}...`);
      const deletedDocuments = await queryRunner.query(
        `DELETE FROM documents WHERE dataset_id = $1`,
        [id],
      );
      this.logger.log(`✅ Deleted ${deletedDocuments.length || 0} documents`);

      // Step 3: Delete embeddings that are no longer referenced by any segments
      this.logger.log(`🗑️ Cleaning up orphaned embeddings...`);
      const deletedEmbeddings = await queryRunner.query(`
        DELETE FROM embeddings 
        WHERE id NOT IN (
          SELECT DISTINCT embedding_id 
          FROM document_segments 
          WHERE embedding_id IS NOT NULL
        )
      `);
      this.logger.log(
        `✅ Deleted ${deletedEmbeddings.length || 0} orphaned embeddings`,
      );

      // Delete all chat messages related to this dataset first
      const deletedChatMessages = await queryRunner.manager.delete(
        ChatMessage,
        {
          datasetId: id,
        },
      );
      this.logger.log(
        `✅ Deleted ${deletedChatMessages.affected || 0} chat messages`,
      );

      // Delete all chat conversations related to this dataset
      const deletedChatConversations = await queryRunner.manager.delete(
        ChatConversation,
        {
          datasetId: id,
        },
      );
      this.logger.log(
        `✅ Deleted ${deletedChatConversations.affected || 0} chat conversations`,
      );

      // Finally, delete the dataset itself
      const deletedDataset = await queryRunner.manager.delete(Dataset, id);
      this.logger.log(
        `✅ Deleted dataset: ${deletedDataset.affected || 0} record(s)`,
      );

      // Commit the transaction
      await queryRunner.commitTransaction();

      await this.invalidateDatasetCache(id);
      this.logger.log(`🎉 Dataset deletion completed successfully: ${id}`);
    } catch (error) {
      // Rollback the transaction on error
      await queryRunner.rollbackTransaction();
      this.logger.error(
        `💥 Dataset deletion failed, transaction rolled back: ${error.message}`,
      );
      throw error;
    } finally {
      // Release the query runner
      await queryRunner.release();
    }
  }

  /**
   * Recursively delete segments to handle complex parent-child relationships
   */
  private async deleteSegmentsRecursively(
    queryRunner: any,
    datasetId: string,
  ): Promise<void> {
    this.logger.log(
      `🔄 Starting recursive segment deletion for dataset ${datasetId}`,
    );

    let deletedCount = 0;
    const maxIterations = 20; // Increased limit for complex hierarchies
    let iteration = 0;

    while (iteration < maxIterations) {
      iteration++;
      this.logger.log(`🔄 Recursive deletion iteration ${iteration}`);

      // Get all segments for this dataset
      const segments = await queryRunner.manager.find(DocumentSegment, {
        where: { datasetId },
        select: ['id', 'parentId'],
      });

      if (segments.length === 0) {
        this.logger.log(`✅ No more segments to delete`);
        break;
      }

      this.logger.log(`📊 Found ${segments.length} segments remaining`);

      // Find segments that have no children (leaf nodes)
      const segmentIds = segments.map((s: DocumentSegment) => s.id);
      const segmentsWithChildren = await queryRunner.manager
        .createQueryBuilder()
        .select('parentId')
        .from(DocumentSegment, 'ds')
        .where('ds.parentId IN (:...segmentIds)', { segmentIds })
        .andWhere('ds.datasetId = :datasetId', { datasetId })
        .getRawMany();

      const parentIdsWithChildren = new Set(
        segmentsWithChildren.map((s: any) => s.parentId),
      );

      // Delete only leaf segments (segments with no children)
      const leafSegmentIds = segments
        .filter((s: DocumentSegment) => !parentIdsWithChildren.has(s.id))
        .map((s: DocumentSegment) => s.id);

      if (leafSegmentIds.length === 0) {
        this.logger.warn(
          `⚠️ No leaf segments found, this might indicate a circular reference. Forcing deletion of remaining ${segments.length} segments`,
        );

        // Try to delete segments one by one to avoid foreign key constraints
        for (const segmentId of segmentIds) {
          try {
            const deleted = await queryRunner.manager.delete(
              DocumentSegment,
              segmentId,
            );
            if (deleted.affected && deleted.affected > 0) {
              deletedCount++;
              this.logger.log(`🔧 Force deleted segment ${segmentId}`);
            }
          } catch (error) {
            this.logger.warn(
              `⚠️ Failed to delete segment ${segmentId}: ${error.message}`,
            );
          }
        }
        break;
      }

      this.logger.log(`🗑️ Deleting ${leafSegmentIds.length} leaf segments`);

      // Delete leaf segments in batches to avoid constraint issues
      const batchSize = 100;
      for (let i = 0; i < leafSegmentIds.length; i += batchSize) {
        const batch = leafSegmentIds.slice(i, i + batchSize);
        try {
          const deleted = await queryRunner.manager.delete(
            DocumentSegment,
            batch,
          );
          deletedCount += deleted.affected || 0;
          this.logger.log(
            `✅ Deleted batch of ${deleted.affected || 0} segments`,
          );
        } catch (error) {
          this.logger.warn(
            `⚠️ Failed to delete batch, trying individual deletion: ${error.message}`,
          );
          // Try deleting one by one
          for (const segmentId of batch) {
            try {
              const deleted = await queryRunner.manager.delete(
                DocumentSegment,
                segmentId,
              );
              if (deleted.affected && deleted.affected > 0) {
                deletedCount++;
              }
            } catch (individualError) {
              this.logger.warn(
                `⚠️ Failed to delete individual segment ${segmentId}: ${individualError.message}`,
              );
            }
          }
        }
      }
    }

    // Final verification
    const remainingSegments = await queryRunner.manager.count(DocumentSegment, {
      where: { datasetId },
    });

    if (remainingSegments > 0) {
      this.logger.error(
        `💥 CRITICAL: ${remainingSegments} segments still remain after recursive deletion!`,
      );
      throw new Error(
        `Failed to delete all segments: ${remainingSegments} segments remain after ${iteration} iterations`,
      );
    }

    this.logger.log(
      `🎉 Recursive deletion completed: ${deletedCount} segments deleted in ${iteration} iterations`,
    );
  }

  async getDatasetWithDetails(id: string): Promise<Dataset | null> {
    return this.datasetRepository.findOne({
      where: { id },
      relations: [
        'user',
        'documents',
        'documents.segments',
        'segments',
        'keywordTable',
      ],
    });
  }

  async getDatasetsByUser(userId: string): Promise<Dataset[]> {
    return this.datasetRepository.find({
      where: { userId },
      relations: ['user', 'documents'],
      order: { createdAt: 'DESC' },
    });
  }

  async createDatasetStepOne(
    data: CreateDatasetStepOneDto,
    userId: string,
  ): Promise<Dataset> {
    const dataset = this.datasetRepository.create({
      name: data.name,
      description: data.description,
      provider: 'upload',
      permission: 'only_me',
      dataSourceType: 'upload_file',
      indexingTechnique: 'high_quality',
      userId,
      settings: {
        chat_settings: {},
      },
    });

    return this.datasetRepository.save(dataset);
  }

  async uploadDocumentsToDataset(
    datasetId: string,
    files: Express.Multer.File[],
    userId: string,
    uploadData?: UploadDocumentDto,
  ): Promise<{ dataset: Dataset; documents: Document[] }> {
    const dataset = await this.datasetRepository.findOne({
      where: { id: datasetId },
    });

    if (!dataset) {
      throw new Error('Dataset not found');
    }

    // Get the next position for documents in this dataset
    const existingDocs = await this.documentRepository.find({
      where: { datasetId },
      order: { position: 'DESC' },
      take: 1,
    });

    let nextPosition =
      existingDocs.length > 0 ? existingDocs[0].position + 1 : 1;

    // Create documents for each uploaded file
    const documents: Document[] = [];
    for (const file of files) {
      const docType = this.getFileType(file.originalname);

      // Handle CSV configuration
      let csvConfig = null;
      if (docType === 'csv' && uploadData?.csvConnectorType) {
        try {
          // Parse CSV to get headers
          const filePath = file.path;
          const parseResult =
            await this.csvParserService.parseCsvFile(filePath);

          if (parseResult.success) {
            if (uploadData.csvConnectorType === 'custom') {
              // Create custom configuration
              csvConfig = this.csvTemplateService.createCustomConfig(
                uploadData.csvFieldMappings || {},
                uploadData.csvSearchableColumns || [],
                parseResult.headers,
              );
            } else {
              // Create configuration from template
              csvConfig = this.csvTemplateService.createConfigFromTemplate(
                uploadData.csvConnectorType,
                parseResult.headers,
              );
            }

            if (csvConfig) {
              csvConfig.totalRows = parseResult.totalRows;
            }
          }
        } catch (error) {
          this.logger.warn(
            `Failed to parse CSV for configuration: ${error.message}`,
          );
        }
      }

      const document = this.documentRepository.create({
        datasetId: dataset.id,
        position: nextPosition++,
        dataSourceType: uploadData?.dataSourceType || 'upload_file',
        batch: uploadData?.batch || `upload_${Date.now()}`,
        name: file.originalname,
        createdFrom: uploadData?.createdFrom || 'upload',
        fileId: file.filename,
        docType,
        docForm: uploadData?.docForm || 'text_model',
        docLanguage: uploadData?.docLanguage || 'en',
        indexingStatus: 'waiting',
        enabled: true,
        archived: false,
        userId,
        docMetadata: {
          originalName: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
          uploadedAt: new Date(),
          ...(csvConfig && { csvConfig }),
        },
      });

      const savedDocument = await this.documentRepository.save(document);
      documents.push(savedDocument);

      // Emit document uploaded event for each document
      const uploadedEvent: DocumentUploadedEvent = {
        type: EventTypes.DOCUMENT_UPLOADED,
        payload: {
          documentId: savedDocument.id,
          datasetId: dataset.id,
          userId,
          filename: file.filename,
          originalName: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
          filePath: file.path,
        },
        timestamp: Date.now(),
      };

      this.eventEmitter.emit(EventTypes.DOCUMENT_UPLOADED, uploadedEvent);
    }

    await this.invalidateDatasetCache(datasetId);
    return { dataset, documents };
  }

  async syncPostsToDataset(
    datasetId: string,
    syncDto: SyncPostsDto,
    userId: string,
  ): Promise<{ dataset: Dataset; documents: Document[] }> {
    const dataset = await this.datasetRepository.findOne({
      where: { id: datasetId },
    });

    if (!dataset) {
      throw new Error('Dataset not found');
    }

    // Get the next position for documents in this dataset
    const existingDocs = await this.documentRepository.find({
      where: { datasetId },
      order: { position: 'DESC' },
      take: 1,
    });

    let nextPosition =
      existingDocs.length > 0 ? existingDocs[0].position + 1 : 1;

    // Store post filters in document metadata (similar to CSV config)
    // The actual posts will be fetched and processed during chunking
    const postConfig = {
      filters: {
        hash: syncDto.hash,
        provider: syncDto.provider,
        source: syncDto.source,
        title: syncDto.title,
        metaKey: syncDto.metaKey,
        metaValue: syncDto.metaValue,
        userId: syncDto.userId,
        postedAtStart: syncDto.postedAtStart,
        postedAtEnd: syncDto.postedAtEnd,
        startDate: syncDto.startDate,
        endDate: syncDto.endDate,
      },
      syncedAt: new Date(),
    };

    // Create a single document to represent the posts sync (similar to how CSV file is one document)
    // The document will be processed later, and posts will be grouped by source during chunking
    const document = this.documentRepository.create({
      datasetId: dataset.id,
      position: nextPosition,
      dataSourceType: 'posts',
      batch: `posts_sync_${Date.now()}`,
      name: 'Posts Sync',
      createdFrom: 'posts_sync',
      fileId: undefined, // No file for posts
      docType: 'posts',
      docForm: 'text_model',
      docLanguage: 'en',
      indexingStatus: 'waiting',
      enabled: true,
      archived: false,
      userId,
      docMetadata: {
        postConfig, // Store filters for later processing
      },
    });

    const savedDocument = await this.documentRepository.save(document);

    // Emit document uploaded event
    const uploadedEvent: DocumentUploadedEvent = {
      type: EventTypes.DOCUMENT_UPLOADED,
      payload: {
        documentId: savedDocument.id,
        datasetId: dataset.id,
        userId,
        filename: '', // No file for posts
        originalName: 'Posts Sync',
        mimeType: 'text/plain',
        size: 0,
        filePath: '', // No file for posts
      },
      timestamp: Date.now(),
    };

    this.eventEmitter.emit(EventTypes.DOCUMENT_UPLOADED, uploadedEvent);

    await this.invalidateDatasetCache(datasetId);
    this.logger.log(
      `Successfully created posts sync document for dataset ${datasetId}`,
    );
    return { dataset, documents: [savedDocument] };
  }

  async processDocuments(
    processDto: ProcessDocumentsDto,
    _userId: string,
  ): Promise<{ dataset: Dataset; processedDocuments: Document[] }> {
    // Update dataset with embedding configuration
    const dataset = await this.datasetRepository.findOne({
      where: { id: processDto.datasetId },
    });

    if (!dataset) {
      throw new Error('Dataset not found');
    }

    // Update dataset with embedding configuration
    // Get existing settings or create new ones
    const existingDataset = await this.datasetRepository.findOne({
      where: { id: processDto.datasetId },
    });
    const existingSettings = (existingDataset?.settings as any) || {};

    await this.datasetRepository.update(processDto.datasetId, {
      embeddingModel: processDto.embeddingModel,
      embeddingModelProvider: processDto.embeddingProvider || 'local',
      settings: {
        ...existingSettings,
        chat_settings: {
          ...(existingSettings.chat_settings || {}),
          // Set default search weights for new datasets
          bm25Weight: 0.4,
          embeddingWeight: 0.6,
        },
      },
      indexStruct: JSON.stringify({
        textSplitter: processDto.textSplitter,
        chunkSize: processDto.chunkSize,
        chunkOverlap: processDto.chunkOverlap,
        separators: processDto.separators,
        customModelName: processDto.customModelName,
      }),
    });

    // Update document statuses to processing
    const documents = await this.documentRepository.find({
      where: {
        id: In(processDto.documentIds),
        datasetId: processDto.datasetId,
      },
    });

    // Dispatch chunking jobs for all documents
    for (const document of documents) {
      await this.documentRepository.update(document.id, {
        indexingStatus: 'waiting',
      });

      // Dispatch chunking job
      await this.jobDispatcher.dispatch('chunking', {
        documentId: document.id,
        datasetId: processDto.datasetId,
        userId: _userId,
        embeddingConfig: {
          model: processDto.embeddingModel,
          customModelName: processDto.customModelName,
          provider: processDto.embeddingProvider || 'local',
          textSplitter: processDto.textSplitter,
          chunkSize: processDto.chunkSize,
          chunkOverlap: processDto.chunkOverlap,
          separators: processDto.separators,
          enableParentChildChunking: processDto.enableParentChildChunking,
          useModelDefaults: processDto.useModelDefaults,
        },
      });

      this.logger.log(
        `[DATASET] Dispatched chunking job for document ${document.id}`,
      );
    }

    const updatedDataset = await this.findById(processDto.datasetId);
    await this.invalidateDatasetCache(processDto.datasetId);

    return {
      dataset: updatedDataset!,
      processedDocuments: documents,
    };
  }

  async completeDatasetSetup(
    datasetId: string,
    setupDto: CreateDatasetStepTwoDto,
    userId: string,
  ): Promise<Dataset> {
    const dataset = await this.datasetRepository.findOne({
      where: { id: datasetId },
    });

    if (!dataset) {
      throw new Error('Dataset not found');
    }

    // Process the embedding configuration
    const processedConfig =
      this.embeddingConfigProcessor.processConfig(setupDto);

    // Validate the configuration
    const validation =
      this.embeddingConfigProcessor.validateConfig(processedConfig);
    if (!validation.isValid) {
      throw new Error(`Invalid configuration: ${validation.errors.join(', ')}`);
    }

    // Log configuration summary
    const configSummary =
      this.embeddingConfigProcessor.getConfigSummary(processedConfig);
    this.logger.log(
      `Processing dataset ${datasetId} with config: ${configSummary}`,
    );

    // Update dataset with processed configuration
    // Get existing settings or create new ones
    const existingDataset = await this.datasetRepository.findOne({
      where: { id: datasetId },
    });
    const existingSettings = (existingDataset?.settings as any) || {};

    await this.datasetRepository.update(datasetId, {
      embeddingModel: processedConfig.embeddingModel,
      embeddingModelProvider: processedConfig.embeddingModelProvider || 'local',
      settings: {
        ...existingSettings,
        chat_settings: {
          ...(existingSettings.chat_settings || {}),
          // Set default search weights for new datasets
          bm25Weight: 0.4,
          embeddingWeight: 0.6,
        },
      },
      indexStruct: JSON.stringify({
        mode: processedConfig.mode,
        textSplitter: processedConfig.textSplitter,
        chunkSize: processedConfig.chunkSize,
        chunkOverlap: processedConfig.chunkOverlap,
        separators: processedConfig.separators,
        customModelName: processedConfig.customModelName,
        enableParentChildChunking: processedConfig.enableParentChildChunking,
        useModelDefaults: processedConfig.useModelDefaults,
      }),
    });

    const updatedDataset = await this.findById(datasetId);
    await this.invalidateDatasetCache(datasetId);

    // Log the completion for the user
    this.logger.log(
      `Dataset setup completed by user ${userId}: ${datasetId} (${processedConfig.mode} mode)`,
    );

    return updatedDataset!;
  }

  private getFileType(filename: string): string {
    const extension = filename.split('.').pop()?.toLowerCase();
    switch (extension) {
      case 'pdf':
        return 'pdf';
      case 'doc':
      case 'docx':
        return 'word';
      case 'txt':
        return 'text';
      case 'md':
        return 'markdown';
      case 'json':
        return 'json';
      case 'csv':
        return 'csv';
      default:
        return 'file';
    }
  }

  async findOrphanedEmbeddings(): Promise<Embedding[]> {
    // Find embeddings that are not referenced by any segments
    const orphanedEmbeddings = await this.embeddingRepository
      .createQueryBuilder('embedding')
      .leftJoin(
        'document_segments',
        'segment',
        'segment.embeddingId = embedding.id',
      )
      .where('segment.id IS NULL')
      .getMany();

    this.logger.log(
      `🔍 Found ${orphanedEmbeddings.length} orphaned embeddings`,
    );
    return orphanedEmbeddings;
  }

  async cleanupOrphanedEmbeddings(): Promise<{
    deletedCount: number;
    deletedEmbeddings: string[];
  }> {
    const orphanedEmbeddings = await this.findOrphanedEmbeddings();

    if (orphanedEmbeddings.length === 0) {
      return { deletedCount: 0, deletedEmbeddings: [] };
    }

    const embeddingIds = orphanedEmbeddings.map((e) => e.id);

    this.logger.log(
      `🗑️ Cleaning up ${embeddingIds.length} orphaned embeddings`,
    );

    const deleteResult = await this.embeddingRepository.delete(embeddingIds);

    this.logger.log(
      `✅ Deleted ${deleteResult.affected || 0} orphaned embeddings`,
    );

    return {
      deletedCount: deleteResult.affected || 0,
      deletedEmbeddings: embeddingIds,
    };
  }

  async getAllEmbeddingDimensions(): Promise<Record<number, number>> {
    // Get dimension counts across all embeddings in the database
    // Use vector_dims() function from pgvector extension
    const result = await this.embeddingRepository
      .createQueryBuilder('embedding')
      .select('vector_dims(embedding.embedding) as dimensions')
      .addSelect('COUNT(*) as count')
      .where('embedding.embedding IS NOT NULL')
      .groupBy('vector_dims(embedding.embedding)')
      .getRawMany();

    const dimensionCounts: Record<number, number> = {};
    result.forEach((row) => {
      const dims = parseInt(row.dimensions);
      const count = parseInt(row.count);
      if (!isNaN(dims) && !isNaN(count)) {
        dimensionCounts[dims] = count;
      }
    });

    this.logger.log(
      `📊 Database embedding dimensions: ${JSON.stringify(dimensionCounts)}`,
    );
    return dimensionCounts;
  }

  async getSampleEmbeddingsByDimension(): Promise<Record<number, any[]>> {
    const dimensions = await this.getAllEmbeddingDimensions();
    const samples: Record<number, any[]> = {};

    for (const dim of Object.keys(dimensions)) {
      const dimNum = parseInt(dim);
      const sampleEmbeddings = await this.embeddingRepository
        .createQueryBuilder('embedding')
        .leftJoinAndSelect(
          'document_segments',
          'segment',
          'segment.embeddingId = embedding.id',
        )
        .leftJoinAndSelect(
          'documents',
          'document',
          'document.id = segment.documentId',
        )
        .leftJoinAndSelect(
          'datasets',
          'dataset',
          'dataset.id = document.datasetId',
        )
        .where('vector_dims(embedding.embedding) = :dim', { dim: dimNum })
        .limit(3)
        .getRawMany();

      samples[dimNum] = sampleEmbeddings.map((row) => ({
        embeddingId: row.embedding_id,
        modelName: row.embedding_modelName,
        dimensions: dimNum,
        segmentId: row.segment_id || 'orphaned',
        documentId: row.document_id || 'orphaned',
        documentName: row.document_name || 'orphaned',
        datasetId: row.dataset_id || 'orphaned',
        datasetName: row.dataset_name || 'orphaned',
        isOrphaned: !row.segment_id,
      }));
    }

    return samples;
  }

  async updateChatSettings(
    datasetId: string,
    chatSettings: any,
    userId: string,
  ): Promise<Dataset> {
    this.logger.log(`Updating chat settings for dataset ${datasetId}`);

    const dataset = await this.datasetRepository.findOne({
      where: { id: datasetId, userId },
    });

    if (!dataset) {
      throw new Error('Dataset not found or access denied');
    }

    // Get existing settings or create new ones
    const existingSettings = (dataset.settings as any) || {};
    const updatedSettings = {
      ...existingSettings,
      chat_settings: {
        ...(existingSettings.chat_settings || {}),
        ...chatSettings,
      },
    };

    // Update the dataset with new settings
    await this.datasetRepository.update(datasetId, {
      settings: updatedSettings,
    });

    // Invalidate cache
    await this.invalidateDatasetCache(datasetId);

    // Return updated dataset
    const updatedDataset = await this.datasetRepository.findOne({
      where: { id: datasetId },
    });

    if (!updatedDataset) {
      throw new Error('Failed to retrieve updated dataset');
    }

    this.logger.log(
      `Chat settings updated for dataset ${datasetId}: ${JSON.stringify(chatSettings)}`,
    );

    return updatedDataset;
  }

  async updateGraphSettings(
    datasetId: string,
    graphSettings: UpdateGraphSettingsDto,
    userId: string,
  ): Promise<Dataset> {
    this.logger.log(`Updating graph settings for dataset ${datasetId}`);

    const dataset = await this.datasetRepository.findOne({
      where: { id: datasetId, userId },
    });

    if (!dataset) {
      throw new Error('Dataset not found or access denied');
    }

    // Get existing settings or create new ones
    const existingSettings = (dataset.settings as any) || {};
    const updatedSettings = {
      ...existingSettings,
      graph_settings: {
        ...graphSettings,
      },
    };

    // Update the dataset with new settings
    await this.datasetRepository.update(datasetId, {
      settings: updatedSettings,
    });

    // Invalidate cache
    await this.invalidateDatasetCache(datasetId);

    // Return updated dataset
    const updatedDataset = await this.datasetRepository.findOne({
      where: { id: datasetId },
    });

    if (!updatedDataset) {
      throw new Error('Failed to retrieve updated dataset');
    }

    this.logger.log(
      `Graph settings updated for dataset ${datasetId}: ${JSON.stringify(graphSettings)}`,
    );

    return updatedDataset;
  }

  async getGraphSettings(datasetId: string, userId: string): Promise<object> {
    const dataset = await this.datasetRepository.findOne({
      where: { id: datasetId, userId },
      select: ['id', 'settings'],
    });

    if (!dataset) {
      throw new Error('Dataset not found or access denied');
    }

    return (dataset.settings as any)?.graph_settings || {};
  }

  async resolveGraphSettings(
    datasetId: string,
    userId: string,
  ): Promise<object> {
    // Get user's default graph settings
    const userGraphSettings =
      await this.userService.getUserGraphSettings(userId);

    // Get dataset's graph settings
    const datasetGraphSettings = await this.getGraphSettings(datasetId, userId);

    // Merge user defaults with dataset overrides
    return {
      ...userGraphSettings,
      ...datasetGraphSettings,
    };
  }

  async searchDatasets(
    searchQuery?: string,
    page: number = 1,
    limit: number = 10,
    sort: string = 'createdAt,DESC',
  ) {
    const queryBuilder = this.datasetRepository
      .createQueryBuilder('dataset')
      .leftJoinAndSelect('dataset.user', 'user');

    // Add search filter if provided
    if (searchQuery && searchQuery.trim()) {
      queryBuilder.where(
        '(dataset.name ILIKE :search OR dataset.description ILIKE :search)',
        { search: `%${searchQuery}%` },
      );
    }

    // Parse sort parameter
    const [sortField, sortOrder] = sort.split(',');
    const validSortFields = ['name', 'createdAt', 'updatedAt', 'provider'];
    const field = validSortFields.includes(sortField) ? sortField : 'createdAt';
    const order = sortOrder === 'ASC' ? 'ASC' : 'DESC';

    queryBuilder.orderBy(`dataset.${field}`, order);

    // Add pagination
    const offset = (page - 1) * limit;
    queryBuilder.skip(offset).take(limit);

    // Execute query
    const [data, total] = await queryBuilder.getManyAndCount();

    return {
      data,
      count: data.length,
      total,
      page,
      pageCount: Math.ceil(total / limit),
    };
  }
}
