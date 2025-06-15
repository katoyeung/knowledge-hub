import { EventTypes } from '../constants/event-types';

export interface BaseEvent {
  type: EventTypes;
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
    instrumentIds: number[];
    screenerId?: number;
    data?: any;
    error?: string;
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
    data?: any;
    error?: string;
  };
}

export interface QueueEvent extends BaseEvent {
  type:
    | EventTypes.QUEUE_JOB_ADDED
    | EventTypes.QUEUE_JOB_STARTED
    | EventTypes.QUEUE_JOB_COMPLETED
    | EventTypes.QUEUE_JOB_FAILED
    | EventTypes.QUEUE_JOB_RETRY;
  payload: {
    jobId: string;
    jobType: string;
    data?: any;
    error?: string;
  };
}

export interface SystemEvent extends BaseEvent {
  type:
    | EventTypes.SYSTEM_ERROR
    | EventTypes.SYSTEM_WARNING
    | EventTypes.SYSTEM_INFO;
  payload: {
    message: string;
    context?: any;
    error?: Error;
  };
}

export type Event =
  | InstrumentEvent
  | MarketDataEvent
  | QueueEvent
  | SystemEvent;
