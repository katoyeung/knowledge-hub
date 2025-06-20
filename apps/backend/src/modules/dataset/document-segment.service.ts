import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, IsNull, In } from 'typeorm';
import { TypeOrmCrudService } from '@dataui/crud-typeorm';
import { DocumentSegment } from './entities/document-segment.entity';
import { Document } from './entities/document.entity';
import { Embedding } from './entities/embedding.entity';
import { EmbeddingService } from './services/embedding.service';
import { UpdateDocumentSegmentDto } from './dto/update-document-segment.dto';
import * as crypto from 'crypto';
import { DataSource } from 'typeorm';

@Injectable()
export class DocumentSegmentService extends TypeOrmCrudService<DocumentSegment> {
  private readonly logger = new Logger(DocumentSegmentService.name);

  constructor(
    @InjectRepository(DocumentSegment)
    private readonly segmentRepository: Repository<DocumentSegment>,
    @InjectRepository(Document)
    private readonly documentRepository: Repository<Document>,
    @InjectRepository(Embedding)
    private readonly embeddingRepository: Repository<Embedding>,
    private readonly embeddingService: EmbeddingService,
    private readonly dataSource: DataSource,
  ) {
    super(segmentRepository);
  }

  async findByDocumentId(documentId: string): Promise<DocumentSegment[]> {
    return this.segmentRepository.find({
      where: { documentId },
      relations: ['document', 'dataset', 'user'],
      order: { position: 'ASC' },
    });
  }

  async findByDatasetId(datasetId: string): Promise<DocumentSegment[]> {
    return this.segmentRepository.find({
      where: { datasetId },
      relations: ['document', 'dataset', 'user'],
      order: { position: 'ASC' },
    });
  }

  async toggleStatus(id: string): Promise<DocumentSegment> {
    const segment = await this.segmentRepository.findOne({
      where: { id },
    });

    if (!segment) {
      throw new NotFoundException(`Document segment with ID ${id} not found`);
    }

    segment.enabled = !segment.enabled;

    if (!segment.enabled) {
      segment.disabledAt = new Date();
    } else {
      segment.disabledAt = undefined as any;
    }

    return this.segmentRepository.save(segment);
  }

  async getSegmentsByStatus(status: string): Promise<DocumentSegment[]> {
    return this.segmentRepository.find({
      where: { status },
      relations: ['document', 'dataset', 'user'],
      order: { createdAt: 'DESC' },
    });
  }

  async updateSegmentStatus(
    id: string,
    status: string,
  ): Promise<DocumentSegment> {
    const segment = await this.segmentRepository.findOne({
      where: { id },
    });

    if (!segment) {
      throw new NotFoundException(`Document segment with ID ${id} not found`);
    }

    segment.status = status;

    if (status === 'completed') {
      segment.completedAt = new Date();
    }

    return this.segmentRepository.save(segment);
  }

  // Custom update method that handles embedding regeneration
  async updateSegmentWithEmbedding(
    id: string,
    updateData: UpdateDocumentSegmentDto,
  ): Promise<DocumentSegment> {
    this.logger.log(`🔄 Updating segment ${id}`);

    // Get the current segment
    const currentSegment = await this.segmentRepository.findOne({
      where: { id },
      relations: ['document', 'embedding'],
    });

    if (!currentSegment) {
      throw new NotFoundException(`Document segment with ID ${id} not found`);
    }

    // Check if content has changed
    const contentChanged =
      updateData.content && updateData.content !== currentSegment.content;

    this.logger.log(`📝 Content changed: ${contentChanged}`);

    // Update the segment
    await this.segmentRepository.update(id, updateData);

    // Get the updated segment
    const updatedSegment = await this.segmentRepository.findOne({
      where: { id },
      relations: ['document', 'embedding'],
    });

    if (!updatedSegment) {
      throw new NotFoundException(`Updated segment not found`);
    }

    // If content changed and we have an embedding model, regenerate the embedding
    if (contentChanged && updatedSegment.document?.embeddingModel) {
      this.logger.log(
        `🔄 Content changed, regenerating embedding for segment ${id}`,
      );

      try {
        // Generate new embedding - cast to EmbeddingModel enum
        const embeddingResult = await this.embeddingService.generateEmbedding(
          updatedSegment.content,
          updatedSegment.document.embeddingModel as any,
        );

        // If segment already has an embedding, update it; otherwise create new one
        if (updatedSegment.embeddingId && updatedSegment.embedding) {
          // Update existing embedding
          await this.embeddingRepository.update(updatedSegment.embeddingId, {
            embedding: embeddingResult.embedding,
            hash: this.generateEmbeddingHash(
              updatedSegment.content,
              updatedSegment.document.embeddingModel,
            ),
            modelName: embeddingResult.model,
          });
          this.logger.log(`✅ Updated existing embedding for segment ${id}`);
        } else {
          // Create new embedding
          const embedding = this.embeddingRepository.create({
            modelName: embeddingResult.model,
            hash: this.generateEmbeddingHash(
              updatedSegment.content,
              updatedSegment.document.embeddingModel,
            ),
            embedding: embeddingResult.embedding,
            providerName: this.getProviderName(
              updatedSegment.document.embeddingModel,
            ),
          });

          const savedEmbedding = await this.embeddingRepository.save(embedding);

          // Update segment with new embedding reference
          await this.segmentRepository.update(id, {
            embeddingId: savedEmbedding.id,
          });

          this.logger.log(`✅ Created new embedding for segment ${id}`);
        }
      } catch (error) {
        this.logger.error(
          `❌ Failed to regenerate embedding for segment ${id}: ${error.message}`,
        );
        // Don't throw error - segment update should still succeed even if embedding fails
      }
    }

    // Return the final updated segment with relations
    const finalSegment = await this.segmentRepository.findOne({
      where: { id },
      relations: ['document', 'dataset', 'user', 'embedding'],
    });

    if (!finalSegment) {
      throw new NotFoundException(`Updated segment not found`);
    }

    return finalSegment;
  }

