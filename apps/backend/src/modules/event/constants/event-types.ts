// src/modules/event/constants/event-types.ts
export enum EventTypes {
  // Instrument Events
  INSTRUMENT_CREATED = 'instrument.created',
  INSTRUMENT_UPDATED = 'instrument.updated',
  INSTRUMENT_DELETED = 'instrument.deleted',
  INSTRUMENT_SYNC_STARTED = 'instrument.sync.started',
  INSTRUMENT_SYNC_COMPLETED = 'instrument.sync.completed',
  INSTRUMENT_SYNC_FAILED = 'instrument.sync.failed',

  // Market Data Events
  MARKET_DATA_UPDATED = 'market.data.updated',
  MARKET_DATA_SYNC_STARTED = 'market.data.sync.started',
  MARKET_DATA_SYNC_COMPLETED = 'market.data.sync.completed',
  MARKET_DATA_SYNC_FAILED = 'market.data.sync.failed',

  // Queue Events
  QUEUE_JOB_ADDED = 'queue.job.added',
  QUEUE_JOB_STARTED = 'queue.job.started',
  QUEUE_JOB_COMPLETED = 'queue.job.completed',
  QUEUE_JOB_FAILED = 'queue.job.failed',
  QUEUE_JOB_RETRY = 'queue.job.retry',

  // System Events
  SYSTEM_ERROR = 'system.error',
  SYSTEM_WARNING = 'system.warning',
  SYSTEM_INFO = 'system.info',

  // Screener Events
  SCREENER_CREATED = 'screener.created',
  SCREENER_UPDATED = 'screener.updated',
  SCREENER_DELETED = 'screener.deleted',
  SCREENER_SYNC_STARTED = 'screener.sync.started',
  SCREENER_SYNC_COMPLETED = 'screener.sync.completed',

  // Indicator Events
  INDICATOR_CALCULATED = 'indicator.calculated',
  INDICATOR_UPDATED = 'indicator.updated',
}

// src/modules/event/interfaces/event.interface.ts
export interface BaseEvent {
  type: EventTypes;
  payload: any;
  timestamp: number;
}

export interface InstrumentEvent extends BaseEvent {
  type:
    | EventTypes.INSTRUMENT_CREATED
    | EventTypes.INSTRUMENT_UPDATED
    | EventTypes.INSTRUMENT_DELETED
    | EventTypes.INSTRUMENT_SYNC_STARTED
    | EventTypes.INSTRUMENT_SYNC_COMPLETED
    | EventTypes.INSTRUMENT_SYNC_FAILED;
  payload: {
    instrumentId: number;
    data?: any;
  };
}

export interface MarketDataEvent extends BaseEvent {
  type:
    | EventTypes.MARKET_DATA_UPDATED
    | EventTypes.MARKET_DATA_SYNC_STARTED
    | EventTypes.MARKET_DATA_SYNC_COMPLETED
    | EventTypes.MARKET_DATA_SYNC_FAILED;
  payload: {
    instrumentId: number;
    dataType: string;
    data?: any;
  };
}
