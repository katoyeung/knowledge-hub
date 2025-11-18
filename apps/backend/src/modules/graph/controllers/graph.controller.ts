import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpStatus,
  HttpCode,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { GraphService } from '../services/graph.service';
import { GraphQueryService } from '../services/graph-query.service';
import { GraphExtractionService } from '../services/graph-extraction.service';
import { GraphQueryDto } from '../dto/graph-query.dto';
import { CreateGraphExtractionConfigDto } from '../dto/create-graph-extraction-config.dto';
import { CreateGraphNodeDto } from '../dto/create-graph-node.dto';
import { CreateGraphEdgeDto } from '../dto/create-graph-edge.dto';
import { GraphExtractionJob } from '../../queue/jobs/graph/graph-extraction.job';
import { Document } from '../../dataset/entities/document.entity';
import { DocumentSegment } from '../../dataset/entities/document-segment.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BadRequestException } from '@nestjs/common';

@ApiTags('Graph')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('graph')
export class GraphController {
  private readonly logger = new Logger(GraphController.name);

  constructor(
    private readonly graphService: GraphService,
    private readonly graphQueryService: GraphQueryService,
    private readonly graphExtractionService: GraphExtractionService,
    @InjectRepository(Document)
    private readonly documentRepository: Repository<Document>,
    @InjectRepository(DocumentSegment)
    private readonly documentSegmentRepository: Repository<DocumentSegment>,
  ) {}

  @Get('datasets/:datasetId/nodes')
  @ApiOperation({ summary: 'Get graph nodes for a dataset' })
  @ApiResponse({ status: 200, description: 'Nodes retrieved successfully' })
  async getNodes(
    @Param('datasetId') datasetId: string,
    @Query() query: GraphQueryDto,
    @Request() req: any,
  ) {
    const result = await this.graphService.findNodesByDataset(datasetId, query);
    return {
      success: true,
      data: result.nodes,
      total: result.total,
      page: Math.floor((query.offset || 0) / (query.limit || 100)) + 1,
      limit: query.limit || 100,
    };
  }

  @Get('datasets/:datasetId/edges')
  @ApiOperation({ summary: 'Get graph edges for a dataset' })
  @ApiResponse({ status: 200, description: 'Edges retrieved successfully' })
  async getEdges(
    @Param('datasetId') datasetId: string,
    @Query() query: GraphQueryDto,
    @Request() req: any,
  ) {
    const result = await this.graphService.findEdgesByDataset(datasetId, query);
    return {
      success: true,
      data: result.edges,
      total: result.total,
      page: Math.floor((query.offset || 0) / (query.limit || 100)) + 1,
      limit: query.limit || 100,
    };
  }

  @Get('datasets/:datasetId/graph')
  @ApiOperation({ summary: 'Get complete graph data for a dataset' })
  @ApiResponse({
    status: 200,
    description: 'Graph data retrieved successfully',
  })
  async getGraphData(
    @Param('datasetId') datasetId: string,
    @Query() query: GraphQueryDto,
    @Request() req: any,
  ) {
    const result = await this.graphService.getGraphData(datasetId, query);
    return {
      success: true,
      data: result,
    };
  }

  @Get('datasets/:datasetId/stats')
  @ApiOperation({ summary: 'Get graph statistics for a dataset' })
  @ApiResponse({
    status: 200,
    description: 'Graph statistics retrieved successfully',
  })
  async getGraphStats(
    @Param('datasetId') datasetId: string,
    @Query() query: GraphQueryDto,
    @Request() req: any,
  ) {
    const stats = await this.graphService.getGraphStats(datasetId);
    return {
      success: true,
      data: stats,
    };
  }

  @Get('segments/:segmentId/graph')
  @ApiOperation({ summary: 'Get graph data for a specific segment' })
  @ApiResponse({
    status: 200,
    description: 'Graph data for segment retrieved successfully',
  })
  async getSegmentGraphData(
    @Param('segmentId') segmentId: string,
    @Request() req: any,
  ) {
    const result = await this.graphService.getGraphDataBySegment(segmentId);
    return {
      success: true,
      data: result,
    };
  }

