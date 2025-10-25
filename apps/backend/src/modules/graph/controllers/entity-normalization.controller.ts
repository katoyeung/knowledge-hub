import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtOrApiKeyAuthGuard } from '@modules/api-key/guards/jwt-or-api-key.guard';
import { EntityNormalizationService } from '../services/entity-normalization.service';
import { NormalizeNodesDto } from '../dto/normalize-nodes.dto';

@ApiTags('Entity Normalization')
@ApiBearerAuth()
@UseGuards(JwtOrApiKeyAuthGuard)
@Controller('graph')
export class EntityNormalizationController {
  constructor(
    private readonly entityNormalizationService: EntityNormalizationService,
  ) {}

  @Post('datasets/:datasetId/normalize')
  @ApiOperation({ summary: 'Trigger normalization job for dataset' })
  @ApiResponse({ status: 200, description: 'Normalization job started' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async triggerNormalization(
    @Param('datasetId', ParseUUIDPipe) datasetId: string,
    @Body() normalizeDto: NormalizeNodesDto,
  ) {
    // If no specific node IDs provided, find duplicates first
    if (!normalizeDto.nodeIds || normalizeDto.nodeIds.length === 0) {
      // Convert entityType to lowercase to match database enum
      const nodeType = normalizeDto.entityType
        ? (normalizeDto.entityType.toLowerCase() as any)
        : undefined;
      const duplicates = await this.entityNormalizationService.findDuplicates(
        datasetId,
        nodeType,
        normalizeDto.similarityThreshold || 0.8,
      );

      return {
        success: true,
        message: `Found ${duplicates.length} duplicate groups`,
        result: {
          normalized: 0,
          duplicates: duplicates.map((group) => ({
            canonicalName: group.canonicalName,
            nodes: group.nodes.map((node) => ({
              id: node.id,
              label: node.label,
              type: node.nodeType,
              createdAt: node.createdAt,
            })),
            similarity: group.similarity,
          })),
          errors: [],
        },
      };
    }

    // If specific node IDs provided, normalize by key
    const result = await this.entityNormalizationService.normalizeNodesByKey(
      datasetId,
      normalizeDto.nodeIds,
      normalizeDto,
    );

    return {
      success: true,
      message: `Normalization completed: ${result.normalized} normalized, ${result.duplicates.length} duplicates found`,
      result,
    };
  }

  @Post('nodes/:nodeId/normalize')
  @ApiOperation({ summary: 'Normalize specific node' })
  @ApiResponse({ status: 200, description: 'Node normalized successfully' })
  @ApiResponse({ status: 404, description: 'Node not found' })
  async normalizeNode(
    @Param('nodeId', ParseUUIDPipe) nodeId: string,
    @Body() body: { datasetId: string; threshold?: number },
  ) {
    // Get the node first
    const node = await this.entityNormalizationService[
      'nodeRepository'
    ].findOne({
      where: { id: nodeId, datasetId: body.datasetId },
    });

    if (!node) {
      throw new Error('Node not found');
    }

    // Find similar nodes
    const similarNodes = await this.entityNormalizationService.findSimilarNodes(
      node,
      body.datasetId,
      body.threshold || 0.8,
    );

    if (similarNodes.length === 0) {
      return {
        success: true,
        message: 'No similar nodes found',
        similarNodes: [],
      };
    }

    return {
      success: true,
      message: `Found ${similarNodes.length} similar nodes`,
      similarNodes: similarNodes.map((similar) => ({
        id: similar.id,
        label: similar.label,
        type: similar.nodeType,
        similarity: this.calculateSimilarity(node.label, similar.label),
      })),
    };
  }

  @Get('datasets/:datasetId/normalization-logs')
  @ApiOperation({ summary: 'Get normalization history' })
  @ApiResponse({ status: 200, description: 'Logs retrieved successfully' })
  async getNormalizationLogs(
    @Param('datasetId', ParseUUIDPipe) datasetId: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    // This would query the normalization logs
    // For now, return empty array
    return {
      logs: [],
      total: 0,
    };
  }

  @Post('datasets/:datasetId/find-duplicates')
  @ApiOperation({ summary: 'Detect potential duplicates' })
  @ApiResponse({ status: 200, description: 'Duplicates detected successfully' })
  async findDuplicates(
    @Param('datasetId', ParseUUIDPipe) datasetId: string,
    @Body()
    body: {
      nodeType?: string;
      threshold?: number;
    },
  ) {
    const duplicates = await this.entityNormalizationService.findDuplicates(
      datasetId,
      body.nodeType as any,
      body.threshold || 0.8,
    );

    return {
      success: true,
      duplicates: duplicates.map((group) => ({
        canonicalName: group.canonicalName,
        nodeCount: group.nodes.length,
        nodes: group.nodes.map((node) => ({
          id: node.id,
          label: node.label,
          type: node.nodeType,
          createdAt: node.createdAt,
        })),
        similarity: group.similarity,
      })),
    };
  }

  @Post('datasets/:datasetId/merge-nodes')
  @ApiOperation({ summary: 'Merge duplicate nodes' })
  @ApiResponse({ status: 200, description: 'Nodes merged successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async mergeNodes(
    @Param('datasetId', ParseUUIDPipe) datasetId: string,
    @Body()
    body: {
      sourceIds: string[];
      targetId: string;
    },
  ) {
    const mergedNode = await this.entityNormalizationService.mergeNodes(
      body.sourceIds,
      body.targetId,
      datasetId,
    );

    return {
      success: true,
      message: `Successfully merged ${body.sourceIds.length} nodes`,
      mergedNode: {
        id: mergedNode.id,
        label: mergedNode.label,
        type: mergedNode.nodeType,
      },
    };
  }

  @Post('datasets/:datasetId/schedule-normalization')
  @ApiOperation({ summary: 'Schedule batch normalization job' })
  @ApiResponse({ status: 200, description: 'Normalization job scheduled' })
  async scheduleNormalization(
    @Param('datasetId', ParseUUIDPipe) datasetId: string,
    @Body()
    body: {
      nodeTypes?: string[];
      similarityThreshold?: number;
      batchSize?: number;
    },
  ) {
    const jobId =
      await this.entityNormalizationService.scheduleNormalizationJob(
        datasetId,
        {
          nodeTypes: body.nodeTypes as any,
          similarityThreshold: body.similarityThreshold,
          batchSize: body.batchSize,
        },
      );

    return {
      success: true,
      message: 'Normalization job scheduled',
      jobId,
    };
  }

  @Get('datasets/:datasetId/normalization-stats')
  @ApiOperation({ summary: 'Get normalization statistics' })
  @ApiResponse({
    status: 200,
    description: 'Statistics retrieved successfully',
  })
  async getNormalizationStats(
    @Param('datasetId', ParseUUIDPipe) datasetId: string,
  ) {
    // This would calculate normalization statistics
    // For now, return mock data
    return {
      totalNormalizations: 0,
      duplicatesFound: 0,
      nodesMerged: 0,
      lastNormalization: null,
      topNormalizedTypes: [],
    };
  }

  private calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) return 1.0;

    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1)
      .fill(null)
      .map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) {
      matrix[0][i] = i;
    }

    for (let j = 0; j <= str2.length; j++) {
      matrix[j][0] = j;
    }

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + indicator,
        );
      }
    }

    return matrix[str2.length][str1.length];
  }
}
