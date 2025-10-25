import { Entity, Column, ManyToOne, RelationId } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { User } from '../../user/user.entity';
import { Dataset } from '../../dataset/entities/dataset.entity';

export interface WorkflowNode {
  id: string;
  type: string;
  name: string;
  position: { x: number; y: number };
  config: Record<string, any>;
  inputMapping?: Record<string, string>;
  outputMapping?: Record<string, string>;
  enabled?: boolean;
  conditions?: string;
  testOutput?: {
    items?: any[];
    meta?: {
      totalCount: number;
      sampleCount: number;
      lastUpdated: string;
      [key: string]: any;
    };
    [key: string]: any;
  };
  inputSources?: Array<{
    type: 'previous_node' | 'dataset' | 'document' | 'segment' | 'file' | 'api';
    nodeId?: string;
    datasetId?: string;
    documentId?: string;
    segmentId?: string;
    filePath?: string;
    apiUrl?: string;
    filters?: Array<{
      field: string;
      operator: string;
      value: any;
    }>;
    mapping?: Record<string, string>;
  }>;
}

export interface NodeInputSource {
  id: string;
  name: string;
  type: 'dataset' | 'document' | 'segment' | 'file' | 'api' | 'previous_node';
  sourceId?: string; // ID of dataset, document, etc.
  nodeId?: string; // If type is 'previous_node'
  format: 'json' | 'csv' | 'text' | 'binary' | 'structured';
  filters?: Record<string, any>;
  mapping?: Record<string, string>; // Field mapping
}

export interface NodeOutputFormat {
  id: string;
  name: string;
  type: 'dataset' | 'document' | 'segment' | 'file' | 'api';
  format: 'json' | 'csv' | 'text' | 'binary' | 'structured';
  destination?: string; // Where to store output
  schema?: Record<string, any>; // Output data schema
}

export interface WorkflowConnection {
  id: string;
  source: string;
  target: string;
}

export interface WorkflowSettings {
  errorHandling: string;
  maxRetries: number;
  parallelExecution: boolean;
  notifyOnCompletion: boolean;
  notifyOnFailure: boolean;
}

@Entity({ name: 'workflows' })
export class Workflow extends BaseEntity {
  @Column({ length: 255 })
  name: string;

  @Column('text', { nullable: true })
  description: string;

  @Column('uuid', { nullable: true })
  @RelationId((workflow: Workflow) => workflow.dataset)
  datasetId: string;

  @Column('uuid')
  @RelationId((workflow: Workflow) => workflow.user)
  userId: string;

  @Column('jsonb')
  nodes: WorkflowNode[];

  @Column('jsonb')
  edges: WorkflowConnection[];

  @Column('jsonb')
  settings: WorkflowSettings;

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: false })
  isTemplate: boolean;

  @Column('text', { nullable: true })
  tags: string; // comma-separated tags

  @Column('jsonb', { nullable: true })
  metadata: {
    version: string;
    createdBy: string;
    lastModifiedBy: string;
    category?: string;
    complexity?: 'simple' | 'medium' | 'complex';
    templateId?: string;
    [key: string]: any;
  };

  // Relationships
  @ManyToOne(() => User, (user) => user.createdDocuments)
  user: User;

  @ManyToOne(() => Dataset, (dataset) => dataset.documents, { nullable: true })
  dataset: Dataset;
}
