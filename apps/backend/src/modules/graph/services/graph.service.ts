import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, ILike } from 'typeorm';
import { GraphNode, NodeType } from '../entities/graph-node.entity';
import { GraphEdge } from '../entities/graph-edge.entity';
import { GraphQueryDto } from '../dto/graph-query.dto';

@Injectable()
export class GraphService {
  private readonly logger = new Logger(GraphService.name);

  constructor(
    @InjectRepository(GraphNode)
    private readonly nodeRepository: Repository<GraphNode>,
    @InjectRepository(GraphEdge)
    private readonly edgeRepository: Repository<GraphEdge>,
  ) {}

  // Node operations
  async createNode(nodeData: Partial<GraphNode>): Promise<GraphNode> {
    const node = this.nodeRepository.create(nodeData);
    return this.nodeRepository.save(node);
  }

  async createNodes(nodesData: Partial<GraphNode>[]): Promise<GraphNode[]> {
    const nodes = this.nodeRepository.create(nodesData);
    return this.nodeRepository.save(nodes);
  }

  async findNodeById(id: string): Promise<GraphNode> {
    const node = await this.nodeRepository.findOne({
      where: { id },
      relations: [
        'dataset',
        'document',
        'segment',
        'outgoingEdges',
        'incomingEdges',
      ],
    });

    if (!node) {
      throw new NotFoundException(`Node with ID ${id} not found`);
    }

    return node;
  }

  async findNodesByDataset(
    datasetId: string,
    query: GraphQueryDto,
  ): Promise<{ nodes: GraphNode[]; total: number }> {
    const queryBuilder = this.nodeRepository
      .createQueryBuilder('node')
      .leftJoinAndSelect('node.outgoingEdges', 'outgoingEdges')
      .leftJoinAndSelect('node.incomingEdges', 'incomingEdges')
      .where('node.datasetId = :datasetId', { datasetId });

    // Apply filters
    if (query.nodeTypes && query.nodeTypes.length > 0) {
      queryBuilder.andWhere('node.nodeType IN (:...nodeTypes)', {
        nodeTypes: query.nodeTypes,
      });
    }

    if (query.labels && query.labels.length > 0) {
      queryBuilder.andWhere('node.label IN (:...labels)', {
        labels: query.labels,
      });
    }

    if (query.searchTerm) {
      queryBuilder.andWhere('node.label ILIKE :searchTerm', {
        searchTerm: `%${query.searchTerm}%`,
      });
    }

    if (query.startDate && query.endDate) {
      queryBuilder.andWhere('node.createdAt BETWEEN :startDate AND :endDate', {
        startDate: query.startDate,
        endDate: query.endDate,
      });
    }

    if (query.propertiesFilter) {
      Object.entries(query.propertiesFilter).forEach(([key, value]) => {
        queryBuilder.andWhere(`node.properties->>:key = :value`, {
          key,
          value: JSON.stringify(value),
        });
      });
    }

    // Apply sorting
    if (query.sortBy) {
      queryBuilder.orderBy(`node.${query.sortBy}`, query.sortOrder || 'DESC');
    } else {
      queryBuilder.orderBy('node.createdAt', 'DESC');
    }

    // Apply pagination
    queryBuilder.skip(query.offset || 0).take(query.limit || 100);

    const [nodes, total] = await queryBuilder.getManyAndCount();

    return { nodes, total };
  }

  async updateNode(
    id: string,
    updateData: Partial<GraphNode>,
  ): Promise<GraphNode> {
    await this.nodeRepository.update(id, updateData);
    return this.findNodeById(id);
  }

