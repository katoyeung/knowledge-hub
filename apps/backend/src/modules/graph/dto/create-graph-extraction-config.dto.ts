import {
  IsString,
  IsOptional,
  IsBoolean,
  IsObject,
  IsEnum,
  IsNumber,
  Min,
  Max,
} from 'class-validator';
import { NodeType } from '../dto/create-graph-node.dto';
import { EdgeType } from '../dto/create-graph-edge.dto';

export class CreateGraphExtractionConfigDto {
  @IsString()
  @IsOptional()
  promptId?: string;

  @IsString()
  @IsOptional()
  aiProviderId?: string;

  @IsString()
  @IsOptional()
  model?: string;

  @IsNumber()
  @Min(0)
  @Max(1)
  @IsOptional()
  temperature?: number = 0.7;

  @IsBoolean()
  @IsOptional()
  enableDeduplication?: boolean = true;

  @IsObject()
  @IsOptional()
  nodeTypeFilters?: {
    include?: NodeType[];
    exclude?: NodeType[];
  };

  @IsObject()
  @IsOptional()
  edgeTypeFilters?: {
    include?: EdgeType[];
    exclude?: EdgeType[];
  };

  @IsNumber()
  @Min(1)
  @Max(1000)
  @IsOptional()
  batchSize?: number = 10;

  @IsNumber()
  @Min(0.1)
  @Max(1.0)
  @IsOptional()
  confidenceThreshold?: number = 0.5;

  @IsObject()
  @IsOptional()
  normalizationRules?: {
    brandNames?: Record<string, string>;
    authorNames?: Record<string, string>;
    topicMappings?: Record<string, string>;
  };

  @IsObject()
  @IsOptional()
  extractionSettings?: {
    extractSentiment?: boolean;
    extractEngagement?: boolean;
    extractTemporalData?: boolean;
    extractCompetitorMentions?: boolean;
    extractInfluencerNetworks?: boolean;
  };

  @IsBoolean()
  @IsOptional()
  syncMode?: boolean = false; // Execute synchronously instead of using queue
}
