import {
  Entity,
  Column,
  ManyToOne,
  OneToMany,
  OneToOne,
  RelationId,
} from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { User } from '../../user/user.entity';
import { Document } from './document.entity';
import { DocumentSegment } from './document-segment.entity';
import { DatasetKeywordTable } from './dataset-keyword-table.entity';
import { GraphNode } from '../../graph/entities/graph-node.entity';
import { GraphEdge } from '../../graph/entities/graph-edge.entity';
import { Exclude } from 'class-transformer';

@Entity({ name: 'datasets' })
export class Dataset extends BaseEntity {
  @Column({ length: 255, nullable: false })
  name: string;

  @Column('text', { nullable: true })
  description: string;

  @Column({ length: 255, default: 'vendor' })
  provider: string;

  @Column({ length: 255, default: 'only_me' })
  permission: string;

  @Column({ length: 255, nullable: true })
  dataSourceType: string;

  @Column({ length: 255, nullable: true })
  indexingTechnique: string;

  @Column('text', { nullable: true })
  indexStruct: string;

  @Column({ length: 255, nullable: true })
  embeddingModel: string;

  @Column({ length: 255, nullable: true })
  embeddingModelProvider: string;

  @Column('uuid', { nullable: true })
  collectionBindingId: string;

  @Column('jsonb', { nullable: true })
  retrievalModel: object;

  // 🆕 Settings Configuration
  @Column('jsonb', { nullable: true })
  settings: {
    graph_settings?: {
      aiProviderId?: string;
      model?: string;
      promptId?: string;
      temperature?: number;
    };
    graphExtractionEnabled?: boolean;
    graphExtractionConfig?: {
      promptId?: string;
      aiProviderId?: string;
      model?: string;
      temperature?: number;
      enableDeduplication?: boolean;
      batchSize?: number;
      confidenceThreshold?: number;
    };
    [key: string]: any;
  };

  // Foreign key column
  @Exclude({ toPlainOnly: true })
  @Column('uuid')
  @RelationId((dataset: Dataset) => dataset.user)
  userId: string;

  // Relationships
  @ManyToOne(() => User, (user) => user.datasets)
  user: User;

  @OneToMany(() => Document, (document) => document.dataset)
  documents: Document[];

  @OneToMany(() => DocumentSegment, (segment) => segment.dataset)
  segments: DocumentSegment[];

  @OneToOne(() => DatasetKeywordTable, (keywordTable) => keywordTable.dataset)
  keywordTable: DatasetKeywordTable;

  @OneToMany(() => GraphNode, (node) => node.dataset)
  graphNodes: GraphNode[];

  @OneToMany(() => GraphEdge, (edge) => edge.dataset)
  graphEdges: GraphEdge[];
}
