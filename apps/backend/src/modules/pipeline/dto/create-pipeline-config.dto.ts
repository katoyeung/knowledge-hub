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
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PipelineStepConfigDto {
  @ApiProperty({ description: 'Unique identifier for the step' })
  @IsString()
  id: string;

  @ApiProperty({ description: 'Step type identifier' })
  @IsString()
  type: string;

  @ApiProperty({ description: 'Step name' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: 'Step description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Step configuration object' })
  @IsObject()
  config: Record<string, any>;

  @ApiPropertyOptional({ description: 'Conditional execution expression' })
  @IsOptional()
  @IsString()
  condition?: string;

  @ApiProperty({ description: 'Step execution order' })
  @IsNumber()
  @Min(0)
  order: number;

  @ApiProperty({ description: 'Whether step is enabled' })
  @IsBoolean()
  enabled: boolean;
}

export class PipelineSettingsDto {
  @ApiProperty({
    description: 'Error handling strategy',
    enum: ['stop', 'continue', 'retry'],
  })
  @IsEnum(['stop', 'continue', 'retry'])
  errorHandling: 'stop' | 'continue' | 'retry';

  @ApiProperty({ description: 'Maximum number of retries' })
  @IsNumber()
  @Min(0)
  @Max(10)
  maxRetries: number;

  @ApiProperty({ description: 'Whether to execute steps in parallel' })
  @IsBoolean()
  parallelExecution: boolean;

  @ApiProperty({ description: 'Whether to notify on completion' })
  @IsBoolean()
  notifyOnCompletion: boolean;

  @ApiPropertyOptional({ description: 'Execution timeout in milliseconds' })
  @IsOptional()
  @IsNumber()
  @Min(1000)
  timeout?: number;

  @ApiPropertyOptional({ description: 'Retry delay in milliseconds' })
  @IsOptional()
  @IsNumber()
  @Min(100)
  retryDelay?: number;
}

export class CreatePipelineConfigDto {
  @ApiProperty({ description: 'Pipeline name' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: 'Pipeline description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Dataset ID (optional for global pipelines)',
  })
  @IsOptional()
  @IsString()
  datasetId?: string;

  @ApiProperty({ description: 'Pipeline steps configuration' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PipelineStepConfigDto)
  steps: PipelineStepConfigDto[];

  @ApiProperty({ description: 'Pipeline settings' })
  @ValidateNested()
  @Type(() => PipelineSettingsDto)
  settings: PipelineSettingsDto;

  @ApiPropertyOptional({ description: 'Whether pipeline is active' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Whether pipeline is a template' })
  @IsOptional()
  @IsBoolean()
  isTemplate?: boolean;

  @ApiPropertyOptional({ description: 'Pipeline tags (comma-separated)' })
  @IsOptional()
  @IsString()
  tags?: string;
}

export class UpdatePipelineConfigDto {
  @ApiPropertyOptional({ description: 'Pipeline name' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Pipeline description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Dataset ID' })
  @IsOptional()
  @IsString()
  datasetId?: string;

  @ApiPropertyOptional({ description: 'Pipeline steps configuration' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PipelineStepConfigDto)
  steps?: PipelineStepConfigDto[];

  @ApiPropertyOptional({ description: 'Pipeline settings' })
  @IsOptional()
  @ValidateNested()
  @Type(() => PipelineSettingsDto)
  settings?: PipelineSettingsDto;

  @ApiPropertyOptional({ description: 'Whether pipeline is active' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Whether pipeline is a template' })
  @IsOptional()
  @IsBoolean()
  isTemplate?: boolean;

  @ApiPropertyOptional({ description: 'Pipeline tags' })
  @IsOptional()
  @IsString()
  tags?: string;
}

export class ExecutePipelineDto {
  @ApiProperty({ description: 'Pipeline configuration ID' })
  @IsString()
  pipelineConfigId: string;

  @ApiPropertyOptional({ description: 'Document ID to process' })
  @IsOptional()
  @IsString()
  documentId?: string;

  @ApiPropertyOptional({ description: 'Dataset ID to process' })
  @IsOptional()
  @IsString()
  datasetId?: string;

  @ApiPropertyOptional({ description: 'Specific segment IDs to process' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  segmentIds?: string[];

  @ApiPropertyOptional({ description: 'Execution options' })
  @IsOptional()
  @IsObject()
  options?: {
    maxRetries?: number;
    retryDelay?: number;
    timeout?: number;
    parallelExecution?: boolean;
    notifyOnProgress?: boolean;
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

export class PipelineExecutionResponseDto {
  @ApiProperty({ description: 'Execution ID' })
  executionId: string;

  @ApiProperty({ description: 'Execution status' })
  status: string;

  @ApiProperty({ description: 'Response message' })
  message: string;

  @ApiPropertyOptional({ description: 'Execution metrics' })
  metrics?: Record<string, any>;
}
