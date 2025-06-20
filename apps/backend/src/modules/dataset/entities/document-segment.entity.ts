import { Entity, Column, ManyToOne, RelationId } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { User } from '../../user/user.entity';
import { Dataset } from './dataset.entity';
import { Document } from './document.entity';
import { Embedding } from './embedding.entity';

@Entity({ name: 'document_segments' })
export class DocumentSegment extends BaseEntity {
  @Column('uuid')
  @RelationId((segment: DocumentSegment) => segment.dataset)
  datasetId: string;

  @Column('uuid')
  @RelationId((segment: DocumentSegment) => segment.document)
  documentId: string;

  @Column('integer')
  position: number;

  @Column('text')
  content: string;

  @Column('text', { nullable: true })
  answer: string;

  @Column('integer')
  wordCount: number;

  @Column('integer')
  tokens: number;

  @Column('json', { nullable: true })
  keywords: object;

  @Column({ length: 255, nullable: true })
  indexNodeId: string;

  @Column({ length: 255, nullable: true })
  indexNodeHash: string;

  @Column('integer', { default: 0 })
  hitCount: number;

  @Column({ default: true })
  enabled: boolean;

  @Column('timestamp', { nullable: true })
  disabledAt: Date;

  @Column('uuid', { nullable: true })
  disabledBy: string;

  @Column({ length: 255, default: 'waiting' })
  status: string;

  @Column('timestamp', { nullable: true })
  indexingAt: Date;

  @Column('timestamp', { nullable: true })
  completedAt: Date;

  @Column('text', { nullable: true })
  error: string;

  @Column('timestamp', { nullable: true })
  stoppedAt: Date;

  // Embedding relationship
  @Column('uuid', { nullable: true })
  @RelationId((segment: DocumentSegment) => segment.embedding)
  embeddingId: string;

  // Foreign key columns
  @Column('uuid')
  @RelationId((segment: DocumentSegment) => segment.user)
  userId: string;

  // Relationships
  @ManyToOne(() => Dataset, (dataset) => dataset.segments)
  dataset: Dataset;

  @ManyToOne(() => Document, (document) => document.segments)
  document: Document;

  @ManyToOne(() => User, (user) => user.createdSegments)
  user: User;

  @ManyToOne(() => Embedding, { nullable: true })
  embedding: Embedding;
}
