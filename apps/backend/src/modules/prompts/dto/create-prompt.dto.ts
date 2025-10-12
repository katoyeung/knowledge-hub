import {
  IsString,
  IsOptional,
  IsBoolean,
  IsObject,
  MinLength,
  MaxLength,
  IsIn,
} from 'class-validator';

export class CreatePromptDto {
  @IsString()
  @MinLength(1, { message: 'Name is required' })
  @MaxLength(255, { message: 'Name must not exceed 255 characters' })
  name: string;

  @IsString()
  @MinLength(1, { message: 'System prompt is required' })
  systemPrompt: string;

  @IsOptional()
  @IsString()
  userPromptTemplate?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsObject()
  jsonSchema?: object;

  @IsOptional()
  @IsString()
  @IsIn(['intention', 'chat', 'system', 'custom'])
  type?: string = 'intention';

  @IsOptional()
  @IsBoolean()
  isGlobal?: boolean = false;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean = true;
}
