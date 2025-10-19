import { Injectable, Inject, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Document } from './entities/document.entity';
import { Dataset } from './entities/dataset.entity';
import { DocumentSegment } from './entities/document-segment.entity';
import { Embedding } from './entities/embedding.entity';
import { TypeOrmCrudService } from '@dataui/crud-typeorm';
import { Cache } from 'cache-manager';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { UploadDocumentDto } from './dto/create-dataset-step.dto';
import { EventTypes } from '../event/constants/event-types';
import { DocumentUploadedEvent } from '../event/interfaces/document-events.interface';
import { CsvConnectorTemplateService } from '../csv-connector/services/csv-connector-template.service';
import { CsvParserService } from '../csv-connector/services/csv-parser.service';
import { promises as fs } from 'fs';
import { join } from 'path';

@Injectable()
export class DocumentService extends TypeOrmCrudService<Document> {
  private readonly logger = new Logger(DocumentService.name);

  constructor(
    @InjectRepository(Document)
    private readonly documentRepository: Repository<Document>,
    @InjectRepository(Dataset)
    private readonly datasetRepository: Repository<Dataset>,
    @InjectRepository(DocumentSegment)
    private readonly segmentRepository: Repository<DocumentSegment>,
    @InjectRepository(Embedding)
    private readonly embeddingRepository: Repository<Embedding>,
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
    private readonly eventEmitter: EventEmitter2,
    private readonly csvTemplateService: CsvConnectorTemplateService,
    private readonly csvParserService: CsvParserService,
  ) {
    super(documentRepository);
  }

  async findById(id: string): Promise<Document | null> {
    return this.documentRepository.findOne({
      where: { id },
      relations: ['dataset', 'user', 'segments'],
    });
  }

  async findByDatasetId(datasetId: string): Promise<Document[]> {
    return this.documentRepository.find({
      where: { datasetId },
      relations: ['user', 'segments'],
      order: { position: 'ASC' },
    });
  }

  async create(data: Partial<Document>): Promise<Document> {
    const document = this.documentRepository.create(data);
    return this.documentRepository.save(document);
  }

  async update(id: string, data: Partial<Document>): Promise<Document> {
    await this.documentRepository.update(id, data);
    const document = await this.findById(id);
    if (!document) {
      throw new Error('Document not found');
    }
    await this.invalidateDocumentCache(id);
    return document;
  }

  async invalidateDocumentCache(documentId: string): Promise<void> {
    await this.cacheManager.del(`document:${documentId}`);
    await this.cacheManager.del('documents:all');
  }

  async invalidateDatasetCache(datasetId: string): Promise<void> {
    await this.cacheManager.del(`dataset:${datasetId}`);
    await this.cacheManager.del('datasets:all');
  }

  /**
   * Delete physical file from disk
   * @param fileId - The file ID stored in the document
   * @param datasetId - The dataset ID for logging purposes
   */
  private async deletePhysicalFile(
    fileId: string | null,
    datasetId: string,
  ): Promise<void> {
    if (!fileId) {
      this.logger.log(
        `📄 No fileId found for document in dataset ${datasetId}, skipping file deletion`,
      );
      return;
    }

    try {
      const filePath = join(process.cwd(), 'uploads', 'documents', fileId);

      // Check if file exists before attempting deletion
      await fs.access(filePath);

      // Delete the file
      await fs.unlink(filePath);
      this.logger.log(`🗑️ Successfully deleted physical file: ${filePath}`);
    } catch (error) {
      if (error.code === 'ENOENT') {
        this.logger.warn(
          `⚠️ Physical file not found (may have been already deleted): ${fileId}`,
        );
      } else {
        this.logger.error(
          `❌ Failed to delete physical file ${fileId}:`,
          error.message,
        );
        // Don't throw error - file deletion failure shouldn't prevent document deletion
      }
    }
  }

