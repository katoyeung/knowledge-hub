import { PartialType } from '@nestjs/mapped-types';
import { CreateDatasetDto } from './create-dataset.dto';
import { IsOptional, IsUUID } from 'class-validator';

export class UpdateDatasetDto extends PartialType(CreateDatasetDto) {
  @IsOptional()
  @IsUUID(4, { message: 'Owner ID must be a valid UUID' })
  ownerId?: string;
}
