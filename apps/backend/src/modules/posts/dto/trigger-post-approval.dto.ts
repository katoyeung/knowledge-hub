import {
  IsOptional,
  IsString,
  IsNumber,
  IsUUID,
  IsArray,
  Min,
  Max,
} from 'class-validator';

export class TriggerPostApprovalDto {
  @IsOptional()
  @IsUUID(4, { message: 'AI Provider ID must be a valid UUID' })
  aiProviderId?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsUUID(4, { message: 'Prompt ID must be a valid UUID' })
  promptId?: string;

  @IsOptional()
  @IsNumber({}, { message: 'Temperature must be a number' })
  @Min(0, { message: 'Temperature must be at least 0' })
  @Max(2, { message: 'Temperature must not exceed 2' })
  temperature?: number;
}

export class BatchTriggerPostApprovalDto extends TriggerPostApprovalDto {
  @IsArray()
  @IsUUID(4, { each: true, message: 'Each post ID must be a valid UUID' })
  postIds: string[];
}
