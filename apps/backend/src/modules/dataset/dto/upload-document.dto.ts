import { IsString, IsOptional, IsUUID, MaxLength } from 'class-validator';

export class UploadDocumentDto {
  @IsOptional()
  @IsUUID(4, { message: 'Dataset ID must be a valid UUID' })
  datasetId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Dataset name must not exceed 255 characters' })
  datasetName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, {
    message: 'Dataset description must not exceed 500 characters',
  })
  datasetDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255, {
    message: 'Data source type must not exceed 255 characters',
  })
  dataSourceType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Batch must not exceed 255 characters' })
  batch?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Created from must not exceed 255 characters' })
  createdFrom?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40, { message: 'Doc type must not exceed 40 characters' })
  docType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Doc form must not exceed 255 characters' })
  docForm?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Doc language must not exceed 255 characters' })
  docLanguage?: string;
}
