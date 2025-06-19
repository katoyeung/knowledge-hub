import { Entity, Column, ManyToOne, OneToMany, RelationId } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { User } from '../../user/user.entity';
import { Dataset } from './dataset.entity';
import { DocumentSegment } from './document-segment.entity';

@Entity({ name: 'documents' })
export class Document extends BaseEntity {
  @Column('uuid')
  @RelationId((document: Document) => document.dataset)
  datasetId: string;

  @Column('integer')
  position: number;

  @Column({ length: 255 })
  dataSourceType: string;

  @Column('text', { nullable: true })
  dataSourceInfo: string;

  @Column('uuid', { nullable: true })
  datasetProcessRuleId: string;

  @Column({ length: 255 })
  batch: string;

  @Column({ length: 255 })
  name: string;

  @Column({ length: 255 })
  createdFrom: string;

  @Column('uuid', { nullable: true })
  createdApiRequestId: string;

  @Column('timestamp', { nullable: true })
  processingStartedAt: Date;

  @Column('text', { nullable: true })
  fileId: string;

  @Column('integer', { nullable: true })
  wordCount: number;

  @Column('timestamp', { nullable: true })
  parsingCompletedAt: Date;

  @Column('timestamp', { nullable: true })
  cleaningCompletedAt: Date;

  @Column('timestamp', { nullable: true })
  splittingCompletedAt: Date;

  @Column('integer', { nullable: true })
  tokens: number;

  @Column('float', { nullable: true })
  indexingLatency: number;

  @Column('timestamp', { nullable: true })
  completedAt: Date;

  @Column({ default: false, nullable: true })
  isPaused: boolean;

  @Column('uuid', { nullable: true })
  pausedBy: string;

  @Column('timestamp', { nullable: true })
  pausedAt: Date;

  @Column('text', { nullable: true })
  error: string;

  @Column('timestamp', { nullable: true })
  stoppedAt: Date;

  @Column({ length: 255, default: 'waiting' })
  indexingStatus: string;

  @Column({ default: true })
  enabled: boolean;

  @Column('timestamp', { nullable: true })
  disabledAt: Date;

  @Column('uuid', { nullable: true })
  disabledBy: string;

  @Column({ default: false })
  archived: boolean;

  @Column({ length: 255, nullable: true })
  archivedReason: string;

  @Column('uuid', { nullable: true })
  archivedBy: string;

  @Column('timestamp', { nullable: true })
  archivedAt: Date;

  @Column({ length: 40, nullable: true })
  docType: string;

  @Column('jsonb', { nullable: true })
  docMetadata: object;

  @Column({ length: 255, default: 'text_model' })
  docForm: string;

  @Column({ length: 255, nullable: true })
  docLanguage: string;

  // Foreign key columns
  @Column('uuid')
  @RelationId((document: Document) => document.user)
  userId: string;

  // Relationships
  @ManyToOne(() => Dataset, (dataset) => dataset.documents)
  dataset: Dataset;

  @ManyToOne(() => User, (user) => user.createdDocuments)
  user: User;

  @OneToMany(() => DocumentSegment, (segment) => segment.document, {
    cascade: true,
    onDelete: 'CASCADE',
  })
  segments: DocumentSegment[];
}
