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
import { PredefinedEntity } from '../../graph/entities/predefined-entity.entity';
import { EntityNormalizationLog } from '../../graph/entities/entity-normalization-log.entity';
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
      useHybridExtraction?: boolean;
      entityMatchingThreshold?: number;
      autoNormalization?: boolean;
      continuousLearning?: boolean;
    };
    chat_settings?: {
      provider?: string;
      model?: string;
      temperature?: number;
      maxChunks?: number;
      promptId?: string;
      bm25Weight?: number;
      embeddingWeight?: number;
      enableConversationHistory?: boolean;
      includeConversationHistory?: boolean;
      conversationHistoryLimit?: number;
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
  @Exclude({ toPlainOnly: true })
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

  @OneToMany(() => PredefinedEntity, (entity) => entity.dataset)
  predefinedEntities: PredefinedEntity[];

  @OneToMany(() => EntityNormalizationLog, (log) => log.dataset)
  entityNormalizationLogs: EntityNormalizationLog[];
}
