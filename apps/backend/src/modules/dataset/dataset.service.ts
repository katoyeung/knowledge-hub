import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Dataset } from './entities/dataset.entity';
import { Document } from './entities/document.entity';
import { DocumentSegment } from './entities/document-segment.entity';
import { Embedding } from './entities/embedding.entity';
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
import { EventTypes } from '../event/constants/event-types';
import { DocumentUploadedEvent } from '../event/interfaces/document-events.interface';
import { Logger } from '@nestjs/common';

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
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
    private readonly eventEmitter: EventEmitter2,
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
      // First, get all segments for this dataset to find embeddings to delete
      const segments = await queryRunner.manager.find(DocumentSegment, {
        where: { datasetId: id },
        select: ['id', 'embeddingId'],
      });

      this.logger.log(`🗑️ Found ${segments.length} segments to analyze`);

      // Collect all embedding IDs that need to be deleted
      const embeddingIds = segments
        .filter((segment) => segment.embeddingId)
        .map((segment) => segment.embeddingId)
        .filter(Boolean) // Remove null/undefined values
        .filter((id, index, self) => self.indexOf(id) === index); // Remove duplicates

      this.logger.log(
        `🗑️ Found ${embeddingIds.length} unique embeddings to delete`,
      );

      // Debug: Show first few embedding IDs
      if (embeddingIds.length > 0) {
        this.logger.log(
          `🔍 Sample embedding IDs: ${embeddingIds.slice(0, 3).join(', ')}`,
        );
      }

      // Delete document segments first (they reference embeddings via foreign key)
      const deletedSegments = await queryRunner.manager.delete(
        DocumentSegment,
        { datasetId: id },
      );
      this.logger.log(`✅ Deleted ${deletedSegments.affected || 0} segments`);

      // Now delete embeddings (no longer referenced by segments)
      if (embeddingIds.length > 0) {
        try {
          // Use repository method to delete embeddings
          const repoDeleteResult = await queryRunner.manager.delete(
            Embedding,
            embeddingIds,
          );
          this.logger.log(
            `✅ Deleted ${repoDeleteResult.affected || 0} embeddings`,
          );
        } catch (error) {
          this.logger.error(`❌ Failed to delete embeddings: ${error.message}`);
          throw error;
        }
      }

      // Delete all documents related to this dataset
      const deletedDocuments = await queryRunner.manager.delete(Document, {
        datasetId: id,
      });
      this.logger.log(`✅ Deleted ${deletedDocuments.affected || 0} documents`);

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
    });

    return this.datasetRepository.save(dataset);
  }

  async uploadDocumentsToDataset(
    datasetId: string,
    files: Express.Multer.File[],
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

    // Create documents for each uploaded file
    const documents: Document[] = [];
    for (const file of files) {
      const document = this.documentRepository.create({
        datasetId: dataset.id,
        position: nextPosition++,
        dataSourceType: 'upload_file',
        batch: `upload_${Date.now()}`,
        name: file.originalname,
        createdFrom: 'upload',
        fileId: file.filename,
        docType: this.getFileType(file.originalname),
        docForm: 'text_model',
        docLanguage: 'en',
        indexingStatus: 'waiting',
        enabled: true,
        archived: false,
        userId,
        docMetadata: {
          originalName: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
          uploadedAt: new Date(),
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
    await this.datasetRepository.update(processDto.datasetId, {
      embeddingModel: processDto.embeddingModel,
      embeddingModelProvider: 'local',
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

    for (const document of documents) {
      await this.documentRepository.update(document.id, {
        indexingStatus: 'processing',
      });

      // Emit document processing event
      this.eventEmitter.emit('document.processing', {
        documentId: document.id,
        datasetId: processDto.datasetId,
        embeddingConfig: {
          model: processDto.embeddingModel,
          customModelName: processDto.customModelName,
          provider: 'local',
          textSplitter: processDto.textSplitter,
          chunkSize: processDto.chunkSize,
          chunkOverlap: processDto.chunkOverlap,
          separators: processDto.separators,
          // 🆕 Pass parent-child chunking option
          enableParentChildChunking: processDto.enableParentChildChunking,
        },
        userId: _userId,
      });
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

    // Update dataset with final configuration
    await this.datasetRepository.update(datasetId, {
      embeddingModel: setupDto.embeddingModel,
      embeddingModelProvider: 'local',
      indexStruct: JSON.stringify({
        textSplitter: setupDto.textSplitter,
        chunkSize: setupDto.chunkSize,
        chunkOverlap: setupDto.chunkOverlap,
        separators: setupDto.separators,
        customModelName: setupDto.customModelName,
      }),
    });

    const updatedDataset = await this.findById(datasetId);
    await this.invalidateDatasetCache(datasetId);

    // Log the completion for the user
    this.logger.log(`Dataset setup completed by user ${userId}: ${datasetId}`);

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
}