  @Post('datasets/:datasetId/extract')
  @ApiOperation({
    summary: 'Trigger graph extraction for a dataset',
    description:
      'Supports both synchronous (syncMode: true) and asynchronous (syncMode: false) execution modes',
  })
  @ApiResponse({
    status: 200,
    description:
      'Graph extraction completed successfully (sync) or job started successfully (async)',
  })
  @HttpCode(HttpStatus.OK)
  async triggerGraphExtraction(
    @Param('datasetId') datasetId: string,
    @Body() config: CreateGraphExtractionConfigDto,
    @Request() req: any,
  ) {
    // Get documents for the dataset
    const documents = await this.documentRepository.find({
      where: { datasetId },
      select: ['id', 'name', 'indexingStatus'],
    });

    if (documents.length === 0) {
      return {
        success: false,
        message: 'No documents found for this dataset',
        totalDocuments: 0,
        totalSegments: 0,
        pendingDocuments: 0,
      };
    }

    // Get total segments count for all documents
    const totalSegments = await this.documentSegmentRepository.count({
      where: { datasetId },
    });

    // Count documents that need processing (not already completed)
    const pendingDocuments = documents.filter(
      (doc) => doc.indexingStatus !== 'completed',
    ).length;

    // Check if sync mode is enabled
    if (config.syncMode) {
      this.logger.log(
        `🔄 Starting synchronous extraction for ${documents.length} documents`,
      );
      // Execute synchronously - process documents one by one
      const results = [];
      let totalNodesCreated = 0;
      let totalEdgesCreated = 0;

      for (const document of documents) {
        this.logger.log(
          `🔄 Processing document: ${document.name} (${document.id})`,
        );
        try {
          // Get document segments
          const segments = await this.documentSegmentRepository.find({
            where: { documentId: document.id, datasetId },
            select: ['id'],
          });

          if (segments.length === 0) {
            results.push({
              documentId: document.id,
              documentName: document.name,
              success: false,
              message: 'No segments found',
              nodesCreated: 0,
              edgesCreated: 0,
            });
            continue;
          }

          const segmentIds = segments.map((segment) => segment.id);
          this.logger.log(
            `🔄 Found ${segments.length} segments for document ${document.name}`,
          );

          // Trigger graph extraction synchronously
          this.logger.log(
            `🔄 Calling extractFromSegments for document ${document.name}`,
          );
          const result = await this.graphExtractionService.extractFromSegments(
            segmentIds,
            datasetId,
            document.id,
            req.user.id,
            config,
          );
          this.logger.log(
            `🔄 Completed extractFromSegments for document ${document.name}: ${result.nodesCreated} nodes, ${result.edgesCreated} edges`,
          );

          totalNodesCreated += result.nodesCreated;
          totalEdgesCreated += result.edgesCreated;

          results.push({
            documentId: document.id,
            documentName: document.name,
            success: true,
            message: `Completed: ${result.nodesCreated} nodes, ${result.edgesCreated} edges`,
            nodesCreated: result.nodesCreated,
            edgesCreated: result.edgesCreated,
          });
        } catch (error) {
          results.push({
            documentId: document.id,
            documentName: document.name,
            success: false,
            message: `Failed: ${error.message}`,
            nodesCreated: 0,
            edgesCreated: 0,
          });
        }
      }

      return {
        success: true,
        message: `Synchronous graph extraction completed for ${documents.length} documents`,
        totalDocuments: documents.length,
        totalSegments,
        totalNodesCreated,
        totalEdgesCreated,
        results,
      };
    } else {
      // Execute asynchronously using queue
      const jobPromises = documents.map((document) =>
        GraphExtractionJob.dispatch({
          documentId: document.id,
          datasetId,
          extractionConfig: config,
          userId: req.user.id,
        }).dispatch(),
      );

      await Promise.all(jobPromises);

      return {
        success: true,
        message: `Graph extraction jobs started for ${documents.length} documents`,
        jobCount: documents.length,
        totalDocuments: documents.length,
        totalSegments,
        pendingDocuments,
        documents: documents.map((doc) => ({
          id: doc.id,
          name: doc.name,
          status: doc.indexingStatus,
        })),
      };
    }
  }

