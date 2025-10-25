import { Entity, Column, ManyToOne, RelationId } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Workflow } from './workflow.entity';
import { Document } from '../../dataset/entities/document.entity';
import { Dataset } from '../../dataset/entities/dataset.entity';
import { User } from '../../user/user.entity';

export interface NodeExecutionSnapshot {
  nodeId: string;
  nodeName: string;
  timestamp: Date;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  inputData: {
    count: number;
    sample: any[];
    schema: Record<string, any>;
  };
  outputData: {
    count: number;
    sample: any[];
    schema: Record<string, any>;
    items?: any[]; // Full data for processing
    meta?: Record<string, any>; // Additional metadata
  };
  metrics: {
    processingTime: number;
    memoryUsage: number;
    cpuUsage: number;
    dataSize: number;
  };
  error?: string;
  progress: number; // 0-100
}

export interface WorkflowExecutionMetrics {
  totalNodes: number;
  completedNodes: number;
  failedNodes: number;
  skippedNodes: number;
  totalDuration: number;
  averageNodeDuration: number;
  totalDataProcessed: number;
  peakMemoryUsage: number;
  averageCpuUsage: number;
  dataThroughput: number; // items per second
}

export type WorkflowExecutionStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'paused';

@Entity({ name: 'workflow_executions' })
export class WorkflowExecution extends BaseEntity {
  @Column('uuid')
  @RelationId((execution: WorkflowExecution) => execution.workflow)
  workflowId: string;

  @Column('uuid', { nullable: true })
  @RelationId((execution: WorkflowExecution) => execution.document)
  documentId: string;

  @Column('uuid', { nullable: true })
  @RelationId((execution: WorkflowExecution) => execution.dataset)
  datasetId: string;

  @Column({
    type: 'enum',
    enum: ['pending', 'running', 'completed', 'failed', 'cancelled', 'paused'],
    default: 'pending',
  })
  status: WorkflowExecutionStatus;

  @Column('timestamp')
  startedAt: Date;

  @Column('timestamp', { nullable: true })
  completedAt: Date;

  @Column('jsonb')
  nodeSnapshots: NodeExecutionSnapshot[];

  @Column('jsonb')
  metrics: WorkflowExecutionMetrics;

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

  @Column('jsonb', { nullable: true })
  executionContext: {
    userId: string;
    environment: string;
    version: string;
    parameters: Record<string, any>;
  };

  @Column('uuid')
  @RelationId((execution: WorkflowExecution) => execution.user)
  userId: string;

  // Relationships
  @ManyToOne(() => Workflow, (workflow) => workflow.id)
  workflow: Workflow;

  @ManyToOne(() => User, (user) => user.id)
  user: User;

  @ManyToOne(() => Document, (document) => document.id, { nullable: true })
  document: Document;

  @ManyToOne(() => Dataset, (dataset) => dataset.id, { nullable: true })
  dataset: Dataset;
}
