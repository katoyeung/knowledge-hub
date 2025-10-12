import { PartialType } from '@nestjs/mapped-types';
import { CreateAiProviderDto } from './create-ai-provider.dto';

export class UpdateAiProviderDto extends PartialType(CreateAiProviderDto) {}
