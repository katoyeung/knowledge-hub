import { Column, Entity, Index, ManyToMany } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Role } from './role.entity';

@Entity('permissions')
@Index(['name'], { unique: true })
@Index(['resource', 'action'], { unique: true })
export class Permission extends BaseEntity {
  @Column({ unique: true })
  name: string;

  @Column()
  resource: string;

  @Column()
  action: string;

  @ManyToMany(() => Role, (role) => role.permissions)
  roles: Role[];
}
