import { Controller, Get, Post, Param } from '@nestjs/common';
import { AppService } from './app.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Document } from './modules/dataset/entities/document.entity';
import { DocumentSegment } from './modules/dataset/entities/document-segment.entity';
import { JobRegistryService } from './modules/queue/services/job-registry.service';
import { QueueCleanupService } from './modules/queue/services/queue-cleanup.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    @InjectRepository(Document)
    private readonly documentRepository: Repository<Document>,
    @InjectRepository(DocumentSegment)
    private readonly segmentRepository: Repository<DocumentSegment>,
    private readonly jobRegistry: JobRegistryService,
    private readonly queueCleanup: QueueCleanupService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Post('test-document-parser')
  testDocumentParser() {
    return {
      success: true,
      message: 'Document parser module is loaded and accessible',
      timestamp: new Date().toISOString(),
      note: 'This is a public test endpoint - use /document-parser/admin/test for authenticated testing',
    };
  }

  @Get('health')
  getHealth(): { status: string } {
    return { status: 'ok' };
  }

  @Get('debug/document/:id')
  async debugDocument(@Param('id') id: string) {
    const document = await this.documentRepository.findOne({
      where: { id },
      relations: ['segments'],
    });

    if (!document) {
      return { error: 'Document not found' };
    }

    const segments = await this.segmentRepository.find({
      where: { documentId: id },
      order: { position: 'ASC' },
    });

    return {
      document: {
        id: document.id,
        name: document.name,
        indexingStatus: document.indexingStatus,
        processingMetadata: document.processingMetadata,
        createdAt: document.createdAt,
        updatedAt: document.updatedAt,
      },
      segments: segments.map((segment) => ({
        id: segment.id,
        position: segment.position,
        status: segment.status,
        content: segment.content.substring(0, 100) + '...',
        wordCount: segment.wordCount,
        tokens: segment.tokens,
        createdAt: segment.createdAt,
      })),
      segmentCount: segments.length,
    };
  }

  @Get('debug/queue')
  async debugQueue() {
    const registeredJobs = this.jobRegistry.getAllJobs();
    const queueStats = await this.queueCleanup.getQueueStats();

    return {
      registeredJobs: registeredJobs.map((job) => ({
        jobType: job.jobType,
        name: job.constructor.name,
      })),
      jobCount: registeredJobs.length,
      queueStats,
    };
  }

  @Post('debug/queue/cleanup')
  async cleanupQueue() {
    try {
      const result = await this.queueCleanup.manualCleanup();
      return {
        success: true,
        message: 'Queue cleanup completed',
        result,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Queue cleanup failed',
        error: error.message,
      };
    }
  }
}
