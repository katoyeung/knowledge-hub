import { Column, Entity, JoinTable, ManyToMany, OneToMany } from 'typeorm';
import { Exclude } from 'class-transformer';
import { BaseEntity } from '../../common/entities/base.entity';
import { Role } from '@modules/access/entities/role.entity';
import { Dataset } from '@modules/dataset/entities/dataset.entity';
import { Document } from '@modules/dataset/entities/document.entity';
import { DocumentSegment } from '@modules/dataset/entities/document-segment.entity';
import { AiProvider } from '@modules/ai-provider/entities/ai-provider.entity';
import { Prompt } from '@modules/prompts/entities/prompt.entity';

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
  @OneToMany(() => AiProvider, (aiProvider) => aiProvider.user)
  aiProviders: AiProvider[];

  // Prompt relationships
  @OneToMany(() => Prompt, (prompt) => prompt.user)
  prompts: Prompt[];

  // User settings
  @Column('jsonb', { nullable: true, default: {} })
  settings: object;
}
