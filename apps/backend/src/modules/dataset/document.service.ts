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
import { LangChainRAGService } from './services/langchain-rag.service';

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
    private readonly langChainRAGService: LangChainRAGService,
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

  async deleteDocument(id: string): Promise<void> {
    this.logger.log(`🗑️ Starting document deletion: ${id}`);

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

      await this.invalidateDocumentCache(id);
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
      const document = this.documentRepository.create({
        datasetId: dataset.id,
        position: nextPosition++,
        dataSourceType: uploadData.dataSourceType || 'upload_file',
        batch: uploadData.batch || `upload_${Date.now()}`,
        name: file.originalname,
        createdFrom: uploadData.createdFrom || 'upload',
        fileId: file.filename, // Store the uploaded file name/path
        docType: uploadData.docType || this.getFileType(file.originalname),
        docForm: uploadData.docForm || 'text_model',
        docLanguage: uploadData.docLanguage || 'en',
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
          filePath: file.path, // Full path to the uploaded file
        },
        timestamp: Date.now(),
      };

      this.eventEmitter.emit(EventTypes.DOCUMENT_UPLOADED, uploadedEvent);
    }

    // Handle LangChain RAG processing if enabled
    if (uploadData.enableLangChainRAG && uploadData.langChainConfig) {
      try {
        this.logger.log('🚀 Starting LangChain RAG processing');

        const langChainConfig = JSON.parse(uploadData.langChainConfig);
        const ragResult =
          await this.langChainRAGService.processDocumentsWithLangChainRAG(
            dataset.id,
            documents.map((doc) => doc.id),
            langChainConfig,
            userId,
          );

        if (ragResult.success) {
          this.logger.log(
            `✅ LangChain RAG processing completed: ${ragResult.message}`,
          );
        } else {
          this.logger.error(
            `❌ LangChain RAG processing failed: ${ragResult.message}`,
          );
        }
      } catch (error) {
        this.logger.error('❌ LangChain RAG processing error:', error);
        // Don't fail the upload if RAG processing fails
      }
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
      default:
        return 'file';
    }
  }
}
