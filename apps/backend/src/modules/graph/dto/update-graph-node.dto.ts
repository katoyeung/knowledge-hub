import { PartialType } from '@nestjs/mapped-types';
import { CreateGraphNodeDto } from './create-graph-node.dto';

export class UpdateGraphNodeDto extends PartialType(CreateGraphNodeDto) {}
