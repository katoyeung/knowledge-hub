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

export enum EdgeType {
  MENTIONS = 'mentions',
  SENTIMENT = 'sentiment',
  INTERACTS_WITH = 'interacts_with',
  COMPETES_WITH = 'competes_with',
  DISCUSSES = 'discusses',
  SHARES_TOPIC = 'shares_topic',
  FOLLOWS = 'follows',
  COLLABORATES = 'collaborates',
  INFLUENCES = 'influences',
  LOCATED_IN = 'located_in',
  PART_OF = 'part_of',
  RELATED_TO = 'related_to',
}

export class CreateGraphEdgeDto {
  @IsUUID()
  datasetId: string;

  @IsUUID()
  sourceNodeId: string;

  @IsUUID()
  targetNodeId: string;

  @IsEnum(EdgeType)
  edgeType: EdgeType;

  @IsNumber()
  @Min(0)
  @Max(1)
  @IsOptional()
  weight?: number = 1;

  @IsObject()
  @IsOptional()
  properties?: {
    sentiment?: 'positive' | 'negative' | 'neutral';
    sentiment_score?: number;
    interaction_count?: number;
    engagement_rate?: number;
    temporal_data?: {
      first_interaction: Date;
      last_interaction: Date;
      frequency: number;
    };
    confidence?: number;
    context?: string;
    [key: string]: unknown;
  };
}