  @Post('documents/:documentId/extract')
  @ApiOperation({ summary: 'Trigger graph extraction for a specific document' })
  @ApiResponse({
    status: 200,
    description: 'Graph extraction job started successfully',
  })
  @HttpCode(HttpStatus.OK)
  async triggerDocumentGraphExtraction(
    @Param('documentId') documentId: string,
    @Body() config: CreateGraphExtractionConfigDto,
    @Request() req: any,
  ) {
    // Get document to verify it exists and get datasetId
    const document = await this.documentRepository.findOne({
      where: { id: documentId },
      select: ['id', 'datasetId'],
    });

    if (!document) {
      return {
        success: false,
        message: 'Document not found',
      };
    }

    // Dispatch extraction job
    await GraphExtractionJob.dispatch({
      documentId,
      datasetId: document.datasetId,
      extractionConfig: config,
      userId: req.user.id,
    }).dispatch();

    return {
      success: true,
      message: 'Graph extraction job started for document',
      documentId,
    };
  }

  @Post('datasets/:datasetId/extract-direct')
  @ApiOperation({
    summary:
      'Trigger direct graph extraction for all documents in dataset (bypasses queue)',
  })
  @ApiResponse({
    status: 200,
    description: 'Graph extraction completed successfully',
  })
  @HttpCode(HttpStatus.OK)
  async triggerDirectDatasetExtraction(
    @Param('datasetId') datasetId: string,
    @Body() config: CreateGraphExtractionConfigDto,
    @Request() req: any,
  ) {
    try {
      const userId = req.user?.id || req.user?.sub;
      if (!userId) {
        throw new BadRequestException('User not authenticated');
      }

      // Get documents for the dataset
      const documents = await this.documentRepository.find({
        where: { datasetId },
        select: ['id', 'name', 'indexingStatus'],
      });

      if (documents.length === 0) {
        return {
          success: false,
          message: 'No documents found for this dataset',
          totalDocuments: 0,
          totalSegments: 0,
          results: [],
        };
      }

      // Get total segments count
      const totalSegments = await this.documentSegmentRepository.count({
        where: { datasetId },
      });

      const results = [];
      let totalNodesCreated = 0;
      let totalEdgesCreated = 0;

      // Process each document directly
      for (const document of documents) {
        try {
          // Get document segments
          const segments = await this.documentSegmentRepository.find({
            where: { documentId: document.id, datasetId },
            select: ['id'],
          });

          if (segments.length === 0) {
            results.push({
              documentId: document.id,
              documentName: document.name,
              success: false,
              message: 'No segments found',
              nodesCreated: 0,
              edgesCreated: 0,
            });
            continue;
          }

          const segmentIds = segments.map((segment) => segment.id);

          // Trigger graph extraction
          const result = await this.graphExtractionService.extractFromSegments(
            segmentIds,
            datasetId,
            document.id,
            userId,
            config,
          );

          totalNodesCreated += result.nodesCreated;
          totalEdgesCreated += result.edgesCreated;

          results.push({
            documentId: document.id,
            documentName: document.name,
            success: true,
            message: `Completed: ${result.nodesCreated} nodes, ${result.edgesCreated} edges`,
            nodesCreated: result.nodesCreated,
            edgesCreated: result.edgesCreated,
          });
        } catch (error) {
          results.push({
            documentId: document.id,
            documentName: document.name,
            success: false,
            message: `Failed: ${error.message}`,
            nodesCreated: 0,
            edgesCreated: 0,
          });
        }
      }

      return {
        success: true,
        message: `Direct graph extraction completed for ${documents.length} documents`,
        totalDocuments: documents.length,
        totalSegments,
        totalNodesCreated,
        totalEdgesCreated,
        results,
      };
    } catch (error) {
      throw new BadRequestException(
        `Failed to trigger direct graph extraction: ${error.message}`,
      );
    }
  }

