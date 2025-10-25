import { IsString, MinLength, MaxLength, Matches } from 'class-validator';

export class CreateApiKeyDto {
  @IsString()
  @MinLength(1, { message: 'API key name must not be empty' })
  @MaxLength(255, { message: 'API key name must not exceed 255 characters' })
  @Matches(/^[a-zA-Z0-9\s_-]+$/, {
    message:
      'API key name can only contain letters, numbers, spaces, underscores and hyphens',
  })
  name: string;
}
