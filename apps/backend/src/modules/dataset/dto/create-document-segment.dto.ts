import {
  IsString,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsUUID,
} from 'class-validator';

export class CreateDocumentSegmentDto {
  @IsUUID()
  datasetId: string;

  @IsUUID()
  documentId: string;

  @IsNumber()
  position: number;

  @IsString()
  content: string;

  @IsOptional()
  @IsString()
  answer?: string;

  @IsNumber()
  wordCount: number;

  @IsNumber()
  tokens: number;

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

  @IsUUID()
  userId: string;
}
