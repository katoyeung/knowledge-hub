import { Column, Entity, ManyToMany, JoinTable, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Permission } from './permission.entity';
import { User } from '../../user/user.entity';

@Entity('roles')
@Index(['name'], { unique: true })
export class Role extends BaseEntity {
  @Column({ unique: true })
  name: string;

  @ManyToMany(() => Permission)
  @JoinTable({
    name: 'role_permissions',
    joinColumn: { name: 'role_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'permission_id', referencedColumnName: 'id' },
  })
  permissions: Permission[];

  @ManyToMany(() => User)
  @JoinTable({
    name: 'user_roles',
    joinColumn: { name: 'role_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'user_id', referencedColumnName: 'id' },
  })
  users: User[];
}
