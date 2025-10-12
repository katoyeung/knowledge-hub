import {
  IsString,
  IsOptional,
  IsArray,
  MinLength,
  MaxLength,
  Matches,
  IsEmail,
  IsObject,
} from 'class-validator';
import { Role } from '@modules/access/entities/role.entity';
export class CreateUserDto {
  @IsString()
  @MinLength(3, { message: 'Role name must be at least 3 characters long' })
  @MaxLength(50, { message: 'Role name must not exceed 50 characters' })
  @Matches(/^[a-zA-Z0-9\s_-]+$/, {
    message:
      'Role name can only contain letters, numbers, spaces, underscores and hyphens',
  })
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  password: string;

  @IsOptional()
  @IsArray()
  roles?: Role[];

  @IsOptional()
  @IsObject()
  settings?: object;
}