  @Post('datasets/:datasetId/documents/:documentId/extract-direct')
  @ApiOperation({
    summary: 'Trigger direct graph extraction for a specific document',
  })
  @ApiResponse({
    status: 200,
    description: 'Graph extraction completed successfully',
  })
  @HttpCode(HttpStatus.OK)
  async triggerDirectGraphExtraction(
    @Param('datasetId') datasetId: string,
    @Param('documentId') documentId: string,
    @Request() req: any,
  ) {
    try {
      const userId = req.user?.id || req.user?.sub;
      if (!userId) {
        throw new BadRequestException('User not authenticated');
      }

      // Get document segments for the document
      const segments = await this.documentSegmentRepository.find({
        where: { documentId, datasetId },
        select: ['id'],
      });

      if (segments.length === 0) {
        throw new BadRequestException('No segments found for document');
      }

      const segmentIds = segments.map((segment) => segment.id);

      // Trigger graph extraction using resolved settings
      const result = await this.graphExtractionService.extractFromSegments(
        segmentIds,
        datasetId,
        documentId,
        userId,
        // No config provided - will use resolved settings
      );

      return {
        success: true,
        result,
        message: `Graph extraction completed: ${result.nodesCreated} nodes, ${result.edgesCreated} edges created`,
      };
    } catch (error) {
      throw new BadRequestException(
        `Failed to trigger graph extraction: ${error.message}`,
      );
    }
  }

  @Get('nodes/:nodeId')
  @ApiOperation({ summary: 'Get a specific graph node' })
  @ApiResponse({ status: 200, description: 'Node retrieved successfully' })
  async getNode(@Param('nodeId') nodeId: string, @Request() req: any) {
    const node = await this.graphService.findNodeById(nodeId);
    return {
      success: true,
      data: node,
    };
  }

  @Get('edges/:edgeId')
  @ApiOperation({ summary: 'Get a specific graph edge' })
  @ApiResponse({ status: 200, description: 'Edge retrieved successfully' })
  async getEdge(@Param('edgeId') edgeId: string, @Request() req: any) {
    const edge = await this.graphService.findEdgeById(edgeId);
    return {
      success: true,
      data: edge,
    };
  }

  @Get('datasets/:datasetId/nodes/:nodeId/neighbors')
  @ApiOperation({ summary: 'Get neighbors of a specific node' })
  @ApiResponse({ status: 200, description: 'Neighbors retrieved successfully' })
  async getNodeNeighbors(
    @Param('datasetId') datasetId: string,
    @Param('nodeId') nodeId: string,
    @Request() req: any,
    @Query('depth') depth: number = 1,
    @Query('nodeTypes') nodeTypes?: string,
  ) {
    const parsedNodeTypes = nodeTypes
      ? nodeTypes.split(',').map((t) => t.trim())
      : undefined;
    const result = await this.graphQueryService.findNeighbors(
      datasetId,
      nodeId,
      depth,
      parsedNodeTypes as any,
    );
    return {
      success: true,
      data: result,
    };
  }

  @Get('datasets/:datasetId/shortest-path/:sourceId/:targetId')
  @ApiOperation({ summary: 'Find shortest path between two nodes' })
  @ApiResponse({ status: 200, description: 'Shortest path found successfully' })
  async getShortestPath(
    @Param('datasetId') datasetId: string,
    @Param('sourceId') sourceId: string,
    @Param('targetId') targetId: string,
    @Request() req: any,
    @Query('maxDepth') maxDepth: number = 5,
  ) {
    const result = await this.graphQueryService.findShortestPath(
      datasetId,
      sourceId,
      targetId,
      maxDepth,
    );
    return {
      success: true,
      data: result,
    };
  }

  @Get('datasets/:datasetId/communities')
  @ApiOperation({ summary: 'Detect communities in the graph' })
  @ApiResponse({
    status: 200,
    description: 'Communities detected successfully',
  })
  async getCommunities(
    @Param('datasetId') datasetId: string,
    @Query('minSize') minSize: number = 3,
    @Request() req: any,
  ) {
    const result = await this.graphQueryService.detectCommunities(
      datasetId,
      minSize,
    );
    return {
      success: true,
      data: result,
    };
  }

  @Get('datasets/:datasetId/centrality')
  @ApiOperation({ summary: 'Calculate node centrality measures' })
  @ApiResponse({
    status: 200,
    description: 'Centrality calculated successfully',
  })
  async getCentrality(
    @Param('datasetId') datasetId: string,
    @Query('type') type: 'degree' | 'betweenness' | 'closeness' = 'degree',
    @Query('limit') limit: number = 10,
    @Request() req: any,
  ) {
    const result = await this.graphQueryService.calculateCentrality(
      datasetId,
      type,
      limit,
    );
    return {
      success: true,
      data: result,
    };
  }

