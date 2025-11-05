import {
  IsString,
  IsOptional,
  IsBoolean,
  IsArray,
  IsObject,
  IsNumber,
  IsEnum,
  ValidateNested,
  Min,
  Max,
  IsUUID,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class NodeInputSourceDto {
  @ApiProperty({ description: 'Input source ID' })
  @IsString()
  id: string;

  @ApiProperty({ description: 'Input source name' })
  @IsString()
  name: string;

  @ApiProperty({
    description: 'Input source type',
    enum: ['dataset', 'document', 'segment', 'file', 'api', 'previous_node'],
  })
  @IsEnum(['dataset', 'document', 'segment', 'file', 'api', 'previous_node'])
  type: string;

  @ApiPropertyOptional({ description: 'Source ID (dataset, document, etc.)' })
  @IsOptional()
  @IsString()
  sourceId?: string;

  @ApiPropertyOptional({ description: 'Previous node ID' })
  @IsOptional()
  @IsString()
  nodeId?: string;

  @ApiProperty({
    description: 'Data format',
    enum: ['json', 'csv', 'text', 'binary', 'structured'],
  })
  @IsEnum(['json', 'csv', 'text', 'binary', 'structured'])
  format: string;

  @ApiPropertyOptional({ description: 'Data filters' })
  @IsOptional()
  @IsObject()
  filters?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Field mapping' })
  @IsOptional()
  @IsObject()
  mapping?: Record<string, string>;
}

export class NodeOutputFormatDto {
  @ApiProperty({ description: 'Output format ID' })
  @IsString()
  id: string;

  @ApiProperty({ description: 'Output format name' })
  @IsString()
  name: string;

  @ApiProperty({
    description: 'Output type',
    enum: ['dataset', 'document', 'segment', 'file', 'api'],
  })
  @IsEnum(['dataset', 'document', 'segment', 'file', 'api'])
  type: string;

  @ApiProperty({
    description: 'Data format',
    enum: ['json', 'csv', 'text', 'binary', 'structured'],
  })
  @IsEnum(['json', 'csv', 'text', 'binary', 'structured'])
  format: string;

  @ApiPropertyOptional({ description: 'Output destination' })
  @IsOptional()
  @IsString()
  destination?: string;

  @ApiPropertyOptional({ description: 'Output data schema' })
  @IsOptional()
  @IsObject()
  schema?: Record<string, any>;
}

export class WorkflowNodeDto {
  @ApiProperty({ description: 'Node ID' })
  @IsString()
  id: string;

  @ApiProperty({ description: 'Node type' })
  @IsString()
  type: string;

  @ApiProperty({ description: 'Node name' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: 'Node description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Node position' })
  @IsObject()
  position: { x: number; y: number };

  @ApiProperty({ description: 'Node configuration' })
  @IsObject()
  config: Record<string, any>;

  @ApiProperty({ description: 'Input sources' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NodeInputSourceDto)
  inputSources: NodeInputSourceDto[];

  @ApiProperty({ description: 'Output formats' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NodeOutputFormatDto)
  outputFormats: NodeOutputFormatDto[];

  @ApiProperty({
    description: 'Execution mode',
    enum: ['parallel', 'consecutive'],
  })
  @IsEnum(['parallel', 'consecutive'])
  executionMode: string;

  @ApiProperty({ description: 'Node dependencies' })
  @IsArray()
  @IsString({ each: true })
  dependencies: string[];

  @ApiProperty({ description: 'Whether node is enabled' })
  @IsBoolean()
  enabled: boolean;

  @ApiPropertyOptional({ description: 'Node timeout in seconds' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  timeout?: number;

  @ApiPropertyOptional({ description: 'Retry count' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  retryCount?: number;
}

export class WorkflowConnectionDto {
  @ApiProperty({ description: 'Connection ID' })
  @IsString()
  id: string;

  @ApiProperty({ description: 'Source node ID' })
  @IsString()
  sourceNodeId: string;

  @ApiProperty({ description: 'Target node ID' })
  @IsString()
  targetNodeId: string;

  @ApiProperty({ description: 'Source output ID' })
  @IsString()
  sourceOutputId: string;

  @ApiProperty({ description: 'Target input ID' })
  @IsString()
  targetInputId: string;

  @ApiPropertyOptional({ description: 'Data mapping' })
  @IsOptional()
  @IsObject()
  dataMapping?: Record<string, string>;

  @ApiPropertyOptional({ description: 'Data transformation' })
  @IsOptional()
  @IsObject()
  transform?: {
    type: 'filter' | 'map' | 'aggregate' | 'custom';
    config: Record<string, any>;
  };
}

export class WorkflowSettingsDto {
  @ApiProperty({ description: 'Workflow name' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: 'Workflow description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'Execution mode',
    enum: ['sequential', 'parallel', 'hybrid'],
  })
  @IsEnum(['sequential', 'parallel', 'hybrid'])
  executionMode: string;

  @ApiProperty({ description: 'Maximum concurrency' })
  @IsNumber()
  @Min(1)
  @Max(100)
  maxConcurrency: number;

  @ApiProperty({
    description: 'Error handling strategy',
    enum: ['stop', 'continue', 'retry'],
  })
  @IsEnum(['stop', 'continue', 'retry'])
  errorHandling: string;

  @ApiProperty({ description: 'Maximum retries' })
  @IsNumber()
  @Min(0)
  @Max(10)
  maxRetries: number;

  @ApiProperty({ description: 'Timeout in seconds' })
  @IsNumber()
  @Min(1)
  timeout: number;

  @ApiProperty({ description: 'Data retention in days' })
  @IsNumber()
  @Min(1)
  dataRetention: number;

  @ApiProperty({ description: 'Enable snapshots' })
  @IsBoolean()
  enableSnapshots: boolean;

  @ApiProperty({ description: 'Snapshot interval in seconds' })
  @IsNumber()
  @Min(1)
  snapshotInterval: number;

  @ApiProperty({ description: 'Enable preview' })
  @IsBoolean()
  enablePreview: boolean;

  @ApiProperty({ description: 'Notification settings' })
  @IsObject()
  notificationSettings: {
    onStart: boolean;
    onComplete: boolean;
    onError: boolean;
    onProgress: boolean;
  };
}

// Simplified DTOs to match frontend expectations
export class SimpleWorkflowNodeDto {
  @ApiProperty({ description: 'Node ID' })
  @IsString()
  id: string;

  @ApiProperty({ description: 'Node type' })
  @IsString()
  type: string;

  @ApiProperty({ description: 'Node name' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Node position' })
  @IsObject()
  position: { x: number; y: number };

  @ApiProperty({ description: 'Node configuration' })
  @IsObject()
  config: Record<string, any>;

  @ApiPropertyOptional({ description: 'Input mapping' })
  @IsOptional()
  @IsObject()
  inputMapping?: Record<string, string>;

  @ApiPropertyOptional({ description: 'Output mapping' })
  @IsOptional()
  @IsObject()
  outputMapping?: Record<string, string>;

  @ApiPropertyOptional({ description: 'Whether node is enabled' })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ description: 'Node conditions' })
  @IsOptional()
  @IsString()
  conditions?: string;
}

export class SimpleWorkflowEdgeDto {
  @ApiProperty({ description: 'Edge ID' })
  @IsString()
  id: string;

  @ApiProperty({ description: 'Source node ID' })
  @IsString()
  source: string;

  @ApiProperty({ description: 'Target node ID' })
  @IsString()
  target: string;
}

export class SimpleWorkflowSettingsDto {
  @ApiProperty({ description: 'Error handling strategy' })
  @IsString()
  errorHandling: string;

  @ApiProperty({ description: 'Maximum retries' })
  @IsNumber()
  maxRetries: number;

  @ApiProperty({ description: 'Whether to execute in parallel' })
  @IsBoolean()
  parallelExecution: boolean;

  @ApiProperty({ description: 'Notify on completion' })
  @IsBoolean()
  notifyOnCompletion: boolean;

  @ApiProperty({ description: 'Notify on failure' })
  @IsBoolean()
  notifyOnFailure: boolean;
}

export class CreateWorkflowDto {
  @ApiProperty({ description: 'Workflow name' })
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name: string;

  @ApiPropertyOptional({ description: 'Workflow description' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  description?: string;

  @ApiPropertyOptional({ description: 'Dataset ID' })
  @IsOptional()
  @IsUUID()
  datasetId?: string;

  @ApiProperty({ description: 'Workflow nodes' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SimpleWorkflowNodeDto)
  nodes: SimpleWorkflowNodeDto[];

  @ApiProperty({ description: 'Node edges' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SimpleWorkflowEdgeDto)
  edges: SimpleWorkflowEdgeDto[];

  @ApiProperty({ description: 'Workflow settings' })
  @ValidateNested()
  @Type(() => SimpleWorkflowSettingsDto)
  settings: SimpleWorkflowSettingsDto;

  @ApiPropertyOptional({ description: 'Whether workflow is active' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Whether workflow is a template' })
  @IsOptional()
  @IsBoolean()
  isTemplate?: boolean;

  @ApiPropertyOptional({ description: 'Workflow tags' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  tags?: string;

  @ApiPropertyOptional({ description: 'Workflow metadata' })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class UpdateWorkflowDto {
  @ApiProperty({ description: 'Workflow ID' })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiPropertyOptional({ description: 'Workflow name' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name?: string;

  @ApiPropertyOptional({ description: 'Workflow description' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  description?: string;

  @ApiPropertyOptional({ description: 'Dataset ID' })
  @IsOptional()
  @IsUUID()
  datasetId?: string;

  @ApiPropertyOptional({ description: 'Workflow nodes' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SimpleWorkflowNodeDto)
  nodes?: SimpleWorkflowNodeDto[];

  @ApiPropertyOptional({ description: 'Node edges' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SimpleWorkflowEdgeDto)
  edges?: SimpleWorkflowEdgeDto[];

  @ApiPropertyOptional({ description: 'Workflow settings' })
  @IsOptional()
  @ValidateNested()
  @Type(() => SimpleWorkflowSettingsDto)
  settings?: SimpleWorkflowSettingsDto;

  @ApiPropertyOptional({ description: 'Whether workflow is active' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Whether workflow is a template' })
  @IsOptional()
  @IsBoolean()
  isTemplate?: boolean;

  @ApiPropertyOptional({ description: 'Workflow tags' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  tags?: string;

  @ApiPropertyOptional({ description: 'Workflow metadata' })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class ExecuteWorkflowDto {
  @ApiProperty({ description: 'Workflow ID' })
  @IsUUID()
  workflowId: string;

  @ApiPropertyOptional({ description: 'Document ID' })
  @IsOptional()
  @IsUUID()
  documentId?: string;

  @ApiPropertyOptional({ description: 'Dataset ID' })
  @IsOptional()
  @IsUUID()
  datasetId?: string;

  @ApiPropertyOptional({ description: 'Input data' })
  @IsOptional()
  @IsArray()
  inputData?: any[];

  @ApiPropertyOptional({ description: 'Execution options' })
  @IsOptional()
  @IsObject()
  options?: {
    maxConcurrency?: number;
    timeout?: number;
    enableSnapshots?: boolean;
    snapshotInterval?: number;
  };

  @ApiPropertyOptional({ description: 'Trigger source' })
  @IsOptional()
  @IsString()
  triggerSource?: string;

  @ApiPropertyOptional({ description: 'Trigger data' })
  @IsOptional()
  @IsObject()
  triggerData?: Record<string, any>;
}

export class WorkflowExecutionResponseDto {
  @ApiProperty({ description: 'Execution ID' })
  executionId: string;

  @ApiProperty({ description: 'Execution status' })
  status: string;

  @ApiProperty({ description: 'Status message' })
  message: string;

  @ApiPropertyOptional({ description: 'Workflow name' })
  workflowName?: string;
}
