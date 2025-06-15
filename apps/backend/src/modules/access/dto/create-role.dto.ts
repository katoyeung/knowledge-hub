import {
  IsString,
  IsOptional,
  IsArray,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';
import { Permission } from '../entities/permission.entity';
export class CreateRoleDto {
  @IsString()
  @MinLength(3, { message: 'Role name must be at least 3 characters long' })
  @MaxLength(50, { message: 'Role name must not exceed 50 characters' })
  @Matches(/^[a-zA-Z0-9\s_-]+$/, {
    message:
      'Role name can only contain letters, numbers, spaces, underscores and hyphens',
  })
  name: string;

  @IsOptional()
  @IsArray()
  permissions?: Permission[];
}
