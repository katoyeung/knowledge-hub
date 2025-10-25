import { Entity, Column, ManyToOne, RelationId } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { PipelineConfig } from './pipeline-config.entity';
import { Document } from '../../dataset/entities/document.entity';
import { Dataset } from '../../dataset/entities/dataset.entity';

export interface StepExecutionResult {
  stepId: string;
  stepType: string;
  stepName: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startedAt: Date;
  completedAt?: Date;
  duration?: number; // milliseconds
  inputCount: number;
  outputCount: number;
  error?: string;
  metrics?: Record<string, any>;
  rollbackData?: any; // Data needed for rollback
}

export interface ExecutionMetrics {
  totalSteps: number;
  completedSteps: number;
  failedSteps: number;
  skippedSteps: number;
  totalDuration: number;
  averageStepDuration: number;
  inputSegments: number;
  outputSegments: number;
  segmentsProcessed: number;
  segmentsFiltered: number;
  segmentsSummarized: number;
  embeddingsGenerated: number;
  graphNodesCreated: number;
  graphEdgesCreated: number;
}

export type PipelineExecutionStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'paused';

@Entity({ name: 'pipeline_executions' })
export class PipelineExecution extends BaseEntity {
  @Column('uuid')
  @RelationId((execution: PipelineExecution) => execution.pipelineConfig)
  pipelineConfigId: string;

  @Column('uuid', { nullable: true })
  @RelationId((execution: PipelineExecution) => execution.document)
  documentId: string;

  @Column('uuid', { nullable: true })
  @RelationId((execution: PipelineExecution) => execution.dataset)
  datasetId: string;

  @Column({
    type: 'enum',
    enum: ['pending', 'running', 'completed', 'failed', 'cancelled', 'paused'],
    default: 'pending',
  })
  status: PipelineExecutionStatus;

  @Column('timestamp')
  startedAt: Date;

  @Column('timestamp', { nullable: true })
  completedAt: Date;

  @Column('jsonb')
  stepResults: StepExecutionResult[];

  @Column('jsonb')
  metrics: ExecutionMetrics;

  @Column('text', { nullable: true })
  error: string;

  @Column('text', { nullable: true })
  cancellationReason: string;

  @Column('uuid', { nullable: true })
  cancelledBy: string;

  @Column('timestamp', { nullable: true })
  cancelledAt: Date;

  @Column('text', { nullable: true })
  triggerSource: string; // 'manual', 'api', 'scheduled', 'webhook'

  @Column('jsonb', { nullable: true })
  triggerData: Record<string, any>;

  // Relationships
  @ManyToOne(() => PipelineConfig, (config) => config.id)
  pipelineConfig: PipelineConfig;

  @ManyToOne(() => Document, (document) => document.id, { nullable: true })
  document: Document;

  @ManyToOne(() => Dataset, (dataset) => dataset.id, { nullable: true })
  dataset: Dataset;
}
