import {
  IsString,
  IsOptional,
  IsNumber,
  IsEnum,
  IsObject,
  IsArray,
  ValidateNested,
  Min,
  Max,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  EntitySource,
  COMMON_ENTITY_TYPES,
} from '../entities/graph-entity.entity';
import { AliasType } from '../entities/entity-alias.entity';

export class CreateAliasDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z]{2}$/, {
    message: 'Language must be ISO 639-1 code (e.g., en, zh)',
  })
  language?: string;

  @IsOptional()
  @IsString()
  script?: string; // ISO 15924 script code

  @IsOptional()
  @IsEnum(AliasType)
  type?: AliasType;
}

export class CreateEntityDto {
  @IsOptional()
  @IsString()
  // Note: Using IsString instead of IsUrl to support URI references like "wikidata:Q123"
  // Full validation can be done in service layer if needed
  entityId?: string; // Optional URI-based global identifier (e.g., "wikidata:Q123" or "https://example.com/entities/123")

  @IsString()
  entityType: string; // Flexible - can be common type or custom

  @IsString()
  canonicalName: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidenceScore?: number;

  @IsOptional()
  @IsEnum(EntitySource)
  source?: EntitySource;

  @IsOptional()
  @IsObject()
  metadata?: {
    description?: string;
    category?: string;
    industry?: string;
    country?: string; // ISO 3166-1 alpha-2
    region?: string;
    website?: string; // URI
    established?: string; // ISO date-time
    dissolved?: string; // ISO date-time
    geoLocation?: {
      latitude?: number;
      longitude?: number;
      address?: string;
    };
    socialMedia?: Array<{
      platform: string;
      url: string;
    }>;
    legalStatus?:
      | 'public_company'
      | 'private_company'
      | 'non_profit'
      | 'government_entity';
    tags?: string[];
    extraction_patterns?: string[];
    [key: string]: any;
  };

  @IsOptional()
  @IsObject()
  equivalentEntities?: Record<string, string>; // e.g., { wikidata: 'Q12345' }

  @IsOptional()
  @IsObject()
  provenance?: {
    sources?: string[]; // Array of URIs
    dataProvider?: string;
  };

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateAliasDto)
  aliases?: CreateAliasDto[];
}
