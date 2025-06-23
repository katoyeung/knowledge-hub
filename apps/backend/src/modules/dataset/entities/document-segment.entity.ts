import { Entity, Column, ManyToOne, OneToMany, RelationId } from 'typeorm';
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

  // 🆕 Parent-Child Chunking Support
  @Column('uuid', { nullable: true })
  @RelationId((segment: DocumentSegment) => segment.parent)
  parentId: string;

  @Column({ length: 50, default: 'chunk' })
  segmentType: string; // 'parent', 'child', 'chunk' (for backward compatibility)

  @Column('integer', { default: 1 })
  hierarchyLevel: number; // 1 = parent (paragraph), 2 = child (sentence), etc.

  @Column('integer', { nullable: true })
  childOrder: number; // Order within parent segment

  @Column('integer', { default: 0 })
  childCount: number; // Number of child segments (for parent segments)

  @Column('json', { nullable: true })
  hierarchyMetadata: object; // Additional hierarchy information

  // Relationships
  @ManyToOne(() => Dataset, (dataset) => dataset.segments)
  dataset: Dataset;

  @ManyToOne(() => Document, (document) => document.segments)
  document: Document;

  @ManyToOne(() => User, (user) => user.createdSegments)
  user: User;

  @ManyToOne(() => Embedding, { nullable: true })
  embedding: Embedding;

  // 🆕 Parent-Child Relationships
  @ManyToOne(() => DocumentSegment, (segment) => segment.children, {
    nullable: true,
  })
  parent: DocumentSegment;

  @OneToMany(() => DocumentSegment, (segment) => segment.parent, {
    cascade: true,
  })
  children: DocumentSegment[];
}
