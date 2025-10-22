import { Entity, Column, ManyToOne, OneToMany, RelationId } from 'typeorm';
import { Exclude } from 'class-transformer';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Dataset } from '../../dataset/entities/dataset.entity';
import { EntityAlias } from './entity-alias.entity';

export enum EntitySource {
  MANUAL = 'manual',
  AUTO_DISCOVERED = 'auto_discovered',
  IMPORTED = 'imported',
  LEARNED = 'learned',
}

@Entity({ name: 'predefined_entities' })
export class PredefinedEntity extends BaseEntity {
  @Column('uuid')
  @RelationId((entity: PredefinedEntity) => entity.dataset)
  datasetId: string;

  @Column({ type: 'varchar', length: 50 })
  entityType: string;

  @Column({ type: 'varchar', length: 255 })
  canonicalName: string;

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0.8 })
  confidenceScore: number;

  @Column({ type: 'varchar', length: 50, default: EntitySource.MANUAL })
  source: EntitySource;

  @Column('jsonb', { nullable: true })
  metadata: {
    description?: string;
    category?: string;
    tags?: string[];
    usage_count?: number;
    last_used?: Date;
    extraction_patterns?: string[];
    [key: string]: any;
  };

  // Foreign key column
  @Exclude({ toPlainOnly: true })
  @Column('uuid')
  @RelationId((entity: PredefinedEntity) => entity.user)
  userId: string;

  // Relationships
  @ManyToOne('User', 'predefinedEntities')
  user: any;

  @ManyToOne(() => Dataset, (dataset) => dataset.predefinedEntities)
  dataset: Dataset;

  @OneToMany(() => EntityAlias, (alias) => alias.predefinedEntity)
  aliases: EntityAlias[];
}
