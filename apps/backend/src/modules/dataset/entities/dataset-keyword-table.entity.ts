import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  RelationId,
} from 'typeorm';
import { Dataset } from './dataset.entity';

@Entity({ name: 'dataset_keyword_tables' })
export class DatasetKeywordTable {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { unique: true })
  @RelationId((keywordTable: DatasetKeywordTable) => keywordTable.dataset)
  datasetId: string;

  @Column('text')
  keywordTable: string;

  @Column({ length: 255, default: 'database' })
  dataSourceType: string;

  // Relationship
  @OneToOne(() => Dataset, (dataset) => dataset.keywordTable)
  @JoinColumn({ name: 'datasetId' })
  dataset: Dataset;
}
