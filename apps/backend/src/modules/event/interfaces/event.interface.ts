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

export interface DocumentEvent extends BaseEvent {
  type:
    | EventTypes.DOCUMENT_UPLOADED
    | EventTypes.DOCUMENT_PROCESSING_STARTED
    | EventTypes.DOCUMENT_PROCESSING_COMPLETED
    | EventTypes.DOCUMENT_PROCESSING_FAILED
    | EventTypes.DOCUMENT_SEGMENTS_CREATED
    | EventTypes.DOCUMENT_CHUNKING_STARTED
    | EventTypes.DOCUMENT_CHUNKING_COMPLETED
    | EventTypes.DOCUMENT_CHUNKING_FAILED
    | EventTypes.DOCUMENT_EMBEDDING_STARTED
    | EventTypes.DOCUMENT_EMBEDDING_COMPLETED
    | EventTypes.DOCUMENT_EMBEDDING_FAILED
    | EventTypes.DOCUMENT_NER_STARTED
    | EventTypes.DOCUMENT_NER_COMPLETED
    | EventTypes.DOCUMENT_NER_FAILED;
  payload: {
    documentId: string;
    datasetId?: string;
    segmentCount?: number;
    error?: string;
  };
}

export interface EntityLearningEvent extends BaseEvent {
  type:
    | EventTypes.ENTITY_LEARNING_STARTED
    | EventTypes.ENTITY_LEARNING_COMPLETED
    | EventTypes.ENTITY_LEARNING_FAILED;
  payload: {
    datasetId: string;
    learningType: string;
    result?: any;
    error?: string;
    userId: string;
  };
}

export interface EntityNormalizationEvent extends BaseEvent {
  type:
    | EventTypes.ENTITY_NORMALIZATION_STARTED
    | EventTypes.ENTITY_NORMALIZATION_COMPLETED
    | EventTypes.ENTITY_NORMALIZATION_FAILED;
  payload: {
    datasetId: string;
    result?: any;
    error?: string;
    userId: string;
  };
}

export interface PipelineEvent extends BaseEvent {
  type:
    | EventTypes.PIPELINE_EXECUTION_STARTED
    | EventTypes.PIPELINE_EXECUTION_COMPLETED
    | EventTypes.PIPELINE_EXECUTION_FAILED
    | EventTypes.PIPELINE_EXECUTION_CANCELLED
    | EventTypes.PIPELINE_STEP_STARTED
    | EventTypes.PIPELINE_STEP_COMPLETED
    | EventTypes.PIPELINE_STEP_FAILED;
  payload: {
    executionId: string;
    pipelineId?: string;
    stepId?: string;
    data?: any;
    error?: string;
    userId?: string;
  };
}

export type Event =
  | InstrumentEvent
  | MarketDataEvent
  | QueueEvent
  | SystemEvent
  | DocumentEvent
  | EntityLearningEvent
  | EntityNormalizationEvent
  | PipelineEvent;
