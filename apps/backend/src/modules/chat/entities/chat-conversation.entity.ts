import { Entity, Column, OneToMany, ManyToOne, RelationId } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { User } from '../../user/user.entity';
import { Dataset } from '../../dataset/entities/dataset.entity';
import { ChatMessage } from './chat-message.entity';

@Entity({ name: 'chat_conversations' })
export class ChatConversation extends BaseEntity {
  @Column({ length: 255, nullable: false })
  title: string;

  @Column('text', { nullable: true })
  description: string;

  @Column('jsonb', { nullable: true })
  selectedDocumentIds: string[]; // Array of document IDs for this conversation

  @Column('jsonb', { nullable: true })
  selectedSegmentIds: string[]; // Array of segment IDs for this conversation

  @Column('jsonb', { nullable: true })
  metadata: object;

  @Column('uuid', { nullable: true })
  @RelationId((conversation: ChatConversation) => conversation.user)
  userId: string;

  @Column('uuid', { nullable: true })
  @RelationId((conversation: ChatConversation) => conversation.dataset)
  datasetId: string;

  // Relationships
  @ManyToOne(() => User, (user) => user.id)
  user: User;

  @ManyToOne(() => Dataset, (dataset) => dataset.id)
  dataset: Dataset;

  @OneToMany(() => ChatMessage, (message) => message.conversation)
  messages: ChatMessage[];
}
