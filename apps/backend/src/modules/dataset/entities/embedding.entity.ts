import { Exclude } from 'class-transformer';
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

  @Column({ length: 255, default: 'Qwen/Qwen3-Embedding-8B' })
  modelName: string;

  @Column({ length: 64 })
  hash: string;

  @Exclude({ toPlainOnly: true })
  @Column({
    type: 'vector',
    nullable: true,
  })
  embedding: number[];

  @CreateDateColumn()
  createdAt: Date;

  @Column({ length: 255, default: '' })
  providerName: string;
}
