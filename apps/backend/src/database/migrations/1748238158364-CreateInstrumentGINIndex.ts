import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateInstrumentGINIndex1748238158364
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create GIN index for instruments fundamentals
    await queryRunner.query(`
      CREATE INDEX instruments_fundamentals_gin_idx 
      ON instruments 
      USING GIN (fundamentals);
    `);

    // Create indexes for market data
    await queryRunner.query(`
      -- Common index for all types
      CREATE INDEX market_data_instrument_type_idx 
      ON market_data (instrument_id, data_type);

      -- Real-time data index (using timestamp)
      CREATE INDEX market_data_realtime_idx 
      ON market_data (instrument_id, timestamp DESC) 
      WHERE data_type = 'realtime';

      -- Historical data index (using date)
      CREATE INDEX market_data_historical_idx 
      ON market_data (instrument_id, date) 
      WHERE data_type = 'historical';

      -- Bulk data index (using date)
      CREATE INDEX market_data_bulk_idx 
      ON market_data (instrument_id, date) 
      WHERE data_type = 'bulk';

      -- Intraday data index (using datetime)
      CREATE INDEX market_data_intraday_idx 
      ON market_data (instrument_id, datetime) 
      WHERE data_type = 'intraday';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS instruments_fundamentals_gin_idx;
      DROP INDEX IF EXISTS market_data_instrument_type_idx;
      DROP INDEX IF EXISTS market_data_realtime_idx;
      DROP INDEX IF EXISTS market_data_historical_idx;
      DROP INDEX IF EXISTS market_data_bulk_idx;
      DROP INDEX IF EXISTS market_data_intraday_idx;
    `);
  }
}
