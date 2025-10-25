import { Entity, Column, ManyToOne, RelationId } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { User } from '../../user/user.entity';
import { Dataset } from '../../dataset/entities/dataset.entity';

export interface PipelineStepConfig {
  id: string;
  type: string;
  name: string;
  description?: string;
  config: Record<string, any>;
  condition?: string; // JavaScript expression for conditional execution
  order: number;
  enabled: boolean;
}

export interface PipelineSettings {
  errorHandling: 'stop' | 'continue' | 'retry';
  maxRetries: number;
  parallelExecution: boolean;
  notifyOnCompletion: boolean;
  timeout?: number; // milliseconds
  retryDelay?: number; // milliseconds
}

@Entity({ name: 'pipeline_configs' })
export class PipelineConfig extends BaseEntity {
  @Column({ length: 255 })
  name: string;

  @Column('text', { nullable: true })
  description: string;

  @Column('uuid', { nullable: true })
  @RelationId((config: PipelineConfig) => config.dataset)
  datasetId: string;

  @Column('uuid')
  @RelationId((config: PipelineConfig) => config.user)
  userId: string;

  @Column({ default: true })
  isActive: boolean;

  @Column('jsonb')
  steps: PipelineStepConfig[];

  @Column('jsonb')
  settings: PipelineSettings;

  @Column({ default: false })
  isTemplate: boolean;

  @Column('text', { nullable: true })
  tags: string; // comma-separated tags

  // Relationships
  @ManyToOne(() => User, (user) => user.createdDocuments)
  user: User;

  @ManyToOne(() => Dataset, (dataset) => dataset.documents, { nullable: true })
  dataset: Dataset;
}
