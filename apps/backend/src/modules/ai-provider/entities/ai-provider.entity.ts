import { Entity, Column, ManyToOne, RelationId } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Exclude } from 'class-transformer';

@Entity({ name: 'ai_providers' })
export class AiProvider extends BaseEntity {
  @Column({ length: 255, nullable: false })
  name: string;

  @Column({
    type: 'enum',
    enum: [
      'openai',
      'anthropic',
      'openrouter',
      'dashscope',
      'perplexity',
      'ollama',
      'custom',
    ],
    default: 'openai',
  })
  type:
    | 'openai'
    | 'anthropic'
    | 'openrouter'
    | 'dashscope'
    | 'perplexity'
    | 'ollama'
    | 'custom';

  @Column({ length: 500, nullable: true })
  apiKey: string;

  @Column({ length: 500, nullable: true })
  baseUrl: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'jsonb', nullable: true })
  models: Array<{
    id: string;
    name: string;
    description?: string;
    maxTokens?: number;
    contextWindow?: number;
    pricing?: {
      input: number;
      output: number;
    };
  }>;

  // Foreign key column
  @Exclude({ toPlainOnly: true })
  @Column('uuid')
  @RelationId((aiProvider: AiProvider) => aiProvider.user)
  userId: string;

  // Relationships
  @ManyToOne('User', 'aiProviders')
  user: any;
}
