import { Entity, Column, ManyToOne, RelationId } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { User } from '../../user/user.entity';
import { Exclude } from 'class-transformer';

@Entity({ name: 'prompts' })
export class Prompt extends BaseEntity {
  @Column({ length: 255, nullable: false })
  name: string;

  @Column('text', { nullable: false })
  systemPrompt: string;

  @Column('text', { nullable: true })
  userPromptTemplate: string;

  @Column('text', { nullable: true })
  description: string;

  @Column('jsonb', { nullable: true })
  jsonSchema: object;

  @Column({ length: 50, default: 'intention' })
  type: string; // 'intention', 'chat', 'system', etc.

  @Column({ default: false })
  isGlobal: boolean;

  @Column({ default: true })
  isActive: boolean;

  // Foreign key column
  @Exclude({ toPlainOnly: true })
  @Column('uuid')
  @RelationId((prompt: Prompt) => prompt.user)
  userId: string;

  // Relationships
  @ManyToOne(() => User, (user) => user.prompts)
  user: User;
}
