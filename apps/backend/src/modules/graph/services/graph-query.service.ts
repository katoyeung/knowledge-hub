import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Between, ILike, FindManyOptions } from 'typeorm';
import { GraphNode, NodeType } from '../entities/graph-node.entity';
import { GraphEdge, EdgeType } from '../entities/graph-edge.entity';
import { GraphQueryDto } from '../dto/graph-query.dto';

export interface GraphTraversalResult {
  path: GraphNode[];
  distance: number;
  edges: GraphEdge[];
}

export interface CommunityDetectionResult {
  communities: Array<{
    id: number;
    nodes: GraphNode[];
    size: number;
    density: number;
  }>;
  modularity: number;
}

export interface CentralityResult {
  node: GraphNode;
  centrality: number;
  rank: number;
}

@Injectable()
export class GraphQueryService {
  private readonly logger = new Logger(GraphQueryService.name);

  constructor(
    @InjectRepository(GraphNode)
    private readonly nodeRepository: Repository<GraphNode>,
    @InjectRepository(GraphEdge)
    private readonly edgeRepository: Repository<GraphEdge>,
  ) {}

  async findShortestPath(
    datasetId: string,
    sourceNodeId: string,
    targetNodeId: string,
    maxDepth: number = 5,
  ): Promise<GraphTraversalResult | null> {
    this.logger.log(
      `Finding shortest path from ${sourceNodeId} to ${targetNodeId}`,
    );

    const visited = new Set<string>();
    const queue: Array<{ nodeId: string; path: string[]; distance: number }> = [
      { nodeId: sourceNodeId, path: [sourceNodeId], distance: 0 },
    ];

    while (queue.length > 0) {
      const { nodeId, path, distance } = queue.shift()!;

      if (nodeId === targetNodeId) {
        // Found target, reconstruct path
        const pathNodes = await this.nodeRepository.find({
          where: { id: In(path) },
        });

        const pathEdges = await this.edgeRepository.find({
          where: {
            datasetId,
            sourceNodeId: In(path.slice(0, -1)),
            targetNodeId: In(path.slice(1)),
          },
        });

        return {
          path: pathNodes,
          distance,
          edges: pathEdges,
        };
      }

      if (distance >= maxDepth) continue;
      if (visited.has(nodeId)) continue;

      visited.add(nodeId);

      // Get outgoing edges
      const outgoingEdges = await this.edgeRepository.find({
        where: {
          datasetId,
          sourceNodeId: nodeId,
        },
        relations: ['targetNode'],
      });

      for (const edge of outgoingEdges) {
        if (!visited.has(edge.targetNodeId)) {
          queue.push({
            nodeId: edge.targetNodeId,
            path: [...path, edge.targetNodeId],
            distance: distance + 1,
          });
        }
      }
    }

    return null; // No path found
  }

  async findNeighbors(
    datasetId: string,
    nodeId: string,
    depth: number = 1,
    nodeTypes?: NodeType[],
  ): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
    const visited = new Set<string>();
    const resultNodes = new Set<string>();
    const resultEdges = new Set<string>();

    const queue: Array<{ nodeId: string; currentDepth: number }> = [
      { nodeId, currentDepth: 0 },
    ];

    while (queue.length > 0) {
      const { nodeId: currentNodeId, currentDepth } = queue.shift()!;

      if (currentDepth >= depth) continue;
      if (visited.has(currentNodeId)) continue;

      visited.add(currentNodeId);

      // Get all edges connected to this node
      const edges = await this.edgeRepository.find({
        where: [
          { datasetId, sourceNodeId: currentNodeId },
          { datasetId, targetNodeId: currentNodeId },
        ],
        relations: ['sourceNode', 'targetNode'],
      });

      for (const edge of edges) {
        resultEdges.add(edge.id);

        const neighborId =
          edge.sourceNodeId === currentNodeId
            ? edge.targetNodeId
            : edge.sourceNodeId;
        const neighborNode =
          edge.sourceNodeId === currentNodeId
            ? edge.targetNode
            : edge.sourceNode;

        if (!visited.has(neighborId)) {
          if (!nodeTypes || nodeTypes.includes(neighborNode.nodeType)) {
            resultNodes.add(neighborId);
            queue.push({ nodeId: neighborId, currentDepth: currentDepth + 1 });
          }
        }
      }
    }

