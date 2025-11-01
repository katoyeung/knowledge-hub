import { Entity, Column, Index, ManyToOne, RelationId } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { User } from '../../user/user.entity';
import { Dataset } from '../../dataset/entities/dataset.entity';

@Entity({ name: 'posts' })
export class Post extends BaseEntity {
  @Column({ type: 'varchar', length: 255, unique: true, nullable: false })
  @Index('idx_posts_hash', { unique: true })
  hash: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  @Index('idx_posts_provider')
  provider: string; // e.g., "google api", "lenx api"

  @Column({ type: 'varchar', length: 255, nullable: true })
  @Index('idx_posts_source')
  source: string; // e.g., "facebook", "twitter"

  @Column({ type: 'text', nullable: true })
  @Index('idx_posts_title')
  title: string;

  @Column('jsonb', { nullable: true })
  meta: Record<string, any>; // Content is stored in meta.content

  // Optional relationships
  @Column('uuid', { nullable: true })
  @RelationId((post: Post) => post.user)
  userId: string;

  @Column('uuid', { nullable: true })
  @RelationId((post: Post) => post.dataset)
  datasetId: string;

  @ManyToOne(() => User, { nullable: true })
  user: User;

  @ManyToOne(() => Dataset, { nullable: true })
  dataset: Dataset;
}
