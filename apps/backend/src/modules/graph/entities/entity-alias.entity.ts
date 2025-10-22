import { Entity, Column, ManyToOne, RelationId } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { PredefinedEntity } from './predefined-entity.entity';

@Entity({ name: 'entity_aliases' })
export class EntityAlias extends BaseEntity {
  @Column('uuid')
  @RelationId((alias: EntityAlias) => alias.predefinedEntity)
  predefinedEntityId: string;

  @Column({ type: 'varchar', length: 255 })
  alias: string;

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 1.0 })
  similarityScore: number;

  @Column({ type: 'integer', default: 0 })
  matchCount: number;

  @Column({ type: 'timestamp', nullable: true })
  lastMatchedAt: Date;

  // Relationships
  @ManyToOne(() => PredefinedEntity, (entity) => entity.aliases, {
    onDelete: 'CASCADE',
  })
  predefinedEntity: PredefinedEntity;
}
