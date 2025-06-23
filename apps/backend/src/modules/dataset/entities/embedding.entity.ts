import { Exclude } from 'class-transformer';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity({ name: 'embeddings' })
@Index('idx_embeddings_model_name', ['modelName'])
@Index('idx_embeddings_model_embedding_exists', ['modelName'], {
  where: 'embedding IS NOT NULL',
})
export class Embedding {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255, default: 'Xenova/bge-m3' })
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
