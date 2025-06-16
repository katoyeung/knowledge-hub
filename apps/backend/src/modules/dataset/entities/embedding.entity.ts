import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity({ name: 'embeddings' })
export class Embedding {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255, default: 'text-embedding-ada-002' })
  modelName: string;

  @Column({ length: 64 })
  hash: string;

  @Column('float', { array: true })
  embedding: number[];

  @CreateDateColumn()
  createdAt: Date;

  @Column({ length: 255, default: '' })
  providerName: string;
}
