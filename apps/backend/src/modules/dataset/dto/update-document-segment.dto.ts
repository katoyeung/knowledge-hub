import { PartialType } from '@nestjs/mapped-types';
import { CreateDocumentSegmentDto } from './create-document-segment.dto';
import { IsOptional, IsString, IsBoolean, IsNumber } from 'class-validator';

export class UpdateDocumentSegmentDto extends PartialType(
  CreateDocumentSegmentDto,
) {
  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  answer?: string;

  @IsOptional()
  @IsNumber()
  wordCount?: number;

  @IsOptional()
  @IsNumber()
  tokens?: number;

  @IsOptional()
  keywords?: object;

  @IsOptional()
  @IsString()
  indexNodeId?: string;

  @IsOptional()
  @IsString()
  indexNodeHash?: string;

  @IsOptional()
  @IsNumber()
  hitCount?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  status?: string;
}
