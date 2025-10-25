import { Exclude } from 'class-transformer';

export class ApiKeyResponseDto {
  id: string;
  name: string;
  prefix: string;
  createdAt: Date;
  lastUsedAt?: Date;

  @Exclude()
  keyHash: string;

  @Exclude()
  userId: string;
}