  async deleteNode(id: string): Promise<void> {
    const result = await this.nodeRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Node with ID ${id} not found`);
    }
  }

  // Edge operations
  async createEdge(edgeData: Partial<GraphEdge>): Promise<GraphEdge> {
    const edge = this.edgeRepository.create(edgeData);
    return this.edgeRepository.save(edge);
  }

  async createEdges(edgesData: Partial<GraphEdge>[]): Promise<GraphEdge[]> {
    const edges = this.edgeRepository.create(edgesData);
    return this.edgeRepository.save(edges);
  }

  async findEdgeById(id: string): Promise<GraphEdge> {
    const edge = await this.edgeRepository.findOne({
      where: { id },
      relations: ['sourceNode', 'targetNode', 'dataset'],
    });

    if (!edge) {
      throw new NotFoundException(`Edge with ID ${id} not found`);
    }

    return edge;
  }

  async findEdgesByDataset(
    datasetId: string,
    query: GraphQueryDto,
  ): Promise<{ edges: GraphEdge[]; total: number }> {
    const queryBuilder = this.edgeRepository
      .createQueryBuilder('edge')
      .leftJoinAndSelect('edge.sourceNode', 'sourceNode')
      .leftJoinAndSelect('edge.targetNode', 'targetNode')
      .where('edge.datasetId = :datasetId', { datasetId });

    // Apply filters
    if (query.edgeTypes && query.edgeTypes.length > 0) {
      queryBuilder.andWhere('edge.edgeType IN (:...edgeTypes)', {
        edgeTypes: query.edgeTypes,
      });
    }

    if (query.minWeight !== undefined) {
      queryBuilder.andWhere('edge.weight >= :minWeight', {
        minWeight: query.minWeight,
      });
    }

    if (query.maxWeight !== undefined) {
      queryBuilder.andWhere('edge.weight <= :maxWeight', {
        maxWeight: query.maxWeight,
      });
    }

    if (query.startDate && query.endDate) {
      queryBuilder.andWhere('edge.createdAt BETWEEN :startDate AND :endDate', {
        startDate: query.startDate,
        endDate: query.endDate,
      });
    }

    if (query.propertiesFilter) {
      Object.entries(query.propertiesFilter).forEach(([key, value]) => {
        queryBuilder.andWhere(`edge.properties->>:key = :value`, {
          key,
          value: JSON.stringify(value),
        });
      });
    }

    // Apply sorting
    if (query.sortBy) {
      queryBuilder.orderBy(`edge.${query.sortBy}`, query.sortOrder || 'DESC');
    } else {
      queryBuilder.orderBy('edge.createdAt', 'DESC');
    }

    // Apply pagination
    queryBuilder.skip(query.offset || 0).take(query.limit || 100);

    const [edges, total] = await queryBuilder.getManyAndCount();

    return { edges, total };
  }

  async updateEdge(
    id: string,
    updateData: Partial<GraphEdge>,
  ): Promise<GraphEdge> {
    await this.edgeRepository.update(id, updateData);
    return this.findEdgeById(id);
  }

  async deleteEdge(id: string): Promise<void> {
    const result = await this.edgeRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Edge with ID ${id} not found`);
    }
  }

  // Graph operations
  async getGraphData(
    datasetId: string,
    query: GraphQueryDto,
  ): Promise<{ nodes: GraphNode[]; edges: GraphEdge[]; stats: any }> {
    const [nodesResult, edgesResult] = await Promise.all([
      this.findNodesByDataset(datasetId, query),
      this.findEdgesByDataset(datasetId, query),
    ]);

    const stats = await this.getGraphStats(datasetId);

    return {
      nodes: nodesResult.nodes,
      edges: edgesResult.edges,
      stats,
    };
  }

  async getGraphStats(datasetId: string): Promise<any> {
    const nodeCount = await this.nodeRepository.count({
      where: { datasetId },
    });

    const edgeCount = await this.edgeRepository.count({
      where: { datasetId },
    });

    // Get node type distribution
    const nodeTypeStats = await this.nodeRepository
      .createQueryBuilder('node')
      .select('node.nodeType', 'type')
      .addSelect('COUNT(*)', 'count')
      .where('node.datasetId = :datasetId', { datasetId })
      .groupBy('node.nodeType')
      .getRawMany();

    // Get edge type distribution
    const edgeTypeStats = await this.edgeRepository
      .createQueryBuilder('edge')
      .select('edge.edgeType', 'type')
      .addSelect('COUNT(*)', 'count')
      .where('edge.datasetId = :datasetId', { datasetId })
      .groupBy('edge.edgeType')
      .getRawMany();

    // Get top brands by mention count
    const topBrands = await this.nodeRepository
      .createQueryBuilder('node')
      .select('node.label', 'brand')
      .addSelect('COUNT(edge.id)', 'mentionCount')
      .leftJoin('node.outgoingEdges', 'edge')
      .where('node.datasetId = :datasetId', { datasetId })
      .andWhere('node.nodeType = :nodeType', { nodeType: NodeType.BRAND })
      .groupBy('node.label')
      .orderBy('COUNT(edge.id)', 'DESC')
      .limit(10)
      .getRawMany();

    return {
      totalNodes: nodeCount,
      totalEdges: edgeCount,
      nodeTypeDistribution: nodeTypeStats,
      edgeTypeDistribution: edgeTypeStats,
      topBrands,
    };
  }

  async getGraphDataBySegment(
    segmentId: string,
  ): Promise<{ nodes: any[]; edges: any[] }> {
    // Get all nodes for this segment
    const nodes = await this.nodeRepository.find({
      where: { segmentId },
      relations: ['dataset', 'document', 'segment'],
    });

    // Get all edges where either source or target node belongs to this segment
    const nodeIds = nodes.map((node) => node.id);

    let edges: GraphEdge[] = [];
    if (nodeIds.length > 0) {
      edges = await this.edgeRepository.find({
        where: [{ sourceNodeId: In(nodeIds) }, { targetNodeId: In(nodeIds) }],
        relations: ['sourceNode', 'targetNode'],
      });
    }

    // Transform nodes to match frontend expectations
    const transformedNodes = nodes.map((node) => ({
      id: node.id,
      label: node.label,
      type: node.nodeType, // Map nodeType to type
      properties: node.properties,
    }));

    // Transform edges to match frontend expectations
    const transformedEdges = edges
      .filter((edge) => edge.sourceNode?.label && edge.targetNode?.label)
      .map((edge) => ({
        id: edge.id,
        from: edge.sourceNode.label,
        to: edge.targetNode.label,
        type: edge.edgeType, // Map edgeType to type
        weight: edge.weight,
        properties: edge.properties,
      }));

    return {
      nodes: transformedNodes,
      edges: transformedEdges,
    };
  }

  // Deduplication methods
  async findDuplicateNodes(
    datasetId: string,
    nodeType: NodeType,
    label: string,
  ): Promise<GraphNode[]> {
    return this.nodeRepository.find({
      where: {
        datasetId,
        nodeType,
        label: ILike(label),
      },
    });
  }

  async mergeNodes(
    sourceNodeId: string,
    targetNodeId: string,
  ): Promise<GraphNode> {
    const sourceNode = await this.findNodeById(sourceNodeId);
    const targetNode = await this.findNodeById(targetNodeId);

    // Update all edges pointing to source node to point to target node
    await this.edgeRepository.update(
      { sourceNodeId: sourceNodeId },
      { sourceNodeId: targetNodeId },
    );
    await this.edgeRepository.update(
      { targetNodeId: sourceNodeId },
      { targetNodeId: targetNodeId },
    );

    // Merge properties
    const mergedProperties = {
      ...targetNode.properties,
      ...sourceNode.properties,
    };

    // Update target node with merged properties
    await this.nodeRepository.update(targetNodeId, {
      properties: mergedProperties,
    });

    // Delete source node
    await this.deleteNode(sourceNodeId);

    return this.findNodeById(targetNodeId);
  }

  // Cleanup methods
  async deleteNodesByDataset(datasetId: string): Promise<void> {
    await this.nodeRepository.delete({ datasetId });
  }

  async deleteEdgesByDataset(datasetId: string): Promise<void> {
    await this.edgeRepository.delete({ datasetId });
  }

  async deleteGraphByDataset(datasetId: string): Promise<void> {
    await Promise.all([
      this.deleteEdgesByDataset(datasetId),
      this.deleteNodesByDataset(datasetId),
    ]);
  }
}