  async deleteDocument(id: string): Promise<void> {
    this.logger.log(`🗑️ Starting document deletion: ${id}`);

    // First, get the document to retrieve fileId for physical file deletion
    const document = await this.documentRepository.findOne({
      where: { id },
      select: ['id', 'fileId', 'datasetId'],
    });

    if (!document) {
      this.logger.warn(`⚠️ Document ${id} not found, skipping deletion`);
      return;
    }

    this.logger.log(
      `📄 Document found: ${document.name} (fileId: ${document.fileId})`,
    );

    // Use a transaction to ensure all deletions happen atomically
    const queryRunner =
      this.documentRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // First, get all segments for this document to find embeddings to delete
      const segments = await queryRunner.manager.find(DocumentSegment, {
        where: { documentId: id },
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

      // Delete document segments first (they reference embeddings via foreign key)
      const deletedSegments = await queryRunner.manager.delete(
        DocumentSegment,
        { documentId: id },
      );
      this.logger.log(`✅ Deleted ${deletedSegments.affected || 0} segments`);

      // Now delete embeddings (no longer referenced by segments)
      if (embeddingIds.length > 0) {
        const deletedEmbeddings = await queryRunner.manager.delete(
          Embedding,
          embeddingIds,
        );
        this.logger.log(
          `✅ Deleted ${deletedEmbeddings.affected || 0} embeddings`,
        );
      }

      // Finally, delete the document itself
      const deletedDocument = await queryRunner.manager.delete(Document, id);
      this.logger.log(
        `✅ Deleted document: ${deletedDocument.affected || 0} record(s)`,
      );

      // Commit the transaction
      await queryRunner.commitTransaction();

      // After successful database deletion, delete the physical file
      await this.deletePhysicalFile(document.fileId, document.datasetId);

      // Invalidate caches
      await this.invalidateDocumentCache(id);
      await this.invalidateDatasetCache(document.datasetId);

      this.logger.log(`🎉 Document deletion completed successfully: ${id}`);
    } catch (error) {
      // Rollback the transaction on error
      await queryRunner.rollbackTransaction();
      this.logger.error(
        `💥 Document deletion failed, transaction rolled back: ${error.message}`,
      );
      throw error;
    } finally {
      // Release the query runner
      await queryRunner.release();
    }
  }

  async getDocumentsByStatus(status: string): Promise<Document[]> {
    return this.documentRepository.find({
      where: { indexingStatus: status },
      relations: ['dataset', 'user'],
      order: { createdAt: 'DESC' },
    });
  }

  async updateIndexingStatus(id: string, status: string): Promise<Document> {
    await this.documentRepository.update(id, { indexingStatus: status });
    const document = await this.findById(id);
    if (!document) {
      throw new Error('Document not found');
    }
    await this.invalidateDocumentCache(id);
    return document;
  }

  async uploadDocuments(
    files: Express.Multer.File[],
    uploadData: UploadDocumentDto,
    userId: string,
  ): Promise<{ dataset: Dataset; documents: Document[] }> {
    let dataset: Dataset;

    // If datasetId is provided, use existing dataset
    if (uploadData.datasetId) {
      const existingDataset = await this.datasetRepository.findOne({
        where: { id: uploadData.datasetId },
      });
      if (!existingDataset) {
        throw new Error('Dataset not found');
      }
      dataset = existingDataset;
    } else {
      // Create new dataset using first file name as dataset name
      const datasetName =
        uploadData.datasetName ||
        (files.length > 0
          ? files[0].originalname.split('.')[0]
          : 'New Dataset');

      dataset = this.datasetRepository.create({
        name: datasetName,
        description:
          uploadData.datasetDescription ||
          `Dataset created from uploaded files`,
        provider: 'upload',
        permission: 'only_me',
        dataSourceType: 'upload_file',
        userId,
        settings: {
          chat_settings: {
            provider: 'openrouter',
            model: 'openai/gpt-oss-20b:free',
            temperature: 0.7,
            maxChunks: 5,
          },
        },
      });
      dataset = await this.datasetRepository.save(dataset);
    }

    // Get the next position for documents in this dataset
    const existingDocs = await this.findByDatasetId(dataset.id);
    let nextPosition =
      Math.max(...existingDocs.map((doc) => doc.position), 0) + 1;

    // Create documents for each uploaded file
    const documents: Document[] = [];
    for (const file of files) {
      const docType = uploadData.docType || this.getFileType(file.originalname);

      // Prepare base metadata
      const baseMetadata = {
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        uploadedAt: new Date(),
      };

      // Handle CSV configuration
      let csvConfig = null;
      if (docType === 'csv' && uploadData.csvConnectorType) {
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
        dataSourceType: uploadData.dataSourceType || 'upload_file',
        batch: uploadData.batch || `upload_${Date.now()}`,
        name: file.originalname,
        createdFrom: uploadData.createdFrom || 'upload',
        fileId: file.filename, // Store the uploaded file name/path
        docType,
        docForm: uploadData.docForm || 'text_model',
        docLanguage: uploadData.docLanguage || 'en',
        indexingStatus: 'waiting',
        enabled: true,
        archived: false,
        userId,
        docMetadata: {
          ...baseMetadata,
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
          filePath: file.path, // Full path to the uploaded file
        },
        timestamp: Date.now(),
      };

      this.eventEmitter.emit(EventTypes.DOCUMENT_UPLOADED, uploadedEvent);
    }

    await this.invalidateDocumentCache('all');
    return { dataset, documents };
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
}
