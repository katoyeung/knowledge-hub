import { Entity, Column, Index, ManyToOne, RelationId } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { User } from '../../user/user.entity';
import { PostStatus } from '../enums/post-status.enum';

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

  @Column({ type: 'timestamp', nullable: true })
  @Index('idx_posts_posted_at')
  postedAt: Date;

  @Column({
    type: 'varchar',
    length: 50,
    default: PostStatus.PENDING,
    nullable: false,
  })
  @Index('idx_posts_status')
  status: PostStatus;

  @Column({ type: 'text', nullable: true })
  approvalReason: string;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  confidenceScore: number;

  // Optional relationships
  @Column('uuid', { nullable: true })
  @RelationId((post: Post) => post.user)
  userId: string;

  @ManyToOne(() => User, { nullable: true })
  user: User;
}
