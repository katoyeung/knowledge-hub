import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, In } from 'typeorm';
import { GraphNode, NodeType } from '../entities/graph-node.entity';
import { GraphEdge, EdgeType } from '../entities/graph-edge.entity';
import {
  BrandComparisonRequestDto,
  BrandComparisonResponseDto,
  SentimentComparisonDto,
  MentionVolumeDto,
  EngagementMetricsDto,
  TopicAnalysisDto,
  InfluencerOverlapDto,
  CompetitiveLandscapeDto,
  TemporalTrendDto,
  ComparisonMetric,
} from '../dto/brand-comparison.dto';

@Injectable()
export class BrandComparisonService {
  private readonly logger = new Logger(BrandComparisonService.name);

  constructor(
    @InjectRepository(GraphNode)
    private readonly nodeRepository: Repository<GraphNode>,
    @InjectRepository(GraphEdge)
    private readonly edgeRepository: Repository<GraphEdge>,
  ) {}

  async compareBrands(
    datasetId: string,
    request: BrandComparisonRequestDto,
  ): Promise<BrandComparisonResponseDto> {
    this.logger.log(`Comparing brands: ${request.brands.join(', ')}`);

    const metrics: any = {};
    const keyInsights: string[] = [];
    const recommendations: string[] = [];

    // Execute requested metrics
    if (request.metrics?.includes(ComparisonMetric.SENTIMENT)) {
      metrics.sentiment = await this.compareBrandSentiment(datasetId, request);
    }

    if (request.metrics?.includes(ComparisonMetric.MENTION_VOLUME)) {
      metrics.mentionVolume = await this.compareMentionVolume(
        datasetId,
        request,
      );
    }

    if (request.metrics?.includes(ComparisonMetric.ENGAGEMENT)) {
      metrics.engagement = await this.compareBrandEngagement(
        datasetId,
        request,
      );
    }

    if (request.metrics?.includes(ComparisonMetric.TOPIC_ANALYSIS)) {
      metrics.topicAnalysis = await this.compareBrandTopics(datasetId, request);
    }

    if (request.metrics?.includes(ComparisonMetric.INFLUENCER_OVERLAP)) {
      metrics.influencerOverlap = await this.getBrandMentionNetwork(
        datasetId,
        request,
      );
    }

    if (request.metrics?.includes(ComparisonMetric.COMPETITIVE_LANDSCAPE)) {
      metrics.competitiveLandscape = await this.getCompetitorGraph(
        datasetId,
        request,
      );
    }

    if (request.metrics?.includes(ComparisonMetric.TEMPORAL_TRENDS)) {
      metrics.temporalTrends = await this.getTemporalTrends(datasetId, request);
    }

    // Generate insights and recommendations
    this.generateInsights(metrics, keyInsights, recommendations);

    return {
      brands: request.brands,
      comparisonDate: new Date().toISOString(),
      metrics,
      summary: {
        totalBrands: request.brands.length,
        analysisPeriod: {
          start:
            request.startDate ||
            new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          end: request.endDate || new Date().toISOString(),
        },
        keyInsights,
        recommendations,
      },
    };
  }

  private async compareBrandSentiment(
    datasetId: string,
    request: BrandComparisonRequestDto,
  ): Promise<SentimentComparisonDto[]> {
    const brandNodes = await this.nodeRepository.find({
      where: {
        datasetId,
        nodeType: NodeType.BRAND,
        label: In(request.brands),
      },
    });

    const results: SentimentComparisonDto[] = [];

    for (const brand of brandNodes) {
      const sentimentEdges = await this.edgeRepository.find({
        where: {
          datasetId,
          targetNodeId: brand.id,
          edgeType: EdgeType.SENTIMENT,
        },
        relations: ['sourceNode'],
      });

      const sentimentCounts = {
        positive: 0,
        negative: 0,
        neutral: 0,
        total: 0,
        totalScore: 0,
      };

      sentimentEdges.forEach((edge) => {
        const sentiment = edge.properties?.sentiment;
        const score = edge.properties?.sentiment_score || 0.5;

        sentimentCounts.total++;
        sentimentCounts.totalScore += score;

        if (sentiment === 'positive' || score > 0.6) {
          sentimentCounts.positive++;
        } else if (sentiment === 'negative' || score < 0.4) {
          sentimentCounts.negative++;
        } else {
          sentimentCounts.neutral++;
        }
      });

      const averageScore =
        sentimentCounts.total > 0
          ? sentimentCounts.totalScore / sentimentCounts.total
          : 0.5;
      const trend = this.calculateTrend(sentimentEdges);

      results.push({
        brand: brand.label,
        positive: sentimentCounts.positive,
        negative: sentimentCounts.negative,
        neutral: sentimentCounts.neutral,
        total: sentimentCounts.total,
        averageScore,
        trend,
      });
    }

    return results;
  }

