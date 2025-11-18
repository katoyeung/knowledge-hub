import {
  Entity as TypeOrmEntity,
  Column,
  ManyToOne,
  RelationId,
} from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { GraphEntity } from './graph-entity.entity';

export enum AliasType {
  ABBREVIATION = 'abbreviation',
  TRANSLATION = 'translation',
  LOCAL_NAME = 'local_name',
  BRAND_NAME = 'brand_name',
}

@TypeOrmEntity({ name: 'entity_aliases' })
export class EntityAlias extends BaseEntity {
  @Column('uuid')
  @RelationId((alias: EntityAlias) => alias.entity)
  entityId: string;

  @Column({ type: 'varchar', length: 255 })
  alias: string;

  @Column({ type: 'varchar', length: 10, nullable: true })
  language: string; // ISO 639-1 language code (e.g., 'en', 'zh')

  @Column({ type: 'varchar', length: 10, nullable: true })
  script: string; // ISO 15924 script code (e.g., 'Hans', 'Hant', 'Latn')

  @Column({
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  type: AliasType; // abbreviation, translation, local_name, brand_name

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 1.0 })
  similarityScore: number;

  @Column({ type: 'integer', default: 0 })
  matchCount: number;

  @Column({ type: 'timestamp', nullable: true })
  lastMatchedAt: Date;

  // Relationships
  @ManyToOne(() => GraphEntity, (entity) => entity.aliases, {
    onDelete: 'CASCADE',
  })
  entity: GraphEntity;
}
