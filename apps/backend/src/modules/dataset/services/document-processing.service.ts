import { Injectable, Logger } from '@nestjs/common';
import { OnEvent, EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { promises as fs } from 'fs';
import { join } from 'path';
import { Document } from '../entities/document.entity';
import { DocumentSegment } from '../entities/document-segment.entity';
import { Dataset } from '../entities/dataset.entity';
import { Embedding } from '../entities/embedding.entity';
import { EventTypes } from '../../event/constants/event-types';
import { DocumentUploadedEvent } from '../../event/interfaces/document-events.interface';
import { EmbeddingV2Service } from './embedding-v2.service';
import { NotificationService } from '../../notification/notification.service';
import {
  EmbeddingModel,
  getEffectiveChunkSize,
  getEffectiveChunkOverlap,
  getModelDefaults,
} from '../dto/create-dataset-step.dto';
import { EmbeddingProvider } from '../../../common/enums/embedding-provider.enum';
import * as crypto from 'crypto';
import * as natural from 'natural';
import {
  RagflowPdfParserService,
  RagflowParseOptions,
} from '../../document-parser/services/ragflow-pdf-parser.service';
import { SimplePdfParserService } from '../../document-parser/services/simple-pdf-parser.service';
import { ChineseTextPreprocessorService } from '../../document-parser/services/chinese-text-preprocessor.service';
import {
  EntityExtractionService,
  EntityExtractionConfig,
} from './entity-extraction.service';
import { ModelMappingService } from '../../../common/services/model-mapping.service';
import { DetectorService } from '../../../common/services/detector.service';
import {
  QueueManagerService,
  JobDetails,
} from '../../queue/services/queue-manager.service';

interface EmbeddingConfig {
  model: string;
  customModelName?: string;
  provider: string;
  textSplitter: string;
  chunkSize: number;
  chunkOverlap: number;
  separators?: string[];
  enableParentChildChunking?: boolean;
  useModelDefaults?: boolean; // 🆕 Enable/disable model-specific optimizations
}

@Injectable()
export class DocumentProcessingService {
  private readonly logger = new Logger(DocumentProcessingService.name);

  constructor(
    @InjectRepository(Document)
    private readonly documentRepository: Repository<Document>,
    @InjectRepository(DocumentSegment)
    private readonly segmentRepository: Repository<DocumentSegment>,
    @InjectRepository(Dataset)
    private readonly datasetRepository: Repository<Dataset>,
    @InjectRepository(Embedding)
    private readonly embeddingRepository: Repository<Embedding>,
    private readonly embeddingService: EmbeddingV2Service,
    private readonly ragflowPdfParserService: RagflowPdfParserService,
    private readonly simplePdfParserService: SimplePdfParserService,
    private readonly chineseTextPreprocessorService: ChineseTextPreprocessorService,
    private readonly entityExtractionService: EntityExtractionService,
    private readonly modelMappingService: ModelMappingService,
    private readonly detectorService: DetectorService,
    private readonly notificationService: NotificationService,
    private readonly eventEmitter: EventEmitter2,
    private readonly queueManager: QueueManagerService,
  ) {}

  @OnEvent('document.processing')
  async handleDocumentProcessing(event: {
    documentId: string;
    datasetId: string;
    embeddingConfig: EmbeddingConfig;
    userId: string;
  }) {
    this.logger.log(`Starting document processing for ${event.documentId}`);

    // Send notification that document processing has started
    this.notificationService.sendDocumentProcessingUpdate(
      event.documentId,
      event.datasetId,
      {
        status: 'processing',
        message: 'Document processing started',
      },
    );

    try {
      await this.processDocument(
        event.documentId,
        event.datasetId,
        event.embeddingConfig,
        event.userId,
      );
    } catch (error) {
      this.logger.error(
        `Document processing failed: ${error.message}`,
        error.stack,
      );

      // Update document status to failed
      await this.documentRepository.update(event.documentId, {
        indexingStatus: 'error',
      });

      // Send notification that document processing failed
      this.notificationService.sendDocumentProcessingUpdate(
        event.documentId,
        event.datasetId,
        {
          status: 'error',
          message: error.message,
          error: error.message,
        },
      );
    }
  }

  @OnEvent(EventTypes.DOCUMENT_UPLOADED)
  handleDocumentUploaded(event: DocumentUploadedEvent) {
    this.logger.log(`Document uploaded: ${event.payload.documentId}`);
    // This will be triggered automatically, but we can add additional logic here if needed
  }

  /**
   * Stop processing for a specific document
   */
  async stopDocumentProcessing(
    documentId: string,
    reason: string = 'Stopped by user',
  ): Promise<void> {
    this.logger.log(
      `🛑 Stopping document processing for ${documentId}: ${reason}`,
    );

    // Update document status
    await this.documentRepository.update(documentId, {
      indexingStatus: 'error',
      error: reason,
      stoppedAt: new Date(),
    });

    // Clean up any existing segments
    const deletedSegments = await this.segmentRepository.delete({
      documentId: documentId,
    });
    this.logger.log(
      `🧹 Cleaned up ${deletedSegments.affected} segments for document ${documentId}`,
    );
  }

  /**
   * Stop ALL processing jobs - called when any file is deleted
   */
  async stopAllProcessingJobs(
    reason: string = 'All processing stopped',
  ): Promise<void> {
    this.logger.log(`🛑 Stopping ALL processing jobs: ${reason}`);

    try {
      // Find all documents that are currently processing
      const processingDocuments = await this.documentRepository.find({
        where: [
          { indexingStatus: 'processing' },
          { indexingStatus: 'indexing' },
          { indexingStatus: 'parsing' },
          { indexingStatus: 'splitting' },
        ],
        select: ['id', 'name', 'indexingStatus'],
      });

      if (processingDocuments.length === 0) {
        this.logger.log('✅ No processing jobs found to stop');
        return;
      }

      this.logger.log(
        `📋 Found ${processingDocuments.length} processing documents to stop`,
      );

      // Update all documents to error status in one batch operation
      const documentIds = processingDocuments.map((doc) => doc.id);

      await this.documentRepository.update(
        { id: In(documentIds) },
        {
          indexingStatus: 'error',
          error: reason,
          stoppedAt: new Date(),
        },
      );

      this.logger.log(
        `✅ Updated ${documentIds.length} documents to error status`,
      );

      // Clean up segments for all documents in one batch operation
      const deletedSegments = await this.segmentRepository.delete({
        documentId: In(documentIds),
      });

      this.logger.log(
        `🧹 Cleaned up ${deletedSegments.affected} segments for all documents`,
      );

      this.logger.log(
        `✅ Successfully stopped ${processingDocuments.length} processing jobs`,
      );
    } catch (error) {
      this.logger.error(`❌ Error stopping processing jobs: ${error.message}`);
      // Don't throw error to prevent blocking the delete operation
    }
  }

  /**
   * Resume processing for a specific document that was interrupted
   */
  async resumeDocumentProcessing(
    documentId: string,
    userId: string,
  ): Promise<{ success: boolean; message: string; documentId: string }> {
    this.logger.log(`🔄 Resuming document processing for ${documentId}`);

    try {
      // Find the document
      const document = await this.documentRepository.findOne({
        where: { id: documentId },
        relations: ['dataset'],
      });

      if (!document) {
        throw new Error(`Document ${documentId} not found`);
      }

      // Check if document is in a resumable state (not completed and not waiting)
      if (document.indexingStatus === 'completed') {
        throw new Error(
          `Document ${documentId} is already completed and cannot be resumed`,
        );
      }

      if (document.indexingStatus === 'waiting') {
        throw new Error(
          `Document ${documentId} is waiting to start and cannot be resumed yet`,
        );
      }

      this.logger.log(
        `📋 Document ${documentId} current status: ${document.indexingStatus}`,
      );

      // Step 1: Stop all running jobs first
      this.logger.log(`🛑 Step 1: Stopping all running processing jobs...`);
      await this.stopAllProcessingJobs(
        'Resuming document processing - stopping all jobs',
      );

      // Step 2: Wait a moment to ensure all jobs are killed
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Step 3: Check if file still exists
      const filePath = join(
        process.cwd(),
        'uploads',
        'documents',
        document.fileId,
      );

      try {
        await fs.access(filePath);
        this.logger.log(`✅ File exists: ${filePath}`);
      } catch {
        throw new Error(`File not found: ${filePath}`);
      }

      // Step 4: Get the dataset's embedding configuration
      const dataset = document.dataset;
      if (!dataset) {
        throw new Error(`Dataset not found for document ${documentId}`);
      }

      // Step 5: Find incomplete segments
      const incompleteSegments = await this.segmentRepository.find({
        where: {
          documentId: documentId,
          status: In(['waiting', 'processing']),
        },
        order: { position: 'ASC' },
      });

      this.logger.log(
        `📊 Found ${incompleteSegments.length} incomplete segments for document ${documentId}`,
      );

      // Step 6: Create embedding configuration from dataset settings
      const embeddingConfig: EmbeddingConfig = {
        model: dataset.embeddingModel || 'Xenova/bge-m3',
        customModelName: undefined,
        provider: dataset.embeddingModelProvider || 'local',
        textSplitter: 'recursive_character',
        chunkSize: 800,
        chunkOverlap: 100,
        separators: undefined,
        enableParentChildChunking: false,
        useModelDefaults: false,
      };

      // Step 7: Reset document status to processing
      await this.documentRepository.update(documentId, {
        indexingStatus: 'processing',
        error: undefined,
        stoppedAt: undefined,
      });

      // Step 8: Reset incomplete segments to waiting status
      if (incompleteSegments.length > 0) {
        await this.segmentRepository.update(
          { id: In(incompleteSegments.map((s) => s.id)) },
          { status: 'waiting' },
        );
        this.logger.log(
          `🔄 Reset ${incompleteSegments.length} segments to waiting status`,
        );
      }

      // Step 9: Send notification that document processing is resuming
      this.notificationService.sendDocumentProcessingUpdate(
        documentId,
        dataset.id,
        {
          status: 'processing',
          message: `Document processing resumed - ${incompleteSegments.length} segments to process`,
        },
      );

      // Step 10: Trigger the processing event
      this.eventEmitter.emit('document.processing', {
        documentId,
        datasetId: dataset.id,
        embeddingConfig,
        userId,
      });

      this.logger.log(
        `✅ Successfully resumed processing for document ${documentId} with ${incompleteSegments.length} segments to process`,
      );

      return {
        success: true,
        message: `Document processing resumed successfully - ${incompleteSegments.length} segments to process`,
        documentId,
      };
    } catch (error) {
      this.logger.error(
        `❌ Failed to resume document processing: ${error.message}`,
      );
      throw error;
    }
  }

  private async processDocument(
    documentId: string,
    datasetId: string,
    embeddingConfig: EmbeddingConfig,
    userId: string,
  ): Promise<void> {
    // Get document and check for cancellation
    const document = await this.documentRepository.findOne({
      where: { id: documentId },
    });

    if (!document) {
      this.logger.log(
        `🛑 Document ${documentId} not found - processing cancelled`,
      );
      return;
    }

    if (document.indexingStatus === 'error') {
      this.logger.log(
        `🛑 Document ${documentId} processing cancelled - status: error`,
      );
      return;
    }

    // Check if file still exists before processing
    const filePath = join(
      process.cwd(),
      'uploads',
      'documents',
      document.fileId,
    );

    try {
      await fs.access(filePath);
      this.logger.log(`✅ File exists: ${filePath}`);
    } catch {
      this.logger.warn(`❌ File not found: ${filePath}`);
      this.logger.log(
        `🛑 Stopping document processing - file has been deleted`,
      );

      // Update document status to indicate file was deleted
      await this.documentRepository.update(documentId, {
        indexingStatus: 'error',
        error: 'File not found - may have been deleted',
        stoppedAt: new Date(),
      });

      // Clean up any existing segments for this document
      await this.segmentRepository.delete({ documentId: documentId });
      this.logger.log(
        `🧹 Cleaned up segments for deleted document ${documentId}`,
      );

      return; // Exit early if file doesn't exist
    }

    // Check if this is a resume operation (segments already exist)
    const existingSegments = await this.segmentRepository.find({
      where: { documentId: documentId },
      order: { position: 'ASC' },
    });

    const isResume = existingSegments.length > 0;

    if (isResume) {
      this.logger.log(
        `🔄 Resume mode: Found ${existingSegments.length} existing segments for document ${documentId}`,
      );
    } else {
      // Clear any existing segments for this document (in case of reprocessing)
      await this.segmentRepository.delete({ documentId: documentId });
      this.logger.log(`Cleared existing segments for document ${documentId}`);
    }

    // Update status to processing
    await this.documentRepository.update(documentId, {
      indexingStatus: 'parsing',
    });

    // Read file content
    let content: string;
    try {
      const filePath = join(
        process.cwd(),
        'uploads',
        'documents',
        document.fileId,
      );
      content = await this.extractTextFromFile(filePath, document.docType);
    } catch (error) {
      throw new Error(`Failed to read file: ${error.message}`);
    }

    // Update status to splitting
    await this.documentRepository.update(documentId, {
      indexingStatus: 'splitting',
    });

    // 🆕 Choose chunking strategy based on configuration
    let segments: DocumentSegment[] = [];

    if (isResume) {
      // Resume mode: use existing segments
      this.logger.log(
        `🔄 Resume mode: Using existing ${existingSegments.length} segments`,
      );
      segments = existingSegments;
    } else {
      // New processing: create segments based on configuration
      if (embeddingConfig.enableParentChildChunking) {
        // Use Parent-Child Chunking for all document types
        this.logger.log(
          `🔗 Using Parent-Child Chunking for document ${documentId}`,
        );
        segments = await this.processWithParentChildChunking(
          document,
          datasetId,
          embeddingConfig,
          userId,
          content, // Pass content for non-PDF documents
        );
      } else {
        // Use traditional chunking
        this.logger.log(
          `📄 Using traditional chunking for document ${documentId}`,
        );
        segments = await this.processWithTraditionalChunking(
          document,
          datasetId,
          content,
          embeddingConfig,
          userId,
        );
      }
    }

    // Update document with embedding configuration
    await this.documentRepository.update(documentId, {
      indexingStatus: 'indexing',
      embeddingModel: embeddingConfig.model,
      embeddingDimensions: undefined, // Will be set after first embedding is generated
    });

    // Generate embeddings for each segment
    let embeddingDimensions: number | undefined;
    const totalSegments = segments.length;

    // Filter segments to only process incomplete ones
    const incompleteSegments = segments.filter(
      (segment) =>
        segment.status === 'waiting' || segment.status === 'processing',
    );

    this.logger.log(
      `🔄 Starting embedding generation for ${incompleteSegments.length} incomplete segments (${totalSegments} total)`,
    );

    if (incompleteSegments.length === 0) {
      this.logger.log(
        `✅ All segments already processed for document ${documentId}`,
      );

      // Update document status to completed
      await this.documentRepository.update(documentId, {
        indexingStatus: 'completed',
        wordCount: content.split(' ').length,
        tokens: Math.ceil(content.length / 4),
        embeddingDimensions:
          segments[0]?.embedding?.embedding?.length || undefined,
      });

      // Send notification that document processing is complete
      this.notificationService.sendDocumentProcessingUpdate(
        documentId,
        datasetId,
        {
          status: 'completed',
          wordCount: content.split(' ').length,
          tokens: Math.ceil(content.length / 4),
          segmentsCount: segments.length,
          embeddingDimensions:
            segments[0]?.embedding?.embedding?.length || undefined,
        },
      );

      this.logger.log(
        `Document processing completed: ${documentId}, all ${segments.length} segments already processed`,
      );
      return;
    }

    // Process segments in parallel batches to improve performance
    const batchSize = 5; // Process 5 segments at a time
    const batches = [];

    for (let i = 0; i < incompleteSegments.length; i += batchSize) {
      batches.push(incompleteSegments.slice(i, i + batchSize));
    }

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      // Check for cancellation before each batch
      const currentDoc = await this.documentRepository.findOne({
        where: { id: documentId },
        select: ['id', 'indexingStatus'],
      });

      if (!currentDoc || currentDoc.indexingStatus === 'error') {
        this.logger.log(
          `🛑 Processing cancelled at batch ${batchIndex + 1}/${batches.length} - document status: ${currentDoc?.indexingStatus}`,
        );
        return;
      }

      // Check if file still exists before processing each batch
      try {
        await fs.access(filePath);
      } catch {
        this.logger.warn(
          `❌ File not found during batch processing: ${filePath}`,
        );
        this.logger.log(
          `🛑 Stopping document processing - file has been deleted`,
        );

        // Update document status to indicate file was deleted
        await this.documentRepository.update(documentId, {
          indexingStatus: 'error',
          error: 'File not found during processing - may have been deleted',
          stoppedAt: new Date(),
        });

        // Clean up any existing segments for this document
        await this.segmentRepository.delete({ documentId: documentId });
        this.logger.log(
          `🧹 Cleaned up segments for deleted document ${documentId}`,
        );

        return; // Exit early if file doesn't exist
      }

      const batch = batches[batchIndex];
      const batchNumber = batchIndex + 1;
      const totalBatches = batches.length;

      this.logger.log(
        `📦 Processing batch ${batchNumber}/${totalBatches} (${batch.length} segments)`,
      );

      // Process segments in parallel within each batch
      const batchPromises = batch.map(async (segment, segmentIndex) => {
        const globalSegmentIndex = batchIndex * batchSize + segmentIndex + 1;
        const totalIncomplete = incompleteSegments.length;

        // Check if file still exists before processing each segment
        try {
          await fs.access(filePath);
        } catch {
          this.logger.warn(
            `❌ File not found during segment processing: ${filePath}`,
          );
          this.logger.log(
            `🛑 Stopping document processing - file has been deleted`,
          );

          // Update document status to indicate file was deleted
          await this.documentRepository.update(documentId, {
            indexingStatus: 'error',
            error: 'File not found during processing - may have been deleted',
            stoppedAt: new Date(),
          });

          // Clean up any existing segments for this document
          await this.segmentRepository.delete({ documentId: documentId });
          this.logger.log(
            `🧹 Cleaned up segments for deleted document ${documentId}`,
          );

          throw new Error('File not found - processing stopped');
        }

        this.logger.log(
          `📊 [${globalSegmentIndex}/${totalIncomplete}] Processing segment ${segment.id} (${segment.content.length} chars)`,
        );

        // Validate text length before embedding generation based on model
        const modelDefaults = getModelDefaults(
          embeddingConfig.model as EmbeddingModel,
        );
        const maxTextLength = Math.min(modelDefaults.maxTokens * 4, 2000); // Conservative limit: 4 chars per token, max 2000 chars
        if (segment.content.length > maxTextLength) {
          this.logger.warn(
            `⚠️ Segment ${segment.id} is too long (${segment.content.length} chars), truncating to ${maxTextLength} chars for model ${embeddingConfig.model}`,
          );
          segment.content = segment.content.substring(0, maxTextLength);
        }

        const embeddingResult = await this.generateEmbedding(
          segment.content,
          embeddingConfig,
        );

        // Store dimensions from first embedding
        if (!embeddingDimensions) {
          embeddingDimensions = embeddingResult.dimensions;
          this.logger.log(
            `Using embedding model ${embeddingConfig.model} with ${embeddingDimensions} dimensions`,
          );
        }

        // Create embedding entity
        const embeddingHash = this.generateEmbeddingHash(
          segment.content,
          embeddingConfig.model,
        );
        // Get the correct model name from the mapping service
        const correctModelName = this.modelMappingService.getModelName(
          embeddingConfig.model as any,
          embeddingConfig.provider as any,
        );

        const embedding = this.embeddingRepository.create({
          modelName: correctModelName, // Use the correct model name from mapping
          hash: embeddingHash,
          embedding: embeddingResult.embedding,
          providerName: embeddingConfig.provider, // Use the actual provider from config
        });

        const savedEmbedding = await this.embeddingRepository.save(embedding);

        // Update segment with embedding reference
        await this.segmentRepository.update(segment.id, {
          status: 'completed',
          embeddingId: savedEmbedding.id,
        });

        this.logger.log(
          `✅ [${globalSegmentIndex}/${totalIncomplete}] Completed segment ${segment.id}`,
        );

        return { segment, embedding: savedEmbedding };
      });

      // Wait for all segments in this batch to complete
      await Promise.all(batchPromises);

      this.logger.log(`✅ Batch ${batchNumber}/${totalBatches} completed`);
    }

    // Update document status to completed with embedding dimensions
    await this.documentRepository.update(documentId, {
      indexingStatus: 'completed',
      wordCount: content.split(' ').length,
      tokens: Math.ceil(content.length / 4),
      embeddingDimensions: embeddingDimensions,
    });

    // Send notification that document processing is complete
    this.notificationService.sendDocumentProcessingUpdate(
      documentId,
      datasetId,
      {
        status: 'completed',
        wordCount: content.split(' ').length,
        tokens: Math.ceil(content.length / 4),
        segmentsCount: segments.length,
        embeddingDimensions: embeddingDimensions,
      },
    );

    this.logger.log(
      `Document processing completed: ${documentId}, ${segments.length} segments created with ${embeddingDimensions} dimensions`,
    );
  }

  private async extractTextFromFile(
    filePath: string,
    docType?: string,
  ): Promise<string> {
    let content = '';

    try {
      if (docType === 'pdf') {
        // Try RAGFlow parser first for better PDF handling
        try {
          const parseResult =
            await this.ragflowPdfParserService.parsePdf(filePath);
          content = parseResult.segments.map((s) => s.content).join('\n\n');
        } catch (ragflowError) {
          this.logger.warn(
            `RAGFlow PDF parsing failed, falling back to simple parser: ${ragflowError.message}`,
          );
          const simpleResult =
            await this.simplePdfParserService.extractTextFromPdf(filePath);
          content = simpleResult.content;
        }
      } else {
        // Handle other file types with comprehensive detection
        const detection = await this.detectorService.detectFile(filePath);
        content = detection.encoding.convertedText || '';

        if (!detection.isValid) {
          this.logger.warn(
            `File detection issues for ${filePath}:`,
            detection.errors,
          );
        }
      }

      // Apply text preprocessing to ALL documents (not just Chinese)
      const originalLength = content.length;

      // Check if it's Chinese text for specialized processing
      const isChinese =
        this.chineseTextPreprocessorService.isChineseText(content);

      if (isChinese) {
        content =
          this.chineseTextPreprocessorService.preprocessChineseText(content);
      } else {
        content = this.cleanGeneralText(content);
      }

      this.logger.log(
        `Text preprocessing complete: ${originalLength} → ${content.length} characters`,
      );

      return content;
    } catch (error) {
      this.logger.error(`Failed to extract text from ${filePath}:`, error);
      throw error;
    }
  }

  private splitText(text: string, config: EmbeddingConfig): string[] {
    const {
      textSplitter,
      chunkSize,
      chunkOverlap,
      model,
      useModelDefaults = false, // Disable model defaults to respect user settings
    } = config;

    // 🆕 Use model-specific defaults for optimal performance
    const effectiveChunkSize = getEffectiveChunkSize(
      chunkSize,
      model as EmbeddingModel,
      useModelDefaults,
    );
    const effectiveOverlap = getEffectiveChunkOverlap(
      chunkOverlap,
      model as EmbeddingModel,
      effectiveChunkSize,
      useModelDefaults,
    );

    // Log model-specific optimizations if enabled
    if (useModelDefaults) {
      const modelDefaults = getModelDefaults(model as EmbeddingModel);
      this.logger.log(
        `🎯 [MODEL_OPTIMIZATION] Using ${model} optimizations: ${modelDefaults.description}`,
      );
    }

    this.logger.log(
      `Starting text splitting with ${textSplitter}, chunkSize: ${chunkSize} → ${effectiveChunkSize}, overlap: ${chunkOverlap} → ${effectiveOverlap}`,
    );

    // Use Chinese-aware splitting for Chinese text
    if (this.chineseTextPreprocessorService.isChineseText(text)) {
      const chunks = this.chineseTextPreprocessorService.splitChineseText(
        text,
        effectiveChunkSize,
        effectiveOverlap,
      );
      this.logger.log(`Chinese splitting produced ${chunks.length} chunks`);
      this.logChunkStatistics(chunks, 'Chinese');
      return chunks;
    }

    let chunks: string[] = [];

    // Enhanced text splitting implementation
    switch (textSplitter) {
      case 'recursive_character':
        chunks = this.recursiveCharacterSplit(
          text,
          effectiveChunkSize,
          effectiveOverlap,
        );
        break;

      case 'character':
        chunks = this.characterSplit(
          text,
          effectiveChunkSize,
          effectiveOverlap,
        );
        break;

      case 'token':
      case 'token_based': // Add support for token_based
        chunks = this.tokenSplit(text, effectiveChunkSize, effectiveOverlap);
        break;

      case 'sentence_splitter': // Add support for sentence_splitter
        chunks = this.sentenceSplit(text, effectiveChunkSize, effectiveOverlap);
        break;

      case 'smart_chunking': // Add support for smart chunking
        chunks = this.smartChunking(text, effectiveChunkSize, effectiveOverlap);
        break;

      case 'markdown':
        chunks = this.markdownSplit(text, effectiveChunkSize, effectiveOverlap);
        break;

      case 'python_code':
        chunks = this.pythonCodeSplit(
          text,
          effectiveChunkSize,
          effectiveOverlap,
        );
        break;

      default:
        chunks = this.recursiveCharacterSplit(
          text,
          effectiveChunkSize,
          effectiveOverlap,
        );
        break;
    }

    this.logger.log(`Text splitting produced ${chunks.length} chunks`);
    this.logChunkStatistics(chunks, textSplitter);

    return chunks;
  }

  /**
   * Log detailed statistics about created chunks
   */
  private logChunkStatistics(chunks: string[], splitterType: string): void {
    if (chunks.length === 0) {
      this.logger.warn(`⚠️ No chunks created with ${splitterType} splitter`);
      return;
    }

    const sizes = chunks.map((chunk) => chunk.length);
    const minSize = Math.min(...sizes);
    const maxSize = Math.max(...sizes);
    const avgSize = sizes.reduce((sum, size) => sum + size, 0) / sizes.length;
    const totalChars = sizes.reduce((sum, size) => sum + size, 0);

    // Estimate token counts
    const tokenCounts = chunks.map((chunk) => this.estimateTokenCount(chunk));
    const avgTokens =
      tokenCounts.reduce((sum, tokens) => sum + tokens, 0) / tokenCounts.length;

    this.logger.log(`📊 [CHUNK_STATS] ${splitterType} splitter results:`);
    this.logger.log(`   - Total chunks: ${chunks.length}`);
    this.logger.log(`   - Total characters: ${totalChars}`);
    this.logger.log(`   - Size range: ${minSize} - ${maxSize} chars`);
    this.logger.log(`   - Average size: ${Math.round(avgSize)} chars`);
    this.logger.log(`   - Average tokens: ${Math.round(avgTokens)}`);
    this.logger.log(
      `   - Size utilization: ${Math.round((avgSize / 800) * 100)}% of target (800 chars)`,
    );

    // Show model-specific performance metrics
    if (avgTokens > 0) {
      this.logger.log(
        `   - Token efficiency: ${Math.round((avgTokens / 800) * 100)}% of optimal token count`,
      );
    }
  }

  /**
   * Estimate token count for text (more accurate than simple char/4)
   */
  private estimateTokenCount(text: string): number {
    // More sophisticated token estimation
    // For BGE M3, Chinese characters are typically 1 token each
    // English words are roughly 1.3 tokens each
    // Punctuation and spaces add minimal tokens

    const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const englishWords = text
      .split(/\s+/)
      .filter(
        (word) => word.length > 0 && !/[\u4e00-\u9fff]/.test(word),
      ).length;
    const punctuation = (text.match(/[^\w\s\u4e00-\u9fff]/g) || []).length;

    // Estimate: Chinese chars = 1 token each, English words = 1.3 tokens each, punctuation = 0.1 tokens each
    return Math.ceil(chineseChars + englishWords * 1.3 + punctuation * 0.1);
  }

  private recursiveCharacterSplit(
    text: string,
    chunkSize: number,
    chunkOverlap: number,
  ): string[] {
    // Enhanced recursive character splitting with better word boundary detection
    const chunks: string[] = [];

    // Split by multiple separators in order of preference - prioritize semantic boundaries
    const separators = [
      '\n\n', // Paragraph breaks
      '\n', // Line breaks
      '. ', // Sentence endings
      '! ', // Exclamation endings
      '? ', // Question endings
      '; ', // Semicolon breaks
      ', ', // Comma breaks
      ' ', // Word boundaries
      '', // Character-level (last resort)
    ];

    let remainingText = text.trim();

    while (remainingText.length > 0) {
      let bestSplitIndex = -1;
      let bestSeparator = '';
      let bestScore = -1;

      // Find the best split point using separators in order of preference
      for (let i = 0; i < separators.length; i++) {
        const separator = separators[i];
        const priority = separators.length - i; // Higher priority for better separators

        if (separator === '') {
          // Last resort: split at exact character limit, but try to avoid word breaking
          if (remainingText.length > chunkSize) {
            // Try to find a word boundary near the limit
            const wordBoundaryIndex = this.findWordBoundaryNearLimit(
              remainingText,
              chunkSize,
            );
            if (wordBoundaryIndex > 0) {
              bestSplitIndex = wordBoundaryIndex;
              bestSeparator = separator;
              bestScore = priority * 0.5; // Lower score for character-level splitting
              break;
            } else {
              bestSplitIndex = chunkSize;
              bestSeparator = separator;
              bestScore = priority * 0.1; // Very low score for forced character splitting
            }
          }
        } else {
          const splitIndex = remainingText.lastIndexOf(separator, chunkSize);
          if (splitIndex > bestSplitIndex && splitIndex <= chunkSize) {
            // Calculate score based on position and separator quality
            const positionScore = splitIndex / chunkSize; // Prefer splits closer to target size
            const totalScore = priority * positionScore;

            if (totalScore > bestScore) {
              bestSplitIndex = splitIndex;
              bestSeparator = separator;
              bestScore = totalScore;
            }
          }
        }
      }

      // If no good split found within chunk size, force split at chunk size
      if (bestSplitIndex === -1 || bestSplitIndex > chunkSize) {
        bestSplitIndex = Math.min(chunkSize, remainingText.length);
        bestSeparator = '';
      }

      // Extract the chunk
      const chunk = remainingText.substring(0, bestSplitIndex).trim();
      if (chunk.length > 0) {
        chunks.push(chunk);
        this.logger.debug(
          `Created chunk ${chunks.length}: ${chunk.length} chars (limit: ${chunkSize}, separator: '${bestSeparator}')`,
        );
      }

      // Handle overlap for next chunk - ensure smooth transitions
      if (chunkOverlap > 0 && chunk.length > chunkOverlap) {
        const overlapText = this.getSmartOverlap(chunk, chunkOverlap);
        remainingText = overlapText + remainingText.substring(bestSplitIndex);
      } else {
        remainingText = remainingText.substring(bestSplitIndex);
      }

      // Skip the separator if it's not the last resort
      if (bestSeparator && bestSeparator !== '') {
        remainingText = remainingText.substring(bestSeparator.length);
      }
    }

    this.logger.log(
      `Recursive character split created ${chunks.length} chunks with avg size: ${Math.round(chunks.reduce((sum, chunk) => sum + chunk.length, 0) / chunks.length)} (target: ${chunkSize})`,
    );
    return chunks;
  }

  /**
   * Find a word boundary near the character limit to avoid splitting words
   */
  private findWordBoundaryNearLimit(text: string, limit: number): number {
    // Look for word boundaries within 20% of the limit
    const searchRange = Math.floor(limit * 0.2);
    const startSearch = Math.max(0, limit - searchRange);

    // Search backwards from the limit for the last space
    for (let i = limit; i >= startSearch; i--) {
      if (text[i] === ' ') {
        return i;
      }
    }

    // If no space found, return -1 to indicate no good boundary
    return -1;
  }

  /**
   * Get smart overlap that preserves word boundaries and context
   */
  private getSmartOverlap(chunk: string, overlapSize: number): string {
    if (chunk.length <= overlapSize) {
      return chunk;
    }

    // Try to find a good word boundary for overlap
    const overlapStart = Math.max(0, chunk.length - overlapSize);
    const wordBoundaryIndex = chunk.lastIndexOf(
      ' ',
      overlapStart + overlapSize * 0.5,
    );

    if (wordBoundaryIndex > overlapStart) {
      return chunk.substring(wordBoundaryIndex + 1).trim();
    }

    // Fallback to character-based overlap
    return chunk.slice(-overlapSize).trim();
  }

  private characterSplit(
    text: string,
    chunkSize: number,
    chunkOverlap: number,
  ): string[] {
    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      chunks.push(text.slice(start, end));
      start = end - chunkOverlap;

      if (start >= end) break;
    }

    return chunks;
  }

  private tokenSplit(
    text: string,
    chunkSize: number,
    chunkOverlap: number,
  ): string[] {
    // Enhanced token-based splitting with better size utilization
    const words = text.split(/\s+/).filter((word) => word.length > 0);
    const chunks: string[] = [];
    let currentChunk: string[] = [];
    let currentTokenCount = 0;

    for (const word of words) {
      // Estimate tokens for this word (rough approximation: 1 token per 4 characters)
      const wordTokens = Math.ceil(word.length / 4);

      // Check if adding this word would exceed the chunk size
      if (
        currentTokenCount + wordTokens > chunkSize &&
        currentChunk.length > 0
      ) {
        // Save current chunk
        const chunkText = currentChunk.join(' ');
        chunks.push(chunkText);
        this.logger.debug(
          `Created token chunk ${chunks.length}: ${currentTokenCount} tokens, ${chunkText.length} chars`,
        );

        // Handle overlap
        if (chunkOverlap > 0) {
          const overlapTokens = Math.min(chunkOverlap, currentTokenCount);
          const overlapWords = Math.ceil(overlapTokens * 4); // Convert back to approximate word count
          currentChunk = currentChunk.slice(-overlapWords);
          currentTokenCount = currentChunk.reduce(
            (sum, w) => sum + Math.ceil(w.length / 4),
            0,
          );
        } else {
          currentChunk = [];
          currentTokenCount = 0;
        }
      }

      currentChunk.push(word);
      currentTokenCount += wordTokens;
    }

    // Add remaining chunk
    if (currentChunk.length > 0) {
      chunks.push(currentChunk.join(' '));
      this.logger.debug(
        `Created final token chunk: ${currentTokenCount} tokens, ${currentChunk.join(' ').length} chars`,
      );
    }

    this.logger.log(
      `Token split created ${chunks.length} chunks with avg token count: ${chunks.reduce((sum, chunk) => sum + Math.ceil(chunk.length / 4), 0) / chunks.length}`,
    );
    return chunks;
  }

  private markdownSplit(
    text: string,
    chunkSize: number,
    chunkOverlap: number,
  ): string[] {
    // Split by markdown sections (headers)
    const sections = text.split(/(?=^#{1,6}\s)/m);
    const chunks: string[] = [];

    for (const section of sections) {
      if (section.length <= chunkSize) {
        chunks.push(section);
      } else {
        // If section is too large, split it further
        const subChunks = this.characterSplit(section, chunkSize, chunkOverlap);
        chunks.push(...subChunks);
      }
    }

    return chunks;
  }

  private pythonCodeSplit(
    text: string,
    chunkSize: number,
    chunkOverlap: number,
  ): string[] {
    // Split by Python code blocks (functions, classes)
    const codeBlocks = text.split(
      /(?=^(?:def |class |if __name__|import |from ))/m,
    );
    const chunks: string[] = [];

    for (const block of codeBlocks) {
      if (block.length <= chunkSize) {
        chunks.push(block);
      } else {
        // If block is too large, split it further
        const subChunks = this.characterSplit(block, chunkSize, chunkOverlap);
        chunks.push(...subChunks);
      }
    }

    return chunks;
  }

  private sentenceSplit(
    text: string,
    chunkSize: number,
    chunkOverlap: number,
  ): string[] {
    // Enhanced sentence-aware splitting that preserves semantic meaning
    const chunks: string[] = [];

    // Split by sentence boundaries with better regex
    const sentences = text
      .split(/(?<=[.!?])\s+/)
      .filter((s) => s.trim().length > 0);

    let currentChunk = '';
    let currentLength = 0;

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i].trim();
      const sentenceLength = sentence.length;

      // Check if adding this sentence would exceed chunk size
      if (
        currentLength + sentenceLength + (currentChunk ? 1 : 0) > chunkSize &&
        currentChunk.length > 0
      ) {
        // Save current chunk
        chunks.push(currentChunk.trim());
        this.logger.debug(
          `Created sentence chunk ${chunks.length}: ${currentChunk.length} chars`,
        );

        // Start new chunk with smart overlap
        if (chunkOverlap > 0) {
          const overlapText = this.getSentenceOverlap(
            currentChunk,
            chunkOverlap,
          );
          currentChunk = overlapText + (overlapText ? ' ' : '') + sentence;
          currentLength = currentChunk.length;
        } else {
          currentChunk = sentence;
          currentLength = sentenceLength;
        }
      } else {
        // Add sentence to current chunk
        currentChunk += (currentChunk ? ' ' : '') + sentence;
        currentLength = currentChunk.length;
      }
    }

    // Add remaining text as final chunk
    if (currentChunk.trim().length > 0) {
      chunks.push(currentChunk.trim());
      this.logger.debug(
        `Created final sentence chunk: ${currentChunk.length} chars`,
      );
    }

    this.logger.log(
      `Sentence split created ${chunks.length} chunks with avg size: ${Math.round(chunks.reduce((sum, chunk) => sum + chunk.length, 0) / chunks.length)} (target: ${chunkSize})`,
    );
    return chunks;
  }

  /**
   * Get sentence-aware overlap that preserves complete sentences when possible
   */
  private getSentenceOverlap(chunk: string, overlapSize: number): string {
    if (chunk.length <= overlapSize) {
      return chunk;
    }

    // Try to find complete sentences for overlap
    const sentences = chunk
      .split(/(?<=[.!?])\s+/)
      .filter((s) => s.trim().length > 0);
    let overlapText = '';

    // Add sentences from the end until we reach the overlap size
    for (let i = sentences.length - 1; i >= 0; i--) {
      const sentence = sentences[i].trim();
      const potentialOverlap =
        sentence + (overlapText ? ' ' : '') + overlapText;

      if (potentialOverlap.length <= overlapSize * 1.2) {
        // Allow 20% tolerance
        overlapText = potentialOverlap;
      } else {
        break;
      }
    }

    // If no complete sentences fit, fall back to word-based overlap
    if (!overlapText) {
      return this.getSmartOverlap(chunk, overlapSize);
    }

    return overlapText;
  }

  /**
   * Smart chunking that combines sentence-aware and word-boundary detection
   * This is the recommended chunking strategy for most use cases
   */
  private smartChunking(
    text: string,
    chunkSize: number,
    chunkOverlap: number,
  ): string[] {
    const chunks: string[] = [];

    // First, try to split by paragraphs
    const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);

    for (const paragraph of paragraphs) {
      if (paragraph.length <= chunkSize) {
        // Paragraph fits in one chunk
        chunks.push(paragraph.trim());
        this.logger.debug(`Created paragraph chunk: ${paragraph.length} chars`);
      } else {
        // Paragraph is too long, split by sentences
        const sentenceChunks = this.smartSentenceChunking(
          paragraph,
          chunkSize,
          chunkOverlap,
        );
        chunks.push(...sentenceChunks);
      }
    }

    // Post-process to merge tiny chunks and ensure smooth transitions
    const processedChunks = this.postProcessChunks(
      chunks,
      chunkSize,
      chunkOverlap,
    );

    this.logger.log(
      `Smart chunking created ${processedChunks.length} chunks with avg size: ${Math.round(processedChunks.reduce((sum, chunk) => sum + chunk.length, 0) / processedChunks.length)} (target: ${chunkSize})`,
    );
    return processedChunks;
  }

  /**
   * Smart sentence-based chunking with word boundary awareness
   */
  private smartSentenceChunking(
    text: string,
    chunkSize: number,
    chunkOverlap: number,
  ): string[] {
    const chunks: string[] = [];

    // Split by sentences with better boundary detection
    const sentences = text
      .split(/(?<=[.!?])\s+/)
      .filter((s) => s.trim().length > 0);

    let currentChunk = '';
    let currentLength = 0;

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i].trim();
      const sentenceLength = sentence.length;

      // Check if adding this sentence would exceed chunk size
      if (
        currentLength + sentenceLength + (currentChunk ? 1 : 0) > chunkSize &&
        currentChunk.length > 0
      ) {
        // Save current chunk
        chunks.push(currentChunk.trim());
        this.logger.debug(
          `Created smart sentence chunk ${chunks.length}: ${currentChunk.length} chars`,
        );

        // Start new chunk with smart overlap
        if (chunkOverlap > 0) {
          const overlapText = this.getSmartSentenceOverlap(
            currentChunk,
            chunkOverlap,
          );
          currentChunk = overlapText + (overlapText ? ' ' : '') + sentence;
          currentLength = currentChunk.length;
        } else {
          currentChunk = sentence;
          currentLength = sentenceLength;
        }
      } else {
        // Add sentence to current chunk
        currentChunk += (currentChunk ? ' ' : '') + sentence;
        currentLength = currentChunk.length;
      }
    }

    // Add remaining text as final chunk
    if (currentChunk.trim().length > 0) {
      chunks.push(currentChunk.trim());
      this.logger.debug(
        `Created final smart sentence chunk: ${currentChunk.length} chars`,
      );
    }

    return chunks;
  }

  /**
   * Get smart sentence overlap that preserves context
   */
  private getSmartSentenceOverlap(chunk: string, overlapSize: number): string {
    if (chunk.length <= overlapSize) {
      return chunk;
    }

    // Try to find complete sentences for overlap
    const sentences = chunk
      .split(/(?<=[.!?])\s+/)
      .filter((s) => s.trim().length > 0);
    let overlapText = '';

    // Add sentences from the end until we reach the overlap size
    for (let i = sentences.length - 1; i >= 0; i--) {
      const sentence = sentences[i].trim();
      const potentialOverlap =
        sentence + (overlapText ? ' ' : '') + overlapText;

      if (potentialOverlap.length <= overlapSize * 1.3) {
        // Allow 30% tolerance for better context
        overlapText = potentialOverlap;
      } else {
        break;
      }
    }

    // If no complete sentences fit, try word-based overlap
    if (!overlapText) {
      return this.getSmartOverlap(chunk, overlapSize);
    }

    return overlapText;
  }

  /**
   * Post-process chunks to merge tiny ones and ensure smooth transitions
   */
  private postProcessChunks(
    chunks: string[],
    targetChunkSize: number,
    _overlapSize: number, // eslint-disable-line @typescript-eslint/no-unused-vars
  ): string[] {
    if (chunks.length <= 1) {
      return chunks;
    }

    const processedChunks: string[] = [];
    const minChunkSize = Math.max(50, targetChunkSize * 0.1); // Minimum 10% of target size or 50 chars

    for (let i = 0; i < chunks.length; i++) {
      const currentChunk = chunks[i].trim();

      if (currentChunk.length < minChunkSize && i < chunks.length - 1) {
        // Merge with next chunk if current is too small
        const nextChunk = chunks[i + 1].trim();
        const mergedChunk = currentChunk + ' ' + nextChunk;

        if (mergedChunk.length <= targetChunkSize * 1.2) {
          // Allow 20% over target
          processedChunks.push(mergedChunk);
          i++; // Skip next chunk as it's been merged
          this.logger.debug(
            `Merged tiny chunk (${currentChunk.length} chars) with next chunk`,
          );
        } else {
          processedChunks.push(currentChunk);
        }
      } else {
        processedChunks.push(currentChunk);
      }
    }

    return processedChunks;
  }

  // This would be implemented with actual embedding services like DashScope, Hugging Face, etc.
  private async generateEmbedding(
    text: string,
    config: EmbeddingConfig,
  ): Promise<{ embedding: number[]; model: string; dimensions: number }> {
    this.logger.log(`Generating embedding for text using ${config.model}`);

    // Convert provider string to enum
    const provider = config.provider as EmbeddingProvider;

    return this.embeddingService.generateEmbedding(
      text,
      config.model as EmbeddingModel,
      provider,
      config.customModelName,
    );
  }

  private generateEmbeddingHash(text: string, model: string): string {
    return crypto
      .createHash('sha256')
      .update(text + model)
      .digest('hex');
  }

  /**
   * Extract keywords from text content using TF-IDF and other NLP techniques
   * Supports both English and Chinese text, with optional LLM-based entity extraction
   */
  private async extractKeywords(
    content: string,
    useLLMExtraction: boolean = false,
  ): Promise<string[]> {
    try {
      // Detect if content is primarily Chinese
      const isChinese =
        this.chineseTextPreprocessorService.isChineseText(content);

      // Use LLM-based entity extraction if requested and content is Chinese
      if (useLLMExtraction && isChinese) {
        return this.extractEntitiesWithLLM(content, true);
      }

      if (isChinese) {
        return this.extractChineseKeywords(content);
      } else {
        return this.extractEnglishKeywords(content);
      }
    } catch (error) {
      this.logger.error(`Keyword extraction failed: ${error.message}`);
      return [];
    }
  }

  /**
   * 🆕 Extract entities using LLM with text normalization
   */
  private async extractEntitiesWithLLM(
    content: string,
    enableCustomPatterns: boolean = false,
  ): Promise<string[]> {
    try {
      const config: EntityExtractionConfig = {
        method: 'llm',
        maxEntities: 8,
        enablePerformanceLogging: true,
        enableTextNormalization: true, // Always normalize text
        // Add custom patterns only if needed for specific use cases
        customPatterns: enableCustomPatterns
          ? [
              // Add domain-specific patterns only when explicitly requested
              {
                pattern: /第\d+(?:\([^)]+\))*條/g,
                type: 'LEGAL_REF',
                maxLength: 20,
              },
            ]
          : undefined,
      };

      const result = await this.entityExtractionService.extractEntities(
        content,
        config,
      );

      return result.entities;
    } catch (error) {
      this.logger.error(`LLM entity extraction failed: ${error.message}`);
      this.logger.warn(
        `LLM entity extraction failed, falling back to n-gram: ${error.message}`,
      );
      // Fallback to traditional Chinese keyword extraction
      return this.extractChineseKeywords(content);
    }
  }

  /**
   * Extract keywords from Chinese text
   */
  private extractChineseKeywords(content: string): string[] {
    try {
      // Clean Chinese text - remove punctuation but preserve Chinese characters
      const cleanText = content
        .replace(/[，。；：！？、（）【】《》〈〉「」『』""'']/g, ' ') // Chinese punctuation
        .replace(/[^\u4e00-\u9fff\w\s]/g, ' ') // Keep Chinese chars, alphanumeric, whitespace
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();

      // Chinese stop words (common function words)
      const chineseStopWords = new Set([
        '的',
        '是',
        '在',
        '有',
        '和',
        '或',
        '但',
        '於',
        '以',
        '及',
        '與',
        '等',
        '如',
        '若',
        '而',
        '則',
        '亦',
        '即',
        '乃',
        '其',
        '此',
        '該',
        '這',
        '那',
        '些',
        '各',
        '每',
        '所',
        '不',
        '沒',
        '無',
        '非',
        '未',
        '否',
        '也',
        '都',
        '又',
        '還',
        '就',
        '只',
        '才',
        '已',
        '很',
        '最',
        '更',
        '太',
        '十分',
        '非常',
        '相當',
        '比較',
        '特別',
        '尤其',
        '特殊',
        '一般',
        '通常',
        '經常',
        '往往',
        '總是',
        '從來',
        '一直',
        '始終',
        '到底',
        '究竟',
        '什麼',
        '怎麼',
        '為什麼',
        '哪裡',
        '何時',
        '如何',
        '多少',
        '幾個',
        '哪些',
        '誰',
        '我',
        '你',
        '他',
        '她',
        '它',
        '我們',
        '你們',
        '他們',
        '她們',
        '它們',
        '自己',
        '上',
        '下',
        '前',
        '後',
        '裡',
        '外',
        '內',
        '中',
        '間',
        '旁',
        '邊',
        '側',
        '左',
        '右',
        '可以',
        '能夠',
        '應該',
        '必須',
        '需要',
        '想要',
        '希望',
        '願意',
        '打算',
        '決定',
      ]);

      // For Chinese text, we need to segment into meaningful units
      // Since we don't have a Chinese word segmenter, we'll use character n-grams and common patterns
      const keywords: { [key: string]: number } = {};

      // Extract 2-4 character Chinese terms (most meaningful Chinese terms are 2-4 characters)
      for (let len = 2; len <= 4; len++) {
        for (let i = 0; i <= cleanText.length - len; i++) {
          const term = cleanText.substring(i, i + len);

          // Only Chinese characters, minimum meaningful length
          if (
            /^[\u4e00-\u9fff]+$/.test(term) &&
            !chineseStopWords.has(term) &&
            term.length >= 2
          ) {
            keywords[term] = (keywords[term] || 0) + 1;
          }
        }
      }

      // Also extract mixed Chinese-English terms (like "PDF文件", "API接口")
      const mixedTerms =
        cleanText.match(
          /[\u4e00-\u9fff]+[a-zA-Z]+|[a-zA-Z]+[\u4e00-\u9fff]+/g,
        ) || [];
      mixedTerms.forEach((term) => {
        if (term.length >= 2 && term.length <= 10) {
          keywords[term] = (keywords[term] || 0) + 1;
        }
      });

      // Sort by frequency and return top keywords
      const sortedKeywords = Object.entries(keywords)
        .filter(([, freq]) => freq >= 1) // Minimum frequency
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([keyword]) => keyword);

      return sortedKeywords;
    } catch (error) {
      this.logger.error('Chinese keyword extraction failed:', error);
      return [];
    }
  }

  /**
   * Extract keywords from English text (original logic)
   */
  private extractEnglishKeywords(content: string): string[] {
    try {
      // Clean and tokenize the text
      const cleanText = content
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ') // Remove punctuation
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();

      // Tokenize
      const tokenizer = new natural.WordTokenizer();
      const tokens = tokenizer.tokenize(cleanText) || [];

      // English stop words
      const englishStopWords = new Set([
        'the',
        'a',
        'an',
        'and',
        'or',
        'but',
        'in',
        'on',
        'at',
        'to',
        'for',
        'of',
        'with',
        'by',
        'is',
        'are',
        'was',
        'were',
        'be',
        'been',
        'being',
        'have',
        'has',
        'had',
        'do',
        'does',
        'did',
        'will',
        'would',
        'could',
        'should',
        'may',
        'might',
        'must',
        'can',
        'this',
        'that',
        'these',
        'those',
        'i',
        'you',
        'he',
        'she',
        'it',
        'we',
        'they',
        'me',
        'him',
        'her',
        'us',
        'them',
        'my',
        'your',
        'his',
        'her',
        'its',
        'our',
        'their',
        'mine',
        'yours',
        'hers',
        'ours',
        'theirs',
        'not',
        'no',
        'yes',
        'from',
        'up',
        'about',
        'into',
        'over',
        'after',
        'before',
        'during',
        'between',
        'among',
        'through',
        'against',
        'above',
        'below',
        'down',
        'out',
        'off',
        'under',
        'again',
        'further',
        'then',
        'once',
        'here',
        'there',
        'when',
        'where',
        'why',
        'how',
        'all',
        'any',
        'both',
        'each',
        'few',
        'more',
        'most',
        'other',
        'some',
        'such',
        'only',
        'own',
        'same',
        'so',
        'than',
        'too',
        'very',
        'just',
        'now',
        'also',
        'however',
        'therefore',
        'thus',
        'hence',
        'moreover',
        'furthermore',
      ]);

      const filteredTokens = tokens.filter(
        (token) =>
          token.length > 2 && // Minimum length
          token.length < 20 && // Maximum length
          !englishStopWords.has(token) &&
          /^[a-zA-Z]+$/.test(token), // Only English alphabetic characters
      );

      // Calculate word frequency
      const wordFreq: { [key: string]: number } = {};
      filteredTokens.forEach((token) => {
        wordFreq[token] = (wordFreq[token] || 0) + 1;
      });

      // Sort by frequency and get top keywords
      const sortedWords = Object.entries(wordFreq)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10) // Top 10 keywords
        .map(([word]) => word);

      // Apply stemming for English
      try {
        const stemmer = natural.PorterStemmer;
        const stemmedKeywords = sortedWords.map((word) => stemmer.stem(word));
        const allKeywords = [...new Set([...sortedWords, ...stemmedKeywords])];

        return allKeywords.slice(0, 8);
      } catch {
        this.logger.warn(
          'POS tagging failed, using frequency-based keywords only',
        );
        return sortedWords.slice(0, 8);
      }
    } catch (error) {
      this.logger.error('English keyword extraction failed:', error);
      return [];
    }
  }

  // 🆕 Parent-Child Chunking Processing Method
  private async processWithParentChildChunking(
    document: Document,
    datasetId: string,
    embeddingConfig: EmbeddingConfig,
    userId: string,
    content?: string,
  ): Promise<DocumentSegment[]> {
    this.logger.log(
      `🔗 [PARENT_CHILD_CHUNKING] Starting parent-child chunking for document ${document.id}`,
    );

    let parentRagflowSegments: any[] = [];
    let childRagflowSegments: any[] = [];

    if (document.docType === 'pdf') {
      // Parse PDF with optimized configuration for embeddings
      const parseOptions: RagflowParseOptions = {
        maxSegmentLength: embeddingConfig.chunkSize,
        minSegmentLength: Math.floor(embeddingConfig.chunkSize * 0.1),
        overlapRatio: embeddingConfig.chunkOverlap / embeddingConfig.chunkSize,
        confidenceThreshold: 0.7,
        enableTableExtraction: true,
      };

      const filePath = join(
        process.cwd(),
        'uploads',
        'documents',
        document.fileId,
      );

      const ragflowResult = await this.ragflowPdfParserService.parsePdf(
        filePath,
        parseOptions,
      );

      // Separate parent and child segments
      parentRagflowSegments = ragflowResult.segments.filter((s) => !s.parentId);
      childRagflowSegments = ragflowResult.segments.filter((s) => s.parentId);
    } else {
      // For non-PDF documents, create parent-child chunks from text content
      if (!content) {
        throw new Error(
          'Content is required for non-PDF parent-child chunking',
        );
      }

      // Create parent chunks (larger) - but still respect size constraints
      const parentChunkSize = Math.min(embeddingConfig.chunkSize * 2, 1200); // Cap at 1200 chars
      const parentChunkOverlap = Math.min(
        embeddingConfig.chunkOverlap * 2,
        120,
      ); // Cap at 120 chars
      const parentChunks = this.splitText(content, {
        ...embeddingConfig,
        chunkSize: parentChunkSize,
        chunkOverlap: parentChunkOverlap,
      });

      // Create child chunks (original size)
      const childChunks = this.splitText(content, embeddingConfig);

      // Convert to ragflow-like segments
      parentRagflowSegments = parentChunks.map((chunk, index) => ({
        id: `parent_${index}`,
        content: chunk,
        wordCount: chunk.split(/\s+/).length,
        tokenCount: Math.ceil(chunk.length / 4),
        parentId: null,
        segmentType: 'parent',
        hierarchyLevel: 1,
        childOrder: index,
        childCount: 0,
        hierarchyMetadata: {},
      }));

      childRagflowSegments = childChunks.map((chunk, index) => ({
        id: `child_${index}`,
        content: chunk,
        wordCount: chunk.split(/\s+/).length,
        tokenCount: Math.ceil(chunk.length / 4),
        parentId: `parent_${Math.floor(index / 2)}`, // Link to parent chunks
        segmentType: 'child',
        hierarchyLevel: 2,
        childOrder: index,
        childCount: 0,
        hierarchyMetadata: {},
      }));
    }

    this.logger.log(
      `🔗 [PARENT_CHILD_CHUNKING] Found ${parentRagflowSegments.length} parent segments and ${childRagflowSegments.length} child segments`,
    );

    const segments: DocumentSegment[] = [];
    const parentIdMapping = new Map<string, string>(); // Map ragflow parent ID to database parent ID

    // 1. First, save all parent segments
    for (let i = 0; i < parentRagflowSegments.length; i++) {
      const ragflowSegment = parentRagflowSegments[i];

      this.logger.log(
        `📄 [PARENT_SEGMENT_${i + 1}] Processing segment: "${ragflowSegment.content.substring(0, 100)}..."`,
      );

      // Use LLM-based entity extraction for better Chinese keyword extraction
      const keywords = await this.extractKeywords(ragflowSegment.content, true);
      const keywordsObject = {
        extracted: keywords,
        count: keywords.length,
        extractedAt: new Date().toISOString(),
      };

      this.logger.log(
        `📄 [PARENT_SEGMENT_${i + 1}] ✅ Keywords extracted: [${keywords.join(', ')}]`,
      );

      const segment = this.segmentRepository.create({
        documentId: document.id,
        datasetId: datasetId,
        position: i + 1,
        content: ragflowSegment.content,
        wordCount: ragflowSegment.wordCount,
        tokens: ragflowSegment.tokenCount,
        keywords: keywordsObject,
        status: 'waiting',
        enabled: true,
        userId: userId,
        // Parent segments don't have parentId
        parentId: undefined,
        segmentType: ragflowSegment.segmentType || 'parent',
        hierarchyLevel: ragflowSegment.hierarchyLevel || 1,
        childOrder: ragflowSegment.childOrder,
        childCount: ragflowSegment.childCount || 0,
        hierarchyMetadata: ragflowSegment.hierarchyMetadata || {},
      });

      const savedSegment = await this.segmentRepository.save(segment);
      segments.push(savedSegment);

      // Map the ragflow parent ID to the database parent ID
      parentIdMapping.set(ragflowSegment.id, savedSegment.id);
    }

    // 2. Then, save all child segments with proper parent references
    for (let i = 0; i < childRagflowSegments.length; i++) {
      const ragflowSegment = childRagflowSegments[i];

      // Use LLM-based entity extraction for better Chinese keyword extraction
      const keywords = await this.extractKeywords(ragflowSegment.content, true);
      const keywordsObject = {
        extracted: keywords,
        count: keywords.length,
        extractedAt: new Date().toISOString(),
      };

      // Map the ragflow parent ID to the actual database parent ID
      const actualParentId = parentIdMapping.get(ragflowSegment.parentId);

      if (!actualParentId) {
        this.logger.warn(
          `Child segment ${ragflowSegment.id} references unknown parent ${ragflowSegment.parentId}. Skipping.`,
        );
        continue;
      }

      const segment = this.segmentRepository.create({
        documentId: document.id,
        datasetId: datasetId,
        position: parentRagflowSegments.length + i + 1, // Position after parents
        content: ragflowSegment.content,
        wordCount: ragflowSegment.wordCount,
        tokens: ragflowSegment.tokenCount,
        keywords: keywordsObject,
        status: 'waiting',
        enabled: true,
        userId: userId,
        // Map to actual database parent ID
        parentId: actualParentId,
        segmentType: ragflowSegment.segmentType || 'child',
        hierarchyLevel: ragflowSegment.hierarchyLevel || 2,
        childOrder: ragflowSegment.childOrder,
        childCount: ragflowSegment.childCount || 0,
        hierarchyMetadata: ragflowSegment.hierarchyMetadata || {},
      });

      const savedSegment = await this.segmentRepository.save(segment);
      segments.push(savedSegment);
    }

    return segments;
  }

  // 🆕 Traditional Chunking Processing Method (extracted from original logic)
  private async processWithTraditionalChunking(
    document: Document,
    datasetId: string,
    content: string,
    embeddingConfig: EmbeddingConfig,
    userId: string,
  ): Promise<DocumentSegment[]> {
    // Split text into chunks using the provided embedding configuration
    const chunks = this.splitText(content, embeddingConfig);
    this.logger.log(
      `Document ${document.id} split into ${chunks.length} chunks using ${embeddingConfig.textSplitter} splitter (size: ${embeddingConfig.chunkSize}, overlap: ${embeddingConfig.chunkOverlap})`,
    );

    // Post-process chunks to merge tiny final chunks
    const minChunkSize = Math.max(50, embeddingConfig.chunkSize * 0.1);
    const processedChunks = chunks.filter((chunk) => chunk.trim().length > 0);

    if (processedChunks.length > 1) {
      const lastChunk = processedChunks[processedChunks.length - 1];
      if (lastChunk.length < minChunkSize) {
        const secondLastChunk = processedChunks[processedChunks.length - 2];
        processedChunks[processedChunks.length - 2] =
          secondLastChunk + ' ' + lastChunk;
        processedChunks.pop();
        this.logger.log(
          `Merged tiny final chunk (${lastChunk.length} chars) with previous chunk`,
        );
      }
    }

    // Create document segments
    const segments: DocumentSegment[] = [];
    for (let i = 0; i < processedChunks.length; i++) {
      const chunkContent = processedChunks[i];

      this.logger.log(
        `📄 [CHUNK_${i + 1}] Processing chunk: "${chunkContent.substring(0, 100)}..."`,
      );

      // Extract keywords from the segment content using LLM-based entity extraction
      const keywords = await this.extractKeywords(chunkContent, true);
      const keywordsObject = {
        extracted: keywords,
        count: keywords.length,
        extractedAt: new Date().toISOString(),
      };

      this.logger.log(
        `📄 [CHUNK_${i + 1}] ✅ Keywords extracted: [${keywords.join(', ')}]`,
      );
      this.logger.debug(
        `Extracted ${keywords.length} keywords for segment ${i + 1}: ${keywords.join(', ')}`,
      );

      const segment = this.segmentRepository.create({
        documentId: document.id,
        datasetId: datasetId,
        position: i + 1,
        content: chunkContent,
        wordCount: chunkContent.split(/\s+/).filter((word) => word.length > 0)
          .length,
        tokens: this.estimateTokenCount(chunkContent), // Improved token estimation
        keywords: keywordsObject,
        status: 'waiting',
        enabled: true,
        userId: userId,
        // Traditional chunking uses default values for parent-child fields
        segmentType: 'chunk',
        hierarchyLevel: 1,
        childCount: 0,
        hierarchyMetadata: {},
      });

      const savedSegment = await this.segmentRepository.save(segment);
      segments.push(savedSegment);
    }

    return segments;
  }

  /**
   * Clean general text content (applies to all documents)
   * Removes excessive empty lines, fixes spacing issues, etc.
   */
  private cleanGeneralText(text: string): string {
    if (!text || text.trim().length === 0) {
      return '';
    }

    let cleaned = text;

    // Fix common PDF character encoding issues
    cleaned = this.fixPdfCharacterEncoding(cleaned);

    // 1. Remove the specific pattern of empty lines with just spaces and newlines
    cleaned = cleaned.replace(/^[ \t]*\n(?:[ \t]*\n)+/gm, '\n');

    // 2. Remove lines that contain only whitespace characters
    cleaned = cleaned.replace(/^[ \t\r\f\v]*$/gm, '');

    // 3. Remove excessive consecutive newlines (more than 2)
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

    // 4. Remove excessive spaces at the beginning of lines
    cleaned = cleaned.replace(/^[ \t]+/gm, '');

    // 5. Remove excessive spaces at the end of lines
    cleaned = cleaned.replace(/[ \t]+$/gm, '');

    // 6. Replace multiple consecutive spaces with single space
    cleaned = cleaned.replace(/[ \t]{2,}/g, ' ');

    // 7. Remove empty lines at the beginning of the text
    cleaned = cleaned.replace(/^[\s\n]*/, '');

    // 8. Remove empty lines at the end of the text
    cleaned = cleaned.replace(/[\s\n]*$/, '');

    // 9. Normalize line breaks (ensure consistent \n)
    cleaned = cleaned.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // 10. Final cleanup: remove any remaining lines with only spaces
    const lines = cleaned.split('\n');
    const filteredLines = lines.filter((line) => line.trim().length > 0);
    cleaned = filteredLines.join('\n');

    return cleaned.trim();
  }

  /**
   * Fix common PDF character encoding issues
   * These are typical problems from pdf-parse where ligatures and special characters get misinterpreted
   */
  private fixPdfCharacterEncoding(text: string): string {
    let fixed = text;

    // Common PDF ligature and encoding fixes
    const fixes = [
      // Ligature issues
      { pattern: /C([a-z])/g, replacement: 'fi$1' }, // "Cles" → "files"
      { pattern: /([a-z])C([a-z])/g, replacement: '$1fi$2' }, // "workClow" → "workflow"
      { pattern: /=([a-z])/g, replacement: 'ti$1' }, // "=on" → "tion"
      { pattern: /([a-z])=([a-z])/g, replacement: '$1ti$2' }, // "extrac=on" → "extraction"

      // Common word fixes based on context
      { pattern: /\bEn=ty\b/g, replacement: 'Entity' },
      { pattern: /\bExtrac=on\b/g, replacement: 'Extraction' },
      { pattern: /\bCiles?\b/g, replacement: 'Files' },
      { pattern: /\bworkClow\b/g, replacement: 'workflow' },
      { pattern: /\bDeCine\b/g, replacement: 'Define' },
      { pattern: /\bspeciCica=on\b/g, replacement: 'specification' },
      { pattern: /\bfunc=onali=es\b/g, replacement: 'functionalities' },
      { pattern: /\bmanagemen=\b/g, replacement: 'management' },
      { pattern: /\bdocumen=\b/g, replacement: 'document' },
      { pattern: /\brequiremen=s?\b/g, replacement: 'requirements' },
      { pattern: /\bintegra=on\b/g, replacement: 'integration' },
      { pattern: /\bauthen=ca=on\b/g, replacement: 'authentication' },
      { pattern: /\bimplementa=on\b/g, replacement: 'implementation' },
      { pattern: /\barchitecture\b/gi, replacement: 'architecture' },
      { pattern: /\bdeliverables?\b/gi, replacement: 'deliverables' },

      // Fix double replacements (in case we over-corrected)
      { pattern: /fifi/g, replacement: 'fi' },
      { pattern: /titi/g, replacement: 'ti' },

      // Additional common patterns
      { pattern: /\bwi=h\b/g, replacement: 'with' },
      { pattern: /\bsolu=on\b/g, replacement: 'solution' },
      { pattern: /\bposi=on\b/g, replacement: 'position' },
      { pattern: /\bac=on\b/g, replacement: 'action' },
      { pattern: /\bsec=on\b/g, replacement: 'section' },
      { pattern: /\bop=on\b/g, replacement: 'option' },
      { pattern: /\bcondi=on\b/g, replacement: 'condition' },
      { pattern: /\bna=on\b/g, replacement: 'nation' },
      { pattern: /\bmodica=ons?\b/g, replacement: 'modifications' },
      { pattern: /\bapplica=ons?\b/g, replacement: 'applications' },

      // Unicode normalization for special characters
      { pattern: /[\u2018\u2019]/g, replacement: "'" }, // Smart single quotes
      { pattern: /[\u201C\u201D]/g, replacement: '"' }, // Smart double quotes
      { pattern: /[\u2013\u2014]/g, replacement: '-' }, // En/em dashes
      { pattern: /\u2026/g, replacement: '...' }, // Ellipsis
      { pattern: /\u00A0/g, replacement: ' ' }, // Non-breaking space
    ];

    for (const fix of fixes) {
      fixed = fixed.replace(fix.pattern, fix.replacement);
    }

    return fixed;
  }

  /**
   * Pause document processing
   */
  async pauseDocumentProcessing(
    documentId: string,
  ): Promise<{ success: boolean; message: string }> {
    this.logger.log(`⏸️ Pausing document processing for ${documentId}`);

    try {
      // Get document
      const document = await this.documentRepository.findOne({
        where: { id: documentId },
        relations: ['dataset'],
      });

      if (!document) {
        throw new Error(`Document ${documentId} not found`);
      }

      // Check if document is in a pausable state
      if (document.indexingStatus === 'completed') {
        throw new Error(
          `Document ${documentId} is already completed and cannot be paused`,
        );
      }

      if (document.indexingStatus === 'waiting') {
        throw new Error(
          `Document ${documentId} is waiting to start and cannot be paused yet`,
        );
      }

      // Pause all active jobs for this document
      const jobs = await this.queueManager.getJobsByDocument(documentId);
      const activeJobs = jobs.filter(
        (job) => job.status === 'active' || job.status === 'waiting',
      );

      for (const job of activeJobs) {
        try {
          await this.queueManager.pauseJob(job.id);
        } catch (error) {
          this.logger.warn(`Failed to pause job ${job.id}: ${error.message}`);
        }
      }

      // Update document status
      await this.documentRepository.update(documentId, {
        indexingStatus: 'paused',
        pausedAt: new Date(),
      });

      // Send notification
      this.notificationService.sendDocumentProcessingUpdate(
        documentId,
        document.dataset.id,
        {
          status: 'paused',
          message: 'Document processing paused',
        },
      );

      this.logger.log(
        `✅ Successfully paused document processing for ${documentId}`,
      );
      return {
        success: true,
        message: `Document processing paused successfully`,
      };
    } catch (error) {
      this.logger.error(
        `❌ Failed to pause document processing: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Retry document processing from failed stage
   */
  async retryDocumentProcessing(
    documentId: string,
  ): Promise<{ success: boolean; message: string }> {
    this.logger.log(`🔄 Retrying document processing for ${documentId}`);

    try {
      // Get document
      const document = await this.documentRepository.findOne({
        where: { id: documentId },
        relations: ['dataset'],
      });

      if (!document) {
        throw new Error(`Document ${documentId} not found`);
      }

      // Check if document is in a retryable state
      if (!document.indexingStatus.includes('failed')) {
        throw new Error(
          `Document ${documentId} is not in a failed state and cannot be retried`,
        );
      }

      // Retry failed jobs
      const jobs = await this.queueManager.getJobsByDocument(documentId);
      const failedJobs = jobs.filter((job) => job.status === 'failed');

      for (const job of failedJobs) {
        try {
          await this.queueManager.retryJob(job.id);
        } catch (error) {
          this.logger.warn(`Failed to retry job ${job.id}: ${error.message}`);
        }
      }

      // Update document status
      await this.documentRepository.update(documentId, {
        indexingStatus: 'processing',
        error: undefined,
        stoppedAt: undefined,
        pausedAt: undefined,
      });

      // Send notification
      this.notificationService.sendDocumentProcessingUpdate(
        documentId,
        document.dataset.id,
        {
          status: 'processing',
          message: 'Document processing retried',
        },
      );

      this.logger.log(
        `✅ Successfully retried document processing for ${documentId}`,
      );
      return {
        success: true,
        message: `Document processing retried successfully`,
      };
    } catch (error) {
      this.logger.error(
        `❌ Failed to retry document processing: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Cancel all processing jobs for a document
   */
  async cancelAllProcessingJobs(
    documentId: string,
  ): Promise<{ success: boolean; message: string; cancelledCount: number }> {
    this.logger.log(
      `❌ Cancelling all processing jobs for document ${documentId}`,
    );

    try {
      // Get document
      const document = await this.documentRepository.findOne({
        where: { id: documentId },
        relations: ['dataset'],
      });

      if (!document) {
        throw new Error(`Document ${documentId} not found`);
      }

      // Cancel all jobs for this document
      const cancelledCount =
        await this.queueManager.cancelJobsByDocument(documentId);

      // Update document status
      await this.documentRepository.update(documentId, {
        indexingStatus: 'cancelled',
        stoppedAt: new Date(),
        error: 'Processing cancelled by user',
      });

      // Send notification
      this.notificationService.sendDocumentProcessingUpdate(
        documentId,
        document.dataset.id,
        {
          status: 'cancelled',
          message: 'Document processing cancelled',
        },
      );

      this.logger.log(
        `✅ Successfully cancelled ${cancelledCount} jobs for document ${documentId}`,
      );
      return {
        success: true,
        message: `Successfully cancelled ${cancelledCount} processing jobs`,
        cancelledCount,
      };
    } catch (error) {
      this.logger.error(
        `❌ Failed to cancel document processing: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Get detailed job status for a document
   */
  async getDocumentJobStatus(documentId: string): Promise<{
    documentId: string;
    currentStage: string;
    overallStatus: string;
    stageProgress: {
      [stage: string]: { current: number; total: number; percentage: number };
    };
    activeJobIds: string[];
    jobs: JobDetails[];
    lastError: { stage: string; message: string; timestamp: Date } | null;
    processingMetadata: any;
  }> {
    this.logger.log(`📊 Getting job status for document ${documentId}`);

    try {
      // Get document
      const document = await this.documentRepository.findOne({
        where: { id: documentId },
        relations: ['dataset'],
      });

      if (!document) {
        throw new Error(`Document ${documentId} not found`);
      }

      // Get all jobs for this document
      const jobs = await this.queueManager.getJobsByDocument(documentId);

      // Calculate stage progress
      const stageProgress: {
        [stage: string]: { current: number; total: number; percentage: number };
      } = {};

      if (document.processingMetadata) {
        const metadata = document.processingMetadata;

        // Chunking progress
        if (metadata.chunking) {
          stageProgress.chunking = {
            current: metadata.chunking.segmentCount || 0,
            total: metadata.chunking.segmentCount || 0,
            percentage: 100,
          };
        }

        // Embedding progress
        if (metadata.embedding) {
          const total = metadata.embedding.totalCount || 0;
          const current = metadata.embedding.processedCount || 0;
          stageProgress.embedding = {
            current,
            total,
            percentage: total > 0 ? Math.round((current / total) * 100) : 0,
          };
        }

        // NER progress
        if (metadata.ner) {
          const total = metadata.ner.totalCount || 0;
          const current = metadata.ner.processedCount || 0;
          stageProgress.ner = {
            current,
            total,
            percentage: total > 0 ? Math.round((current / total) * 100) : 0,
          };
        }
      }

      return {
        documentId,
        currentStage: document.processingMetadata?.currentStage || 'unknown',
        overallStatus: document.indexingStatus,
        stageProgress,
        activeJobIds: document.activeJobIds || [],
        jobs,
        lastError: document.lastError,
        processingMetadata: document.processingMetadata,
      };
    } catch (error) {
      this.logger.error(`❌ Failed to get job status: ${error.message}`);
      throw error;
    }
  }
}