  private async compareMentionVolume(
    datasetId: string,
    request: BrandComparisonRequestDto,
  ): Promise<MentionVolumeDto[]> {
    const brandNodes = await this.nodeRepository.find({
      where: {
        datasetId,
        nodeType: NodeType.BRAND,
        label: In(request.brands),
      },
    });

    const results: MentionVolumeDto[] = [];

    for (const brand of brandNodes) {
      const mentionEdges = await this.edgeRepository.find({
        where: {
          datasetId,
          targetNodeId: brand.id,
          edgeType: EdgeType.MENTIONS,
        },
        relations: ['sourceNode'],
      });

      const uniqueAuthors = new Set(
        mentionEdges.map((edge) => edge.sourceNode.label),
      );
      const totalMentions = mentionEdges.length;
      const averagePerDay = totalMentions / 30; // Assuming 30-day period

      // Find peak date
      const dateGroups = mentionEdges.reduce(
        (acc, edge) => {
          const date = edge.createdAt.toISOString().split('T')[0];
          acc[date] = (acc[date] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      );

      const peakDate = Object.entries(dateGroups).reduce(
        (a, b) => (dateGroups[a[0]] > dateGroups[b[0]] ? a : b),
        ['', 0],
      );

      results.push({
        brand: brand.label,
        totalMentions,
        uniqueAuthors: uniqueAuthors.size,
        averagePerDay,
        peakDate: peakDate[0],
        peakMentions: peakDate[1],
      });
    }

    return results;
  }

  private async compareBrandEngagement(
    datasetId: string,
    request: BrandComparisonRequestDto,
  ): Promise<EngagementMetricsDto[]> {
    const brandNodes = await this.nodeRepository.find({
      where: {
        datasetId,
        nodeType: NodeType.BRAND,
        label: In(request.brands),
      },
    });

    const results: EngagementMetricsDto[] = [];

    for (const brand of brandNodes) {
      const engagementEdges = await this.edgeRepository.find({
        where: {
          datasetId,
          targetNodeId: brand.id,
          edgeType: EdgeType.INTERACTS_WITH,
        },
        relations: ['sourceNode'],
      });

      let totalLikes = 0;
      let totalShares = 0;
      let totalComments = 0;
      let totalEngagement = 0;

      let topPost = { content: '', engagement: 0, date: '' };

      engagementEdges.forEach((edge) => {
        const interactionCount = edge.properties?.interaction_count || 0;
        totalEngagement += interactionCount;

        // This would need to be enhanced based on actual data structure
        if (edge.properties?.type === 'like') totalLikes += interactionCount;
        if (edge.properties?.type === 'share') totalShares += interactionCount;
        if (edge.properties?.type === 'comment')
          totalComments += interactionCount;

        if (interactionCount > topPost.engagement) {
          topPost = {
            content: edge.properties?.context || '',
            engagement: interactionCount,
            date: edge.createdAt.toISOString(),
          };
        }
      });

      const averageEngagementRate =
        engagementEdges.length > 0
          ? totalEngagement / engagementEdges.length
          : 0;

      results.push({
        brand: brand.label,
        totalLikes,
        totalShares,
        totalComments,
        averageEngagementRate,
        topPerformingPost: topPost,
      });
    }

    return results;
  }

  private async compareBrandTopics(
    datasetId: string,
    request: BrandComparisonRequestDto,
  ): Promise<TopicAnalysisDto[]> {
    const brandNodes = await this.nodeRepository.find({
      where: {
        datasetId,
        nodeType: NodeType.BRAND,
        label: In(request.brands),
      },
    });

    const results: TopicAnalysisDto[] = [];

    for (const brand of brandNodes) {
      const topicEdges = await this.edgeRepository.find({
        where: {
          datasetId,
          sourceNodeId: brand.id,
          edgeType: EdgeType.DISCUSSES,
        },
        relations: ['targetNode'],
      });

      const topicMap = new Map<
        string,
        { frequency: number; sentiment: number; authors: Set<string> }
      >();

      topicEdges.forEach((edge) => {
        const topic = edge.targetNode.label;
        const sentiment = edge.properties?.sentiment_score || 0.5;
        const author = edge.sourceNode?.label || 'unknown';

        if (!topicMap.has(topic)) {
          topicMap.set(topic, {
            frequency: 0,
            sentiment: 0,
            authors: new Set(),
          });
        }

        const topicData = topicMap.get(topic)!;
        topicData.frequency++;
        topicData.sentiment += sentiment;
        topicData.authors.add(author);
      });

      const topics = Array.from(topicMap.entries()).map(([topic, data]) => ({
        topic,
        frequency: data.frequency,
        sentiment: data.sentiment / data.frequency,
        uniqueAuthors: data.authors.size,
      }));

      const allTopics = topics.map((t) => t.topic);
      const uniqueTopics = allTopics.filter(
        (topic) =>
          !request.brands.some(
            (brand) => brand !== brand && allTopics.includes(topic),
          ),
      );
      const sharedTopics = allTopics.filter((topic) =>
        request.brands.some(
          (brand) => brand !== brand && allTopics.includes(topic),
        ),
      );

      results.push({
        brand: brand.label,
        topics,
        uniqueTopics,
        sharedTopics,
      });
    }

    return results;
  }

  private async getBrandMentionNetwork(
    datasetId: string,
    request: BrandComparisonRequestDto,
  ): Promise<InfluencerOverlapDto[]> {
    const results: InfluencerOverlapDto[] = [];

    for (let i = 0; i < request.brands.length; i++) {
      for (let j = i + 1; j < request.brands.length; j++) {
        const brand1 = request.brands[i];
        const brand2 = request.brands[j];

        const brand1Node = await this.nodeRepository.findOne({
          where: { datasetId, nodeType: NodeType.BRAND, label: brand1 },
        });

        const brand2Node = await this.nodeRepository.findOne({
          where: { datasetId, nodeType: NodeType.BRAND, label: brand2 },
        });

        if (!brand1Node || !brand2Node) continue;

        // Find influencers who mention both brands
        const brand1Mentions = await this.edgeRepository.find({
          where: {
            datasetId,
            targetNodeId: brand1Node.id,
            edgeType: EdgeType.MENTIONS,
          },
          relations: ['sourceNode'],
        });

        const brand2Mentions = await this.edgeRepository.find({
          where: {
            datasetId,
            targetNodeId: brand2Node.id,
            edgeType: EdgeType.MENTIONS,
          },
          relations: ['sourceNode'],
        });

        const brand1Influencers = new Map(
          brand1Mentions.map((edge) => [edge.sourceNode.label, edge]),
        );
        const brand2Influencers = new Map(
          brand2Mentions.map((edge) => [edge.sourceNode.label, edge]),
        );

        const sharedInfluencers = Array.from(brand1Influencers.keys())
          .filter((influencer) => brand2Influencers.has(influencer))
          .map((influencer) => ({
            influencer,
            mentions1:
              brand1Influencers.get(influencer)?.properties
                ?.interaction_count || 0,
            mentions2:
              brand2Influencers.get(influencer)?.properties
                ?.interaction_count || 0,
            overlapScore: 0, // Calculate based on mention patterns
          }));

        const overlapCoefficient =
          sharedInfluencers.length /
          Math.max(brand1Influencers.size, brand2Influencers.size);

        results.push({
          brand1,
          brand2,
          sharedInfluencers,
          overlapCoefficient,
          uniqueInfluencers1: brand1Influencers.size - sharedInfluencers.length,
          uniqueInfluencers2: brand2Influencers.size - sharedInfluencers.length,
        });
      }
    }

    return results;
  }

  private async getCompetitorGraph(
    datasetId: string,
    request: BrandComparisonRequestDto,
  ): Promise<CompetitiveLandscapeDto[]> {
    const results: CompetitiveLandscapeDto[] = [];

    for (const brand of request.brands) {
      const brandNode = await this.nodeRepository.findOne({
        where: { datasetId, nodeType: NodeType.BRAND, label: brand },
      });

      if (!brandNode) continue;

      // Find competitive edges
      const competitiveEdges = await this.edgeRepository.find({
        where: {
          datasetId,
          sourceNodeId: brandNode.id,
          edgeType: EdgeType.COMPETES_WITH,
        },
        relations: ['targetNode'],
      });

      const competitors = competitiveEdges.map((edge) => ({
        competitor: edge.targetNode.label,
        coMentionFrequency: edge.properties?.interaction_count || 0,
        competitiveSentiment: edge.properties?.sentiment_score || 0.5,
        marketPosition: this.determineMarketPosition(
          edge.properties?.interaction_count || 0,
        ),
      }));

      const marketShare = this.calculateMarketShare(brand, competitors);
      const competitiveIntensity = competitors.length;

      results.push({
        brand,
        competitors,
        marketShare,
        competitiveIntensity,
      });
    }

    return results;
  }

  private async getTemporalTrends(
    datasetId: string,
    request: BrandComparisonRequestDto,
  ): Promise<TemporalTrendDto[]> {
    // This would need to be implemented based on the specific time granularity
    // For now, return a placeholder structure
    return [];
  }

  private calculateTrend(
    edges: GraphEdge[],
  ): 'increasing' | 'decreasing' | 'stable' {
    if (edges.length < 2) return 'stable';

    const sortedEdges = edges.sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );
    const firstHalf = sortedEdges.slice(0, Math.floor(sortedEdges.length / 2));
    const secondHalf = sortedEdges.slice(Math.floor(sortedEdges.length / 2));

    const firstHalfAvg =
      firstHalf.reduce(
        (sum, edge) => sum + (edge.properties?.sentiment_score || 0.5),
        0,
      ) / firstHalf.length;
    const secondHalfAvg =
      secondHalf.reduce(
        (sum, edge) => sum + (edge.properties?.sentiment_score || 0.5),
        0,
      ) / secondHalf.length;

    const diff = secondHalfAvg - firstHalfAvg;
    if (diff > 0.1) return 'increasing';
    if (diff < -0.1) return 'decreasing';
    return 'stable';
  }

  private determineMarketPosition(
    interactionCount: number,
  ): 'leader' | 'challenger' | 'follower' | 'niche' {
    if (interactionCount > 1000) return 'leader';
    if (interactionCount > 500) return 'challenger';
    if (interactionCount > 100) return 'follower';
    return 'niche';
  }

  private calculateMarketShare(brand: string, competitors: any[]): number {
    // Simplified calculation - would need actual market data
    const totalMentions = competitors.reduce(
      (sum, comp) => sum + comp.coMentionFrequency,
      0,
    );
    const brandMentions =
      competitors.find((comp) => comp.competitor === brand)
        ?.coMentionFrequency || 0;
    return totalMentions > 0 ? (brandMentions / totalMentions) * 100 : 0;
  }

  private generateInsights(
    metrics: any,
    keyInsights: string[],
    recommendations: string[],
  ): void {
    // Generate insights based on the metrics
    if (metrics.sentiment) {
      const topBrand = metrics.sentiment.reduce((a: any, b: any) =>
        a.averageScore > b.averageScore ? a : b,
      );
      keyInsights.push(
        `${topBrand.brand} has the highest sentiment score (${topBrand.averageScore.toFixed(2)})`,
      );
    }

    if (metrics.mentionVolume) {
      const mostMentioned = metrics.mentionVolume.reduce((a: any, b: any) =>
        a.totalMentions > b.totalMentions ? a : b,
      );
      keyInsights.push(
        `${mostMentioned.brand} has the highest mention volume (${mostMentioned.totalMentions} mentions)`,
      );
    }

    // Generate recommendations
    if (metrics.sentiment) {
      const lowSentimentBrands = metrics.sentiment.filter(
        (b: any) => b.averageScore < 0.4,
      );
      if (lowSentimentBrands.length > 0) {
        recommendations.push(
          `Consider reputation management for ${lowSentimentBrands.map((b: any) => b.brand).join(', ')}`,
        );
      }
    }

    if (metrics.engagement) {
      const lowEngagementBrands = metrics.engagement.filter(
        (b: any) => b.averageEngagementRate < 10,
      );
      if (lowEngagementBrands.length > 0) {
        recommendations.push(
          `Improve content strategy for ${lowEngagementBrands.map((b: any) => b.brand).join(', ')}`,
        );
      }
    }
  }
}
