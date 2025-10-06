import { Entity, Column, ManyToOne, RelationId } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { User } from '../../user/user.entity';
import { Dataset } from '../../dataset/entities/dataset.entity';
import { ChatConversation } from './chat-conversation.entity';

export enum MessageRole {
  USER = 'user',
  ASSISTANT = 'assistant',
  SYSTEM = 'system',
}

export enum MessageStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Entity({ name: 'chat_messages' })
export class ChatMessage extends BaseEntity {
  @Column('text', { nullable: false })
  content: string;

  @Column({
    type: 'enum',
    enum: MessageRole,
    default: MessageRole.USER,
  })
  role: MessageRole;

  @Column({
    type: 'enum',
    enum: MessageStatus,
    default: MessageStatus.COMPLETED,
  })
  status: MessageStatus;

  @Column('text', { nullable: true })
  error: string;

  @Column('jsonb', { nullable: true })
  metadata: object;

  @Column('text', { nullable: true })
  sourceChunkIds: string; // JSON string of array of chunk IDs

  @Column('text', { nullable: true })
  sourceDocuments: string; // JSON string of array of document IDs

  @Column('uuid', { nullable: true })
  parentMessageId: string;

  @Column('uuid', { nullable: true })
  @RelationId((message: ChatMessage) => message.user)
  userId: string;

  @Column('uuid', { nullable: true })
  @RelationId((message: ChatMessage) => message.dataset)
  datasetId: string;

  @Column('uuid', { nullable: true })
  @RelationId((message: ChatMessage) => message.conversation)
  conversationId: string;

  // Relationships
  @ManyToOne(() => User, (user) => user.id)
  user: User;

  @ManyToOne(() => Dataset, (dataset) => dataset.id)
  dataset: Dataset;

  @ManyToOne(() => ChatConversation, (conversation) => conversation.messages)
  conversation: ChatConversation;
}
