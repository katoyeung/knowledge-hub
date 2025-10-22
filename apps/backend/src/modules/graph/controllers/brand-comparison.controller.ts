import {
  Controller,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { BrandComparisonService } from '../services/brand-comparison.service';
import {
  BrandComparisonRequestDto,
  BrandComparisonResponseDto,
  ComparisonMetric,
} from '../dto/brand-comparison.dto';

@ApiTags('Brand Comparison')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('brand-comparison')
export class BrandComparisonController {
  constructor(
    private readonly brandComparisonService: BrandComparisonService,
  ) {}

  @Post('datasets/:datasetId/compare')
  @ApiOperation({ summary: 'Compare brands in a dataset' })
  @ApiResponse({
    status: 200,
    description: 'Brand comparison completed successfully',
    type: BrandComparisonResponseDto,
  })
  @HttpCode(HttpStatus.OK)
  async compareBrands(
    @Param('datasetId') datasetId: string,
    @Body() request: BrandComparisonRequestDto,
    @Request() req: any,
  ): Promise<{ success: boolean; data: BrandComparisonResponseDto }> {
    const result = await this.brandComparisonService.compareBrands(
      datasetId,
      request,
    );

    return {
      success: true,
      data: result,
    };
  }

  @Post('datasets/:datasetId/sentiment-analysis')
  @ApiOperation({ summary: 'Compare brand sentiment in a dataset' })
  @ApiResponse({
    status: 200,
    description: 'Sentiment analysis completed successfully',
  })
  @HttpCode(HttpStatus.OK)
  async compareBrandSentiment(
    @Param('datasetId') datasetId: string,
    @Body() request: BrandComparisonRequestDto,
    @Request() req: any,
  ) {
    const result = await this.brandComparisonService.compareBrands(datasetId, {
      ...request,
      metrics: [ComparisonMetric.SENTIMENT],
    });

    return {
      success: true,
      data: result.metrics.sentiment,
    };
  }

  @Post('datasets/:datasetId/mention-volume')
  @ApiOperation({ summary: 'Compare brand mention volume in a dataset' })
  @ApiResponse({
    status: 200,
    description: 'Mention volume analysis completed successfully',
  })
  @HttpCode(HttpStatus.OK)
  async compareMentionVolume(
    @Param('datasetId') datasetId: string,
    @Body() request: BrandComparisonRequestDto,
    @Request() req: any,
  ) {
    const result = await this.brandComparisonService.compareBrands(datasetId, {
      ...request,
      metrics: [ComparisonMetric.MENTION_VOLUME],
    });

    return {
      success: true,
      data: result.metrics.mentionVolume,
    };
  }

  @Post('datasets/:datasetId/engagement-analysis')
  @ApiOperation({ summary: 'Compare brand engagement in a dataset' })
  @ApiResponse({
    status: 200,
    description: 'Engagement analysis completed successfully',
  })
  @HttpCode(HttpStatus.OK)
  async compareEngagement(
    @Param('datasetId') datasetId: string,
    @Body() request: BrandComparisonRequestDto,
    @Request() req: any,
  ) {
    const result = await this.brandComparisonService.compareBrands(datasetId, {
      ...request,
      metrics: [ComparisonMetric.ENGAGEMENT],
    });

    return {
      success: true,
      data: result.metrics.engagement,
    };
  }

  @Post('datasets/:datasetId/topic-analysis')
  @ApiOperation({ summary: 'Compare brand topics in a dataset' })
  @ApiResponse({
    status: 200,
    description: 'Topic analysis completed successfully',
  })
  @HttpCode(HttpStatus.OK)
  async compareTopics(
    @Param('datasetId') datasetId: string,
    @Body() request: BrandComparisonRequestDto,
    @Request() req: any,
  ) {
    const result = await this.brandComparisonService.compareBrands(datasetId, {
      ...request,
      metrics: [ComparisonMetric.TOPIC_ANALYSIS],
    });

    return {
      success: true,
      data: result.metrics.topicAnalysis,
    };
  }

  @Post('datasets/:datasetId/influencer-overlap')
  @ApiOperation({ summary: 'Analyze influencer overlap between brands' })
  @ApiResponse({
    status: 200,
    description: 'Influencer overlap analysis completed successfully',
  })
  @HttpCode(HttpStatus.OK)
  async analyzeInfluencerOverlap(
    @Param('datasetId') datasetId: string,
    @Body() request: BrandComparisonRequestDto,
    @Request() req: any,
  ) {
    const result = await this.brandComparisonService.compareBrands(datasetId, {
      ...request,
      metrics: [ComparisonMetric.INFLUENCER_OVERLAP],
    });

    return {
      success: true,
      data: result.metrics.influencerOverlap,
    };
  }

  @Post('datasets/:datasetId/competitive-landscape')
  @ApiOperation({ summary: 'Analyze competitive landscape for brands' })
  @ApiResponse({
    status: 200,
    description: 'Competitive landscape analysis completed successfully',
  })
  @HttpCode(HttpStatus.OK)
  async analyzeCompetitiveLandscape(
    @Param('datasetId') datasetId: string,
    @Body() request: BrandComparisonRequestDto,
    @Request() req: any,
  ) {
    const result = await this.brandComparisonService.compareBrands(datasetId, {
      ...request,
      metrics: [ComparisonMetric.COMPETITIVE_LANDSCAPE],
    });

    return {
      success: true,
      data: result.metrics.competitiveLandscape,
    };
  }

  @Post('datasets/:datasetId/temporal-trends')
  @ApiOperation({ summary: 'Analyze temporal trends for brands' })
  @ApiResponse({
    status: 200,
    description: 'Temporal trends analysis completed successfully',
  })
  @HttpCode(HttpStatus.OK)
  async analyzeTemporalTrends(
    @Param('datasetId') datasetId: string,
    @Body() request: BrandComparisonRequestDto,
    @Request() req: any,
  ) {
    const result = await this.brandComparisonService.compareBrands(datasetId, {
      ...request,
      metrics: [ComparisonMetric.TEMPORAL_TRENDS],
    });

    return {
      success: true,
      data: result.metrics.temporalTrends,
    };
  }
}