    const nodes = await this.nodeRepository.find({
      where: { id: In(Array.from(resultNodes)) },
    });

    const edges = await this.edgeRepository.find({
      where: { id: In(Array.from(resultEdges)) },
    });

    return { nodes, edges };
  }

  async detectCommunities(
    datasetId: string,
    minCommunitySize: number = 3,
  ): Promise<CommunityDetectionResult> {
    this.logger.log(`Detecting communities in dataset ${datasetId}`);

    // Get all nodes and edges
    const nodes = await this.nodeRepository.find({
      where: { datasetId },
    });

    const edges = await this.edgeRepository.find({
      where: { datasetId },
      relations: ['sourceNode', 'targetNode'],
    });

    // Build adjacency list
    const adjacencyList = new Map<string, Set<string>>();
    nodes.forEach((node) => {
      adjacencyList.set(node.id, new Set());
    });

    edges.forEach((edge) => {
      adjacencyList.get(edge.sourceNodeId)?.add(edge.targetNodeId);
      adjacencyList.get(edge.targetNodeId)?.add(edge.sourceNodeId);
    });

    // Simple community detection using connected components
    const visited = new Set<string>();
    const communities: Array<{
      id: number;
      nodes: GraphNode[];
      size: number;
      density: number;
    }> = [];

    let communityId = 0;

    for (const node of nodes) {
      if (visited.has(node.id)) continue;

      const communityNodes: GraphNode[] = [];
      const stack = [node.id];

      while (stack.length > 0) {
        const currentNodeId = stack.pop()!;
        if (visited.has(currentNodeId)) continue;

        visited.add(currentNodeId);
        const currentNode = nodes.find((n) => n.id === currentNodeId);
        if (currentNode) {
          communityNodes.push(currentNode);
        }

        const neighbors = adjacencyList.get(currentNodeId) || new Set();
        for (const neighborId of neighbors) {
          if (!visited.has(neighborId)) {
            stack.push(neighborId);
          }
        }
      }

      if (communityNodes.length >= minCommunitySize) {
        // Calculate density
        const internalEdges = edges.filter((edge) => {
          const sourceInCommunity = communityNodes.some(
            (n) => n.id === edge.sourceNodeId,
          );
          const targetInCommunity = communityNodes.some(
            (n) => n.id === edge.targetNodeId,
          );
          return sourceInCommunity && targetInCommunity;
        }).length;

        const possibleEdges =
          (communityNodes.length * (communityNodes.length - 1)) / 2;
        const density = possibleEdges > 0 ? internalEdges / possibleEdges : 0;

        communities.push({
          id: communityId++,
          nodes: communityNodes,
          size: communityNodes.length,
          density,
        });
      }
    }

    // Calculate modularity (simplified)
    const modularity = this.calculateModularity(nodes, edges, communities);

    return {
      communities,
      modularity,
    };
  }

  async calculateCentrality(
    datasetId: string,
    centralityType: 'degree' | 'betweenness' | 'closeness' = 'degree',
    limit: number = 10,
  ): Promise<CentralityResult[]> {
    this.logger.log(
      `Calculating ${centralityType} centrality for dataset ${datasetId}`,
    );

    const nodes = await this.nodeRepository.find({
      where: { datasetId },
    });

    const edges = await this.edgeRepository.find({
      where: { datasetId },
    });

    const results: CentralityResult[] = [];

    for (const node of nodes) {
      let centrality = 0;

      switch (centralityType) {
        case 'degree':
          centrality = edges.filter(
            (edge) =>
              edge.sourceNodeId === node.id || edge.targetNodeId === node.id,
          ).length;
          break;

        case 'betweenness':
          centrality = await this.calculateBetweennessCentrality(
            node.id,
            nodes,
            edges,
          );
          break;

        case 'closeness':
          centrality = await this.calculateClosenessCentrality(
            node.id,
            nodes,
            edges,
          );
          break;
      }

      results.push({
        node,
        centrality,
        rank: 0, // Will be set after sorting
      });
    }

    // Sort by centrality and assign ranks
    results.sort((a, b) => b.centrality - a.centrality);
    results.forEach((result, index) => {
      result.rank = index + 1;
    });

    return results.slice(0, limit);
  }

  async findInfluentialNodes(
    datasetId: string,
    nodeType?: NodeType,
    minConnections: number = 5,
    limit: number = 20,
  ): Promise<CentralityResult[]> {
    const centralityResults = await this.calculateCentrality(
      datasetId,
      'degree',
      limit * 2,
    );

    return centralityResults
      .filter((result) => {
        if (nodeType && result.node.nodeType !== nodeType) return false;
        return result.centrality >= minConnections;
      })
      .slice(0, limit);
  }

  async findIsolatedNodes(
    datasetId: string,
    nodeType?: NodeType,
  ): Promise<GraphNode[]> {
    const queryBuilder = this.nodeRepository
      .createQueryBuilder('node')
      .leftJoin('node.outgoingEdges', 'outgoingEdges')
      .leftJoin('node.incomingEdges', 'incomingEdges')
      .where('node.datasetId = :datasetId', { datasetId })
      .andWhere('outgoingEdges.id IS NULL')
      .andWhere('incomingEdges.id IS NULL');

    if (nodeType) {
      queryBuilder.andWhere('node.nodeType = :nodeType', { nodeType });
    }

    return queryBuilder.getMany();
  }

  async findBridgeNodes(
    datasetId: string,
    minBetweenness: number = 0.1,
  ): Promise<CentralityResult[]> {
    const betweennessResults = await this.calculateCentrality(
      datasetId,
      'betweenness',
      50,
    );

    return betweennessResults.filter(
      (result) => result.centrality >= minBetweenness,
    );
  }

  async getGraphDensity(datasetId: string): Promise<number> {
    const nodeCount = await this.nodeRepository.count({ where: { datasetId } });
    const edgeCount = await this.edgeRepository.count({ where: { datasetId } });

    if (nodeCount < 2) return 0;

    const possibleEdges = (nodeCount * (nodeCount - 1)) / 2;
    return edgeCount / possibleEdges;
  }

  async getAveragePathLength(datasetId: string): Promise<number> {
    const nodes = await this.nodeRepository.find({
      where: { datasetId },
    });

    if (nodes.length < 2) return 0;

    const edges = await this.edgeRepository.find({
      where: { datasetId },
    });

    // Build adjacency list
    const adjacencyList = new Map<string, Set<string>>();
    nodes.forEach((node) => {
      adjacencyList.set(node.id, new Set());
    });

    edges.forEach((edge) => {
      adjacencyList.get(edge.sourceNodeId)?.add(edge.targetNodeId);
      adjacencyList.get(edge.targetNodeId)?.add(edge.sourceNodeId);
    });

    let totalPathLength = 0;
    let pathCount = 0;

    // Calculate shortest paths between all pairs
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const pathLength = this.bfsShortestPath(
          nodes[i].id,
          nodes[j].id,
          adjacencyList,
        );

        if (pathLength > 0) {
          totalPathLength += pathLength;
          pathCount++;
        }
      }
    }

    return pathCount > 0 ? totalPathLength / pathCount : 0;
  }

  private async calculateBetweennessCentrality(
    nodeId: string,
    nodes: GraphNode[],
    edges: GraphEdge[],
  ): Promise<number> {
    // Simplified betweenness centrality calculation
    // In a real implementation, this would use the Brandes algorithm
    let betweenness = 0;

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        if (nodes[i].id === nodeId || nodes[j].id === nodeId) continue;

        const shortestPath = this.findShortestPathBetweenNodes(
          nodes[i].id,
          nodes[j].id,
          nodes,
          edges,
        );

        if (shortestPath && shortestPath.includes(nodeId)) {
          betweenness += 1;
        }
      }
    }

    return betweenness;
  }

  private async calculateClosenessCentrality(
    nodeId: string,
    nodes: GraphNode[],
    edges: GraphEdge[],
  ): Promise<number> {
    const distances = new Map<string, number>();
    const visited = new Set<string>();
    const queue: Array<{ nodeId: string; distance: number }> = [
      { nodeId, distance: 0 },
    ];

    while (queue.length > 0) {
      const { nodeId: currentNodeId, distance } = queue.shift()!;

      if (visited.has(currentNodeId)) continue;
      visited.add(currentNodeId);
      distances.set(currentNodeId, distance);

      const connectedEdges = edges.filter(
        (edge) =>
          edge.sourceNodeId === currentNodeId ||
          edge.targetNodeId === currentNodeId,
      );

      for (const edge of connectedEdges) {
        const neighborId =
          edge.sourceNodeId === currentNodeId
            ? edge.targetNodeId
            : edge.sourceNodeId;
        if (!visited.has(neighborId)) {
          queue.push({ nodeId: neighborId, distance: distance + 1 });
        }
      }
    }

    const totalDistance = Array.from(distances.values()).reduce(
      (sum, dist) => sum + dist,
      0,
    );
    return distances.size > 1 ? (distances.size - 1) / totalDistance : 0;
  }

  private calculateModularity(
    nodes: GraphNode[],
    edges: GraphEdge[],
    communities: Array<{ id: number; nodes: GraphNode[] }>,
  ): number {
    // Simplified modularity calculation
    const totalEdges = edges.length;
    if (totalEdges === 0) return 0;

    let modularity = 0;

    for (const community of communities) {
      const communityNodeIds = new Set(community.nodes.map((n) => n.id));
      const internalEdges = edges.filter(
        (edge) =>
          communityNodeIds.has(edge.sourceNodeId) &&
          communityNodeIds.has(edge.targetNodeId),
      ).length;

      const communitySize = community.nodes.length;
      const expectedEdges = (communitySize * (communitySize - 1)) / 2;

      modularity +=
        internalEdges / totalEdges - Math.pow(expectedEdges / totalEdges, 2);
    }

    return modularity;
  }

  private findShortestPathBetweenNodes(
    sourceId: string,
    targetId: string,
    nodes: GraphNode[],
    edges: GraphEdge[],
  ): string[] | null {
    const adjacencyList = new Map<string, Set<string>>();
    nodes.forEach((node) => {
      adjacencyList.set(node.id, new Set());
    });

    edges.forEach((edge) => {
      adjacencyList.get(edge.sourceNodeId)?.add(edge.targetNodeId);
      adjacencyList.get(edge.targetNodeId)?.add(edge.sourceNodeId);
    });

    return this.bfsShortestPathWithPath(sourceId, targetId, adjacencyList);
  }

  private bfsShortestPath(
    sourceId: string,
    targetId: string,
    adjacencyList: Map<string, Set<string>>,
  ): number {
    const visited = new Set<string>();
    const queue: Array<{ nodeId: string; distance: number }> = [
      { nodeId: sourceId, distance: 0 },
    ];

    while (queue.length > 0) {
      const { nodeId, distance } = queue.shift()!;

      if (nodeId === targetId) return distance;
      if (visited.has(nodeId)) continue;

      visited.add(nodeId);

      const neighbors = adjacencyList.get(nodeId) || new Set();
      for (const neighborId of neighbors) {
        if (!visited.has(neighborId)) {
          queue.push({ nodeId: neighborId, distance: distance + 1 });
        }
      }
    }

    return -1; // No path found
  }

  private bfsShortestPathWithPath(
    sourceId: string,
    targetId: string,
    adjacencyList: Map<string, Set<string>>,
  ): string[] | null {
    const visited = new Set<string>();
    const queue: Array<{ nodeId: string; path: string[] }> = [
      { nodeId: sourceId, path: [sourceId] },
    ];

    while (queue.length > 0) {
      const { nodeId, path } = queue.shift()!;

      if (nodeId === targetId) return path;
      if (visited.has(nodeId)) continue;

      visited.add(nodeId);

      const neighbors = adjacencyList.get(nodeId) || new Set();
      for (const neighborId of neighbors) {
        if (!visited.has(neighborId)) {
          queue.push({ nodeId: neighborId, path: [...path, neighborId] });
        }
      }
    }

    return null; // No path found
  }
}