  private generateEmbeddingHash(content: string, modelName: string): string {
    return crypto
      .createHash('sha256')
      .update(content + modelName)
      .digest('hex');
  }

  private getProviderName(model: string): string {
    // Map model names to provider names
    if (model.includes('openai')) return 'openai';
    if (model.includes('huggingface')) return 'huggingface';
    if (model.includes('mixedbread')) return 'mixedbread';
    if (model.includes('xenova')) return 'xenova';
    if (model.includes('whereisai')) return 'whereisai';
    return 'unknown';
  }

  async searchSimilarSegments(
    documentId: string,
    queryEmbedding: number[],
    limit: number = 10,
  ): Promise<any[]> {
    this.logger.log(
      `🔍 Starting search for document ${documentId} with ${queryEmbedding.length}D query`,
    );

    // First, validate that all embeddings have the same dimensions as the query
    const queryDimensions = queryEmbedding.length;

    // Check embedding dimensions for this document
    const dimensionInfo =
      await this.getEmbeddingDimensionsForDocument(documentId);

    console.log(`📊 Document dimension info:`, dimensionInfo);

    if (!dimensionInfo.hasConsistentDimensions) {
      throw new Error(
        `Cannot search document with inconsistent embedding dimensions. Found: ${Object.keys(dimensionInfo.dimensionCounts).join(', ')} dimensions. Please re-process this document.`,
      );
    }

    if (
      dimensionInfo.dimensions &&
      dimensionInfo.dimensions !== queryDimensions
    ) {
      throw new Error(
        `Query embedding dimensions (${queryDimensions}) don't match stored embeddings (${dimensionInfo.dimensions}). Please use the correct embedding model.`,
      );
    }

    try {
      // Step 1: Get all segments for the document (no vector operations)
      const segments = await this.segmentRepository.find({
        where: { documentId },
        relations: ['embedding'],
      });

      if (segments.length === 0) {
        this.logger.warn(`No segments found for document ${documentId}`);
        return [];
      }

      // Step 2: Filter segments by dimension compatibility
      const compatibleSegments = segments.filter((segment) => {
        if (!segment.embedding?.embedding) return false;
        const segmentDimensions = segment.embedding.embedding.length;
        return segmentDimensions === queryDimensions;
      });

      if (compatibleSegments.length === 0) {
        this.logger.warn(
          `No compatible segments found for document ${documentId} with ${queryDimensions} dimensions`,
        );
        return [];
      }

      // Step 3: Perform vector search only on compatible segments
      const segmentIds = compatibleSegments.map((s) => s.id);

      // Build the query with proper parameter placeholders
      const placeholders = segmentIds
        .map((_, index) => `$${index + 2}`)
        .join(', ');

      const query = `
        SELECT 
          s.id,
          s.content,
          s.position,
          s.word_count,
          s.tokens,
          s.keywords,
          s.enabled,
          s.status,
          s.created_at,
          s.updated_at,
          s.completed_at,
          s.error,
          e.embedding,
          (e.embedding <=> $1::vector) as distance
        FROM document_segments s
        INNER JOIN embeddings e ON s.embedding_id = e.id
        WHERE s.id IN (${placeholders})
        ORDER BY distance ASC
        LIMIT ${limit}
      `;

      const params = [`[${queryEmbedding.join(',')}]`, ...segmentIds];

      const result = await this.segmentRepository.query(query, params);

      const searchResults = result.map((row: any) => ({
        id: row.id,
        content: row.content,
        similarity: 1 - parseFloat(row.distance), // Convert distance to similarity
        segment: {
          id: row.id,
          content: row.content,
          position: row.position,
          wordCount: row.word_count,
          tokens: row.tokens,
          keywords: row.keywords,
          enabled: row.enabled,
          status: row.status,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          completedAt: row.completed_at,
          error: row.error,
        },
      }));

      return searchResults;
    } catch (error) {
      this.logger.error(`❌ Vector search failed:`, error.message);
      throw error;
    }
  }

