import { Injectable, Logger } from '@nestjs/common';
import { EventBusService } from '../services/event-bus.service';
import { EventTypes } from '../constants/event-types';
import { MarketDataEvent } from '../interfaces/event.interface';

@Injectable()
export class MarketDataEventHandler {
  private readonly logger = new Logger(MarketDataEventHandler.name);

  constructor(private readonly eventBus: EventBusService) {
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.eventBus.subscribe(
      EventTypes.MARKET_DATA_UPDATED,
      this.handleMarketDataUpdated.bind(this),
    );
    this.eventBus.subscribe(
      EventTypes.MARKET_DATA_SYNC_STARTED,
      this.handleMarketDataSyncStarted.bind(this),
    );
    this.eventBus.subscribe(
      EventTypes.MARKET_DATA_SYNC_COMPLETED,
      this.handleMarketDataSyncCompleted.bind(this),
    );
    this.eventBus.subscribe(
      EventTypes.MARKET_DATA_SYNC_FAILED,
      this.handleMarketDataSyncFailed.bind(this),
    );
  }

  private handleMarketDataUpdated(event: MarketDataEvent): void {
    this.logger.debug(
      `Market data updated for instrument ${event.payload.instrumentId}`,
      {
        eventType: event.type,
        timestamp: event.timestamp,
      },
    );
  }

  private handleMarketDataSyncStarted(event: MarketDataEvent): void {
    this.logger.debug(
      `Market data sync started for instrument ${event.payload.instrumentId}`,
      {
        eventType: event.type,
        timestamp: event.timestamp,
      },
    );
  }

  private handleMarketDataSyncCompleted(event: MarketDataEvent): void {
    this.logger.debug(
      `Market data sync completed for instrument ${event.payload.instrumentId}`,
      {
        eventType: event.type,
        timestamp: event.timestamp,
      },
    );
  }

  private handleMarketDataSyncFailed(event: MarketDataEvent): void {
    this.logger.error(
      `Market data sync failed for instrument ${event.payload.instrumentId}`,
      {
        eventType: event.type,
        timestamp: event.timestamp,
        error: event.payload.error,
      },
    );
  }
}
