import { Column, Entity, JoinTable, ManyToMany, OneToMany } from 'typeorm';
import { Exclude } from 'class-transformer';
import { BaseEntity } from '../../common/entities/base.entity';
import { Role } from '@modules/access/entities/role.entity';

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
  @OneToMany('Dataset', 'owner')
  datasets: any[];

  @OneToMany('Document', 'creator')
  createdDocuments: any[];

  @OneToMany('DocumentSegment', 'creator')
  createdSegments: any[];
}
