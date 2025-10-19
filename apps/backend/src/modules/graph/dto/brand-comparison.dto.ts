import {
  IsArray,
  IsString,
  IsOptional,
  IsEnum,
  IsDateString,
  IsNumber,
  Min,
  Max,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum ComparisonMetric {
  SENTIMENT = 'sentiment',
  MENTION_VOLUME = 'mention_volume',
  ENGAGEMENT = 'engagement',
  TOPIC_ANALYSIS = 'topic_analysis',
  INFLUENCER_OVERLAP = 'influencer_overlap',
  COMPETITIVE_LANDSCAPE = 'competitive_landscape',
  TEMPORAL_TRENDS = 'temporal_trends',
}

export class BrandComparisonRequestDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(2, { message: 'At least 2 brands are required for comparison' })
  brands: string[];

  @IsOptional()
  @IsArray()
  @IsEnum(ComparisonMetric, { each: true })
  metrics?: ComparisonMetric[] = [
    ComparisonMetric.SENTIMENT,
    ComparisonMetric.MENTION_VOLUME,
    ComparisonMetric.ENGAGEMENT,
    ComparisonMetric.TOPIC_ANALYSIS,
  ];

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(1000)
  @Type(() => Number)
  limit?: number = 50;

  @IsOptional()
  @IsString()
  timeGranularity?: 'hour' | 'day' | 'week' | 'month' = 'day';

  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(1.0)
  @Type(() => Number)
  confidenceThreshold?: number = 0.5;
}

export class SentimentComparisonDto {
  brand: string;
  positive: number;
  negative: number;
  neutral: number;
  total: number;
  averageScore: number;
  trend: 'increasing' | 'decreasing' | 'stable';
}

export class MentionVolumeDto {
  brand: string;
  totalMentions: number;
  uniqueAuthors: number;
  averagePerDay: number;
  peakDate: string;
  peakMentions: number;
}

export class EngagementMetricsDto {
  brand: string;
  totalLikes: number;
  totalShares: number;
  totalComments: number;
  averageEngagementRate: number;
  topPerformingPost: {
    content: string;
    engagement: number;
    date: string;
  };
}

export class TopicAnalysisDto {
  brand: string;
  topics: Array<{
    topic: string;
    frequency: number;
    sentiment: number;
    uniqueAuthors: number;
  }>;
  uniqueTopics: string[];
  sharedTopics: string[];
}

export class InfluencerOverlapDto {
  brand1: string;
  brand2: string;
  sharedInfluencers: Array<{
    influencer: string;
    mentions1: number;
    mentions2: number;
    overlapScore: number;
  }>;
  overlapCoefficient: number;
  uniqueInfluencers1: number;
  uniqueInfluencers2: number;
}

export class CompetitiveLandscapeDto {
  brand: string;
  competitors: Array<{
    competitor: string;
    coMentionFrequency: number;
    competitiveSentiment: number;
    marketPosition: 'leader' | 'challenger' | 'follower' | 'niche';
  }>;
  marketShare: number;
  competitiveIntensity: number;
}

export class TemporalTrendDto {
  date: string;
  data: Record<string, number>;
}

export class BrandComparisonResponseDto {
  brands: string[];
  comparisonDate: string;
  metrics: {
    sentiment?: SentimentComparisonDto[];
    mentionVolume?: MentionVolumeDto[];
    engagement?: EngagementMetricsDto[];
    topicAnalysis?: TopicAnalysisDto[];
    influencerOverlap?: InfluencerOverlapDto[];
    competitiveLandscape?: CompetitiveLandscapeDto[];
    temporalTrends?: TemporalTrendDto[];
  };
  summary: {
    totalBrands: number;
    analysisPeriod: {
      start: string;
      end: string;
    };
    keyInsights: string[];
    recommendations: string[];
  };
}
