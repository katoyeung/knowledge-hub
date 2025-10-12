import {
  IsString,
  IsArray,
  Matches,
  IsEmail,
  MaxLength,
  MinLength,
  IsOptional,
  IsObject,
} from 'class-validator';
import { Role } from '@modules/access/entities/role.entity';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  @Matches(/^[a-zA-Z0-9\s_-]+$/)
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @IsArray()
  roles?: Role[];

  @IsOptional()
  @IsObject()
  settings?: object;
}
