import { PartialType } from '@nestjs/mapped-types';
import { CreatePredefinedEntityDto } from './create-predefined-entity.dto';

export class UpdatePredefinedEntityDto extends PartialType(
  CreatePredefinedEntityDto,
) {}
