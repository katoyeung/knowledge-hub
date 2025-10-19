import { Entity, Column, ManyToOne, RelationId } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Dataset } from '../../dataset/entities/dataset.entity';
import { GraphNode } from './graph-node.entity';
import { Exclude } from 'class-transformer';

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

@Entity({ name: 'graph_edges' })
export class GraphEdge extends BaseEntity {
  @Column('uuid')
  @RelationId((edge: GraphEdge) => edge.dataset)
  datasetId: string;

  @Column('uuid')
  @RelationId((edge: GraphEdge) => edge.sourceNode)
  sourceNodeId: string;

  @Column('uuid')
  @RelationId((edge: GraphEdge) => edge.targetNode)
  targetNodeId: string;

  @Column({
    type: 'enum',
    enum: EdgeType,
    default: EdgeType.MENTIONS,
  })
  edgeType: EdgeType;

  @Column('decimal', { precision: 10, scale: 4, default: 1.0 })
  weight: number;

  @Column('jsonb', { nullable: true })
  properties: {
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
    [key: string]: any;
  };

  // Foreign key column
  @Exclude({ toPlainOnly: true })
  @Column('uuid')
  @RelationId((edge: GraphEdge) => edge.user)
  userId: string;

  // Relationships
  @ManyToOne('User', 'graphEdges')
  user: any;

  @ManyToOne(() => Dataset, (dataset) => dataset.graphEdges)
  dataset: Dataset;

  @ManyToOne(() => GraphNode, (node) => node.outgoingEdges, {
    onDelete: 'CASCADE',
  })
  sourceNode: GraphNode;

  @ManyToOne(() => GraphNode, (node) => node.incomingEdges, {
    onDelete: 'CASCADE',
  })
  targetNode: GraphNode;
}