  @Get('datasets/:datasetId/influential-nodes')
  @ApiOperation({ summary: 'Find influential nodes in the graph' })
  @ApiResponse({
    status: 200,
    description: 'Influential nodes found successfully',
  })
  async getInfluentialNodes(
    @Param('datasetId') datasetId: string,
    @Request() req: any,
    @Query('nodeType') nodeType?: string,
    @Query('minConnections') minConnections: number = 5,
    @Query('limit') limit: number = 20,
  ) {
    const result = await this.graphQueryService.findInfluentialNodes(
      datasetId,
      nodeType as any,
      minConnections,
      limit,
    );
    return {
      success: true,
      data: result,
    };
  }

  @Get('datasets/:datasetId/bridge-nodes')
  @ApiOperation({ summary: 'Find bridge nodes in the graph' })
  @ApiResponse({ status: 200, description: 'Bridge nodes found successfully' })
  async getBridgeNodes(
    @Param('datasetId') datasetId: string,
    @Query('minBetweenness') minBetweenness: number = 0.1,
    @Request() req: any,
  ) {
    const result = await this.graphQueryService.findBridgeNodes(
      datasetId,
      minBetweenness,
    );
    return {
      success: true,
      data: result,
    };
  }

  @Get('datasets/:datasetId/graph-metrics')
  @ApiOperation({ summary: 'Get graph-level metrics' })
  @ApiResponse({
    status: 200,
    description: 'Graph metrics retrieved successfully',
  })
  async getGraphMetrics(
    @Param('datasetId') datasetId: string,
    @Request() req: any,
  ) {
    const [density, avgPathLength] = await Promise.all([
      this.graphQueryService.getGraphDensity(datasetId),
      this.graphQueryService.getAveragePathLength(datasetId),
    ]);

    return {
      success: true,
      data: {
        density,
        averagePathLength: avgPathLength,
      },
    };
  }

  @Delete('datasets/:datasetId')
  @ApiOperation({ summary: 'Delete all graph data for a dataset' })
  @ApiResponse({ status: 200, description: 'Graph data deleted successfully' })
  @HttpCode(HttpStatus.OK)
  async deleteGraphData(
    @Param('datasetId') datasetId: string,
    @Request() req: any,
  ) {
    await this.graphService.deleteGraphByDataset(datasetId);
    return {
      success: true,
      message: 'Graph data deleted successfully',
    };
  }

  @Delete('segments/:segmentId')
  @ApiOperation({ summary: 'Delete graph data for a specific segment' })
  @ApiResponse({ status: 200, description: 'Graph data deleted successfully' })
  @HttpCode(HttpStatus.OK)
  async deleteSegmentGraphData(
    @Param('segmentId') segmentId: string,
    @Request() req: any,
  ) {
    const result = await this.graphService.deleteGraphBySegment(segmentId);
    return {
      success: true,
      message: `Graph data deleted: ${result.nodesDeleted} nodes, ${result.edgesDeleted} edges removed`,
      nodesDeleted: result.nodesDeleted,
      edgesDeleted: result.edgesDeleted,
    };
  }

