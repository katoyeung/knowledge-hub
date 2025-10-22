import { Entity, Column, ManyToOne, RelationId } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Dataset } from '../../dataset/entities/dataset.entity';

export enum NormalizationMethod {
  FUZZY_MATCH = 'fuzzy_match',
  EXACT_MATCH = 'exact_match',
  DICTIONARY_MATCH = 'dictionary_match',
  ML_SUGGESTION = 'ml_suggestion',
  MANUAL = 'manual',
}

@Entity({ name: 'entity_normalization_logs' })
export class EntityNormalizationLog extends BaseEntity {
  @Column('uuid')
  @RelationId((log: EntityNormalizationLog) => log.dataset)
  datasetId: string;

  @Column({ type: 'varchar', length: 255 })
  originalEntity: string;

  @Column({ type: 'varchar', length: 255 })
  normalizedTo: string;

  @Column({ type: 'varchar', length: 50 })
  method: NormalizationMethod;

  @Column({ type: 'decimal', precision: 3, scale: 2 })
  confidence: number;

  // Relationships
  @ManyToOne(() => Dataset, (dataset) => dataset.entityNormalizationLogs)
  dataset: Dataset;
}
