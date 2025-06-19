import { EventTypes } from '../constants/event-types';

export interface DocumentUploadedEvent {
  type: EventTypes.DOCUMENT_UPLOADED;
  payload: {
    documentId: string;
    datasetId: string;
    userId: string;
    filename: string;
    originalName: string;
    mimeType: string;
    size: number;
    filePath: string;
  };
  timestamp: number;
}

export interface DocumentProcessingStartedEvent {
  type: EventTypes.DOCUMENT_PROCESSING_STARTED;
  payload: {
    documentId: string;
    processingType: 'parse' | 'index' | 'embed';
  };
  timestamp: number;
}

export interface DocumentProcessingCompletedEvent {
  type: EventTypes.DOCUMENT_PROCESSING_COMPLETED;
  payload: {
    documentId: string;
    processingType: 'parse' | 'index' | 'embed';
    segmentsCreated?: number;
    processingTime: number;
  };
  timestamp: number;
}

export interface DocumentProcessingFailedEvent {
  type: EventTypes.DOCUMENT_PROCESSING_FAILED;
  payload: {
    documentId: string;
    processingType: 'parse' | 'index' | 'embed';
    error: string;
    retryCount: number;
  };
  timestamp: number;
}

export interface DocumentSegmentsCreatedEvent {
  type: EventTypes.DOCUMENT_SEGMENTS_CREATED;
  payload: {
    documentId: string;
    segmentIds: string[];
    totalSegments: number;
  };
  timestamp: number;
}

export type DocumentEvent =
  | DocumentUploadedEvent
  | DocumentProcessingStartedEvent
  | DocumentProcessingCompletedEvent
  | DocumentProcessingFailedEvent
  | DocumentSegmentsCreatedEvent;
