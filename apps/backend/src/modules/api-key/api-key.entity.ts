import { Column, Entity, ManyToOne, RelationId } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { User } from '@modules/user/user.entity';

@Entity('api_keys')
export class ApiKey extends BaseEntity {
  @Column({ length: 255 })
  name: string;

  @Column({ unique: true })
  keyHash: string; // bcrypt hash of the full key

  @Column({ length: 20 })
  prefix: string; // e.g., "sk-abc123..." for display

  @Column('uuid')
  @RelationId((apiKey: ApiKey) => apiKey.user)
  userId: string;

  @Column({ nullable: true })
  lastUsedAt: Date;

  @ManyToOne(() => User, (user) => user.apiKeys)
  user: User;
}