  @Post('documents/:documentId/segments/extract')
  @ApiOperation({
    summary: 'Trigger graph extraction for specific segments',
    description: 'Extract graph data from specific document segments',
  })
  @ApiResponse({
    status: 200,
    description: 'Graph extraction completed successfully',
  })
  @HttpCode(HttpStatus.OK)
  async triggerSegmentExtraction(
    @Param('documentId') documentId: string,
    @Body() body: { segmentIds: string[] } & CreateGraphExtractionConfigDto,
    @Request() req: any,
  ) {
    try {
      const userId = req.user?.id || req.user?.sub;
      if (!userId) {
        throw new BadRequestException('User not authenticated');
      }

      const { segmentIds, syncMode, ...config } = body;

      if (!segmentIds || segmentIds.length === 0) {
        throw new BadRequestException('Segment IDs are required');
      }

      // Get the document to find its dataset
      const document = await this.documentRepository.findOne({
        where: { id: documentId },
        select: ['id', 'datasetId'],
      });

      if (!document) {
        throw new BadRequestException('Document not found');
      }

      // Check if syncMode is false - use async job processing
      if (syncMode === false) {
        // Dispatch async job for background processing
        await GraphExtractionJob.dispatch({
          documentId,
          datasetId: document.datasetId,
          segmentIds,
          extractionConfig: config,
          userId,
        }).dispatch();

        return {
          success: true,
          message: `Graph extraction job started for ${segmentIds.length} segments`,
          jobStarted: true,
          segmentCount: segmentIds.length,
        };
      }

      // Synchronous processing (default or syncMode === true)
      const result = await this.graphExtractionService.extractFromSegments(
        segmentIds,
        document.datasetId,
        documentId,
        userId,
        config,
      );

      return {
        success: true,
        message: `Graph extraction completed: ${result.nodesCreated} nodes, ${result.edgesCreated} edges created`,
        nodesCreated: result.nodesCreated,
        edgesCreated: result.edgesCreated,
      };
    } catch (error) {
      throw new BadRequestException(
        `Failed to trigger segment extraction: ${error.message}`,
      );
    }
  }

  @Post('datasets/:datasetId/nodes')
  @ApiOperation({ summary: 'Create a new graph node' })
  @ApiResponse({ status: 201, description: 'Node created successfully' })
  @HttpCode(HttpStatus.CREATED)
  async createNode(
    @Param('datasetId') datasetId: string,
    @Body() createNodeDto: CreateGraphNodeDto,
    @Request() req: any,
  ) {
    const node = await this.graphService.createNode({
      ...createNodeDto,
      datasetId,
      userId: req.user.id,
    });
    return {
      success: true,
      data: node,
    };
  }

  @Post('datasets/:datasetId/nodes/batch')
  @ApiOperation({ summary: 'Create multiple graph nodes' })
  @ApiResponse({ status: 201, description: 'Nodes created successfully' })
  @HttpCode(HttpStatus.CREATED)
  async createNodes(
    @Param('datasetId') datasetId: string,
    @Body() body: { nodes: CreateGraphNodeDto[] },
    @Request() req: any,
  ) {
    if (!body.nodes || !Array.isArray(body.nodes) || body.nodes.length === 0) {
      throw new BadRequestException(
        'Nodes array is required and must not be empty',
      );
    }

    const nodes = await this.graphService.createNodes(
      body.nodes.map((node) => ({
        ...node,
        datasetId,
        userId: req.user.id,
      })),
    );
    return {
      success: true,
      data: nodes,
      count: nodes.length,
    };
  }

  @Post('datasets/:datasetId/edges')
  @ApiOperation({ summary: 'Create a new graph edge' })
  @ApiResponse({ status: 201, description: 'Edge created successfully' })
  @HttpCode(HttpStatus.CREATED)
  async createEdge(
    @Param('datasetId') datasetId: string,
    @Body() createEdgeDto: CreateGraphEdgeDto,
    @Request() req: any,
  ) {
    const edge = await this.graphService.createEdge({
      ...createEdgeDto,
      datasetId,
      userId: req.user.id,
    });
    return {
      success: true,
      data: edge,
    };
  }

  @Post('datasets/:datasetId/edges/batch')
  @ApiOperation({ summary: 'Create multiple graph edges' })
  @ApiResponse({ status: 201, description: 'Edges created successfully' })
  @HttpCode(HttpStatus.CREATED)
  async createEdges(
    @Param('datasetId') datasetId: string,
    @Body() body: { edges: CreateGraphEdgeDto[] },
    @Request() req: any,
  ) {
    if (!body.edges || !Array.isArray(body.edges) || body.edges.length === 0) {
      throw new BadRequestException(
        'Edges array is required and must not be empty',
      );
    }

    const edges = await this.graphService.createEdges(
      body.edges.map((edge) => ({
        ...edge,
        datasetId,
        userId: req.user.id,
      })),
    );
    return {
      success: true,
      data: edges,
      count: edges.length,
    };
  }
}
