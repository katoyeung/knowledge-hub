import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TypeOrmCrudService } from '@dataui/crud-typeorm';
import { DocumentSegment } from './entities/document-segment.entity';

@Injectable()
export class DocumentSegmentService extends TypeOrmCrudService<DocumentSegment> {
  constructor(
    @InjectRepository(DocumentSegment)
    private readonly segmentRepository: Repository<DocumentSegment>,
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
}