  async countSegmentsWithEmbeddings(documentId: string): Promise<number> {
    return this.segmentRepository.count({
      where: {
        documentId,
        embeddingId: Not(IsNull()),
      },
    });
  }

  async getEmbeddingModelForDocument(
    documentId: string,
  ): Promise<string | null> {
    // Get the first segment with an embedding to determine the actual model used
    const segmentWithEmbedding = await this.segmentRepository
      .createQueryBuilder('segment')
      .leftJoinAndSelect('segment.embedding', 'embedding')
      .where('segment.documentId = :documentId', { documentId })
      .andWhere('segment.embeddingId IS NOT NULL')
      .andWhere('embedding.modelName IS NOT NULL')
      .limit(1)
      .getOne();

    return segmentWithEmbedding?.embedding?.modelName || null;
  }

  async getEmbeddingDimensionsForDocument(documentId: string): Promise<{
    dimensions: number | null;
    hasConsistentDimensions: boolean;
    dimensionCounts: Record<number, number>;
  }> {
    // Get all embeddings for this document to check dimension consistency
    const embeddings = await this.segmentRepository
      .createQueryBuilder('segment')
      .leftJoinAndSelect('segment.embedding', 'embedding')
      .where('segment.documentId = :documentId', { documentId })
      .andWhere('segment.embeddingId IS NOT NULL')
      .andWhere('embedding.embedding IS NOT NULL')
      .getMany();

    if (embeddings.length === 0) {
      return {
        dimensions: null,
        hasConsistentDimensions: true,
        dimensionCounts: {},
      };
    }

    // Count dimensions
    const dimensionCounts: Record<number, number> = {};
    embeddings.forEach((segment) => {
      if (segment.embedding?.embedding) {
        const dims = segment.embedding.embedding.length;
        dimensionCounts[dims] = (dimensionCounts[dims] || 0) + 1;
      }
    });

    const uniqueDimensions = Object.keys(dimensionCounts).map(Number);
    const hasConsistentDimensions = uniqueDimensions.length === 1;
    const mostCommonDimension =
      uniqueDimensions.length > 0
        ? Number(
            Object.entries(dimensionCounts).sort((a, b) => b[1] - a[1])[0][0],
          )
        : null;

    return {
      dimensions: mostCommonDimension,
      hasConsistentDimensions,
      dimensionCounts,
    };
  }

  async findSegmentsWithInconsistentDimensions(documentId: string): Promise<{
    segmentsToKeep: DocumentSegment[];
    segmentsToRemove: DocumentSegment[];
    dimensionCounts: Record<number, number>;
    recommendedDimension: number | null;
  }> {
    // Get all segments with embeddings
    const segments = await this.segmentRepository
      .createQueryBuilder('segment')
      .leftJoinAndSelect('segment.embedding', 'embedding')
      .where('segment.documentId = :documentId', { documentId })
      .andWhere('segment.embeddingId IS NOT NULL')
      .andWhere('embedding.embedding IS NOT NULL')
      .getMany();

    if (segments.length === 0) {
      return {
        segmentsToKeep: [],
        segmentsToRemove: [],
        dimensionCounts: {},
        recommendedDimension: null,
      };
    }

    // Count dimensions
    const dimensionCounts: Record<number, number> = {};
    segments.forEach((segment) => {
      if (segment.embedding?.embedding) {
        const dims = segment.embedding.embedding.length;
        dimensionCounts[dims] = (dimensionCounts[dims] || 0) + 1;
      }
    });

    // Find the most common dimension (this should be kept)
    const sortedDimensions = Object.entries(dimensionCounts).sort(
      (a, b) => b[1] - a[1],
    );
    const recommendedDimension =
      sortedDimensions.length > 0 ? Number(sortedDimensions[0][0]) : null;

    const segmentsToKeep: DocumentSegment[] = [];
    const segmentsToRemove: DocumentSegment[] = [];

    segments.forEach((segment) => {
      if (segment.embedding?.embedding) {
        const dims = segment.embedding.embedding.length;
        if (dims === recommendedDimension) {
          segmentsToKeep.push(segment);
        } else {
          segmentsToRemove.push(segment);
        }
      }
    });

    return {
      segmentsToKeep,
      segmentsToRemove,
      dimensionCounts,
      recommendedDimension,
    };
  }

