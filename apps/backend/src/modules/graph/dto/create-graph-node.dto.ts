import {
  IsString,
  IsOptional,
  IsEnum,
  IsObject,
  IsUUID,
  IsNumber,
  Min,
  Max,
} from 'class-validator';

export enum NodeType {
  AUTHOR = 'author',
  BRAND = 'brand',
  TOPIC = 'topic',
  HASHTAG = 'hashtag',
  INFLUENCER = 'influencer',
  LOCATION = 'location',
  ORGANIZATION = 'organization',
  PRODUCT = 'product',
  EVENT = 'event',
}

export class CreateGraphNodeDto {
  @IsUUID()
  datasetId: string;

  @IsUUID()
  @IsOptional()
  documentId?: string;

  @IsUUID()
  @IsOptional()
  segmentId?: string;

  @IsEnum(NodeType)
  nodeType: NodeType;

  @IsString()
  label: string;

  @IsObject()
  @IsOptional()
  properties?: {
    normalized_name?: string;
    channel?: string;
    platform?: string;
    verified?: boolean;
    follower_count?: number;
    engagement_rate?: number;
    sentiment_score?: number;
    confidence?: number;
    temporal_data?: {
      first_mentioned: Date;
      last_mentioned: Date;
      mention_count: number;
    };
    [key: string]: unknown;
  };
}
