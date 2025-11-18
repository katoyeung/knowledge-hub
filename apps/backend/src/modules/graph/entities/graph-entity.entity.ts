import {
  Entity as TypeOrmEntity,
  Column,
  ManyToOne,
  OneToMany,
  RelationId,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import { BaseEntity } from '../../../common/entities/base.entity';
import { EntityAlias } from './entity-alias.entity';

export enum EntitySource {
  MANUAL = 'manual',
  AUTO_DISCOVERED = 'auto_discovered',
  IMPORTED = 'imported',
  LEARNED = 'learned',
}

// Common entity types - flexible, can add custom types
export const COMMON_ENTITY_TYPES = [
  'person',
  'organization',
  'product',
  'event',
  'topic',
  'location',
  'author',
  'brand',
  'hashtag',
  'influencer',
  'concept',
] as const;

@TypeOrmEntity({ name: 'graph_entities' })
export class GraphEntity extends BaseEntity {
  // Optional URI-based global identifier (e.g., wikidata:Q123, https://example.com/entities/123)
  @Column({ type: 'varchar', length: 500, nullable: true, unique: true })
  entityId: string;

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
    industry?: string;
    country?: string; // ISO 3166-1 alpha-2 (e.g., 'HK', 'US')
    region?: string;
    website?: string; // URI
    established?: string; // ISO date-time
    dissolved?: string; // ISO date-time
    geoLocation?: {
      latitude?: number;
      longitude?: number;
      address?: string;
    };
    socialMedia?: Array<{
      platform: string;
      url: string;
    }>;
    legalStatus?:
      | 'public_company'
      | 'private_company'
      | 'non_profit'
      | 'government_entity';
    tags?: string[];
    usage_count?: number;
    last_used?: Date;
    extraction_patterns?: string[];
    [key: string]: any;
  };

  // Cross-references to external databases (e.g., { wikidata: 'Q12345', linkedin: 'company-name' })
  @Column('jsonb', { nullable: true })
  equivalentEntities: Record<string, string>;

  // Provenance information
  @Column('jsonb', { nullable: true })
  provenance: {
    sources?: string[]; // Array of URIs
    dataProvider?: string; // Organization/tool that provided the data
    // lastUpdated is handled by BaseEntity.updatedAt
  };

  // Foreign key column
  @Exclude({ toPlainOnly: true })
  @Column('uuid')
  @RelationId((entity: GraphEntity) => entity.user)
  userId: string;

  // Relationships
  @ManyToOne('User', 'entities')
  user: any;

  @OneToMany(() => EntityAlias, (alias) => alias.entity)
  aliases: EntityAlias[];
}