  async removeInconsistentEmbeddings(documentId: string): Promise<{
    removedCount: number;
    keptCount: number;
    dimensionCounts: Record<number, number>;
  }> {
    const analysis =
      await this.findSegmentsWithInconsistentDimensions(documentId);

    if (analysis.segmentsToRemove.length === 0) {
      return {
        removedCount: 0,
        keptCount: analysis.segmentsToKeep.length,
        dimensionCounts: analysis.dimensionCounts,
      };
    }

    // Remove embeddings from inconsistent segments (but keep the segments)
    for (const segment of analysis.segmentsToRemove) {
      await this.segmentRepository.update(segment.id, {
        embeddingId: undefined,
        status: 'waiting', // Reset to waiting so it can be re-processed
      });
    }

    return {
      removedCount: analysis.segmentsToRemove.length,
      keptCount: analysis.segmentsToKeep.length,
      dimensionCounts: analysis.dimensionCounts,
    };
  }

  /**
   * Bulk delete segments
   */
  async bulkDelete(segmentIds: string[]): Promise<{ deleted: number }> {
    this.logger.log(`🗑️ Bulk deleting ${segmentIds.length} segments`);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Get segments with their embedding IDs
      const segments = await queryRunner.manager.find(DocumentSegment, {
        where: { id: In(segmentIds) },
        select: ['id', 'embeddingId'],
      });

      if (segments.length === 0) {
        this.logger.warn('No segments found for bulk delete');
        await queryRunner.rollbackTransaction();
        return { deleted: 0 };
      }

      // Collect embedding IDs to delete
      const embeddingIds = segments
        .map((segment) => segment.embeddingId)
        .filter((id): id is string => id !== null);

      this.logger.log(
        `📊 Found ${segments.length} segments with ${embeddingIds.length} embeddings`,
      );

      // Delete segments first (removes FK references)
      const deleteResult = await queryRunner.manager.delete(
        DocumentSegment,
        segmentIds,
      );
      this.logger.log(`✅ Deleted ${deleteResult.affected || 0} segments`);

      // Delete embeddings if any exist
      if (embeddingIds.length > 0) {
        const embeddingDeleteResult = await queryRunner.manager.delete(
          Embedding,
          embeddingIds,
        );
        this.logger.log(
          `✅ Deleted ${embeddingDeleteResult.affected || 0} embeddings`,
        );
      }

      await queryRunner.commitTransaction();

      this.logger.log(
        `🎉 Bulk delete completed: ${deleteResult.affected || 0} segments`,
      );
      return { deleted: deleteResult.affected || 0 };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`💥 Bulk delete failed: ${error.message}`);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Bulk update segment status (enabled/disabled)
   */
  async bulkUpdateStatus(
    segmentIds: string[],
    enabled: boolean,
  ): Promise<{ updated: number }> {
    this.logger.log(
      `🔄 Bulk updating ${segmentIds.length} segments to ${enabled ? 'enabled' : 'disabled'}`,
    );

    try {
      const updateData: any = {
        enabled,
      };

      if (!enabled) {
        updateData.disabledAt = new Date();
      }

      const updateResult = await this.segmentRepository.update(
        { id: In(segmentIds) },
        updateData,
      );

      this.logger.log(
        `✅ Bulk status update completed: ${updateResult.affected || 0} segments`,
      );
      return { updated: updateResult.affected || 0 };
    } catch (error) {
      this.logger.error(`💥 Bulk status update failed: ${error.message}`);
      throw error;
    }
  }
}
