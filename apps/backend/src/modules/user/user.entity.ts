import { Column, Entity, JoinTable, ManyToMany, OneToMany } from 'typeorm';
import { Exclude } from 'class-transformer';
import { BaseEntity } from '../../common/entities/base.entity';
import { Role } from '@modules/access/entities/role.entity';
import { Dataset } from '@modules/dataset/entities/dataset.entity';
import { Document } from '@modules/dataset/entities/document.entity';
import { DocumentSegment } from '@modules/dataset/entities/document-segment.entity';

@Entity('users')
export class User extends BaseEntity {
  @Column({ nullable: true })
  name?: string;

  @Column({ unique: true })
  email: string;

  @Exclude({ toPlainOnly: true })
  @Column()
  password: string;

  @ManyToMany(() => Role, (role) => role.users)
  @JoinTable()
  roles: Role[];

  // Dataset relationships
  @OneToMany(() => Dataset, (dataset) => dataset.user)
  datasets: Dataset[];

  @OneToMany(() => Document, (document) => document.user)
  createdDocuments: Document[];

  @OneToMany(() => DocumentSegment, (segment) => segment.user)
  createdSegments: DocumentSegment[];

  // AI Provider relationships
  @OneToMany('AiProvider', 'user')
  aiProviders: any[];

  // Prompt relationships
  @OneToMany('Prompt', 'user')
  prompts: any[];

  // Graph relationships
  @OneToMany('GraphNode', 'user')
  graphNodes: any[];

  @OneToMany('GraphEdge', 'user')
  graphEdges: any[];

  @OneToMany('PredefinedEntity', 'user')
  predefinedEntities: any[];

  // User settings
  @Column('jsonb', { nullable: true, default: {} })
  settings: {
    graph_settings?: {
      aiProviderId?: string;
      model?: string;
      promptId?: string;
      temperature?: number;
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
    [key: string]: any;
  };

  // API Key relationships
  @OneToMany('ApiKey', 'user')
  apiKeys: any[];
}
