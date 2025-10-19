import { Entity, Column, ManyToOne, OneToMany, RelationId } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Dataset } from '../../dataset/entities/dataset.entity';
import { Document } from '../../dataset/entities/document.entity';
import { DocumentSegment } from '../../dataset/entities/document-segment.entity';
import { GraphEdge } from './graph-edge.entity';
import { Exclude } from 'class-transformer';

export enum NodeType {
  AUTHOR = 'author',
  BRAND = 'brand',
  TOPIC = 'topic',
  HASHTAG = 'hashtag',
  INFLUENCER = 'influencer',
  LOCATION = 'location',
  ORGANIZATION = 'organization',
  PRODUCT = 'product',
  EVENT = 'event',
}

@Entity({ name: 'graph_nodes' })
export class GraphNode extends BaseEntity {
  @Column('uuid')
  @RelationId((node: GraphNode) => node.dataset)
  datasetId: string;

  @Column('uuid')
  @RelationId((node: GraphNode) => node.document)
  documentId: string;

  @Column('uuid', { nullable: true })
  @RelationId((node: GraphNode) => node.segment)
  segmentId: string;

  @Column({
    type: 'enum',
    enum: NodeType,
    default: NodeType.AUTHOR,
  })
  nodeType: NodeType;

  @Column({ length: 255 })
  label: string;

  @Column('jsonb', { nullable: true })
  properties: {
    normalized_name?: string;
    channel?: string;
    platform?: string;
    verified?: boolean;
    follower_count?: number;
    engagement_rate?: number;
    sentiment_score?: number;
    confidence?: number;
    temporal_data?: {
      first_mentioned: Date;
      last_mentioned: Date;
      mention_count: number;
    };
    [key: string]: any;
  };

  // Foreign key column
  @Exclude({ toPlainOnly: true })
  @Column('uuid')
  @RelationId((node: GraphNode) => node.user)
  userId: string;

  // Relationships
  @ManyToOne('User', 'graphNodes')
  user: any;

  @ManyToOne(() => Dataset, (dataset) => dataset.graphNodes)
  dataset: Dataset;

  @ManyToOne(() => Document, (document) => document.graphNodes)
  document: Document;

  @ManyToOne(() => DocumentSegment, (segment) => segment.graphNodes, {
    nullable: true,
  })
  segment: DocumentSegment;

  @OneToMany(() => GraphEdge, (edge) => edge.sourceNode)
  outgoingEdges: GraphEdge[];

  @OneToMany(() => GraphEdge, (edge) => edge.targetNode)
  incomingEdges: GraphEdge[];
}
