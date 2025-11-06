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

  // Document Events
  DOCUMENT_UPLOADED = 'document.uploaded',
  DOCUMENT_PROCESSING_STARTED = 'document.processing.started',
  DOCUMENT_PROCESSING_COMPLETED = 'document.processing.completed',
  DOCUMENT_PROCESSING_FAILED = 'document.processing.failed',
  DOCUMENT_SEGMENTS_CREATED = 'document.segments.created',

  // Document Processing Stage Events
  DOCUMENT_CHUNKING_STARTED = 'document.chunking.started',
  DOCUMENT_CHUNKING_COMPLETED = 'document.chunking.completed',
  DOCUMENT_CHUNKING_FAILED = 'document.chunking.failed',
  DOCUMENT_EMBEDDING_STARTED = 'document.embedding.started',
  DOCUMENT_EMBEDDING_COMPLETED = 'document.embedding.completed',
  DOCUMENT_EMBEDDING_FAILED = 'document.embedding.failed',

  // Entity Learning Events
  ENTITY_LEARNING_STARTED = 'entity.learning.started',
  ENTITY_LEARNING_COMPLETED = 'entity.learning.completed',
  ENTITY_LEARNING_FAILED = 'entity.learning.failed',

  // Entity Normalization Events
  ENTITY_NORMALIZATION_STARTED = 'entity.normalization.started',
  ENTITY_NORMALIZATION_COMPLETED = 'entity.normalization.completed',
  ENTITY_NORMALIZATION_FAILED = 'entity.normalization.failed',

  // Pipeline Events
  PIPELINE_EXECUTION_STARTED = 'pipeline.execution.started',
  PIPELINE_EXECUTION_COMPLETED = 'pipeline.execution.completed',
  PIPELINE_EXECUTION_FAILED = 'pipeline.execution.failed',
  PIPELINE_EXECUTION_CANCELLED = 'pipeline.execution.cancelled',
  PIPELINE_STEP_STARTED = 'pipeline.step.started',
  PIPELINE_STEP_COMPLETED = 'pipeline.step.completed',
  PIPELINE_STEP_FAILED = 'pipeline.step.failed',
}

export type EventType = (typeof EventTypes)[keyof typeof EventTypes];

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
