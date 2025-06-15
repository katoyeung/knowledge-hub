import { IsString, MinLength, MaxLength, Matches } from 'class-validator';

export class CreatePermissionDto {
  @IsString()
  @MinLength(3, {
    message: 'Permission name must be at least 3 characters long',
  })
  @MaxLength(50, { message: 'Permission name must not exceed 50 characters' })
  @Matches(/^[a-zA-Z0-9\s_-]+$/, {
    message:
      'Permission name can only contain letters, numbers, spaces, underscores and hyphens',
  })
  name: string;

  @IsString()
  @MinLength(3, { message: 'Resource name must be at least 3 characters long' })
  @MaxLength(50, { message: 'Resource name must not exceed 50 characters' })
  @Matches(/^[a-zA-Z0-9\s_-]+$/, {
    message:
      'Resource name can only contain letters, numbers, spaces, underscores and hyphens',
  })
  resource: string;

  @IsString()
  @MinLength(3, { message: 'Action name must be at least 3 characters long' })
  @MaxLength(50, { message: 'Action name must not exceed 50 characters' })
  action: string;
}
