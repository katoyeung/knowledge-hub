import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';

export enum NotificationType {
  SCREENER_UPDATE = 'SCREENER_UPDATE',
  INSTRUMENT_UPDATE = 'INSTRUMENT_UPDATE',
  INDICATOR_UPDATE = 'INDICATOR_UPDATE',
  DOCUMENT_PROCESSING_UPDATE = 'DOCUMENT_PROCESSING_UPDATE',
  DATASET_UPDATE = 'DATASET_UPDATE',
  GRAPH_EXTRACTION_UPDATE = 'GRAPH_EXTRACTION_UPDATE',
  WORKFLOW_EXECUTION_UPDATE = 'WORKFLOW_EXECUTION_UPDATE',
  WORKFLOW_EXECUTION_COMPLETED = 'WORKFLOW_EXECUTION_COMPLETED',
  WORKFLOW_EXECUTION_FAILED = 'WORKFLOW_EXECUTION_FAILED',
  POST_APPROVAL_COMPLETED = 'POST_APPROVAL_COMPLETED',
  POST_APPROVAL_FAILED = 'POST_APPROVAL_FAILED',
}

export interface NotificationMessage {
  type: NotificationType;
  data: any;
  timestamp: number;
}

@Injectable()
export class NotificationService {
  private notificationSubject = new Subject<NotificationMessage>();

  constructor() {}

  getNotificationStream() {
    return this.notificationSubject.asObservable();
  }

  sendNotification(type: NotificationType, data: any) {
    const message: NotificationMessage = {
      type,
      data,
      timestamp: Date.now(),
    };
    this.notificationSubject.next(message);
  }

  sendScreenerUpdate(screenerId: string, data: any) {
    this.sendNotification(NotificationType.SCREENER_UPDATE, {
      screenerId,
      ...data,
    });
  }

  sendInstrumentUpdate(instrumentId: string, data: any) {
    this.sendNotification(NotificationType.INSTRUMENT_UPDATE, {
      instrumentId,
      ...data,
    });
  }

  sendIndicatorUpdate(indicatorId: string, data: any) {
    this.sendNotification(NotificationType.INDICATOR_UPDATE, {
      indicatorId,
      ...data,
    });
  }

  sendDocumentProcessingUpdate(
    documentId: string,
    datasetId: string,
    data: any,
  ) {
    this.sendNotification(NotificationType.DOCUMENT_PROCESSING_UPDATE, {
      documentId,
      datasetId,
      ...data,
    });
  }

  sendDatasetUpdate(datasetId: string, data: any) {
    this.sendNotification(NotificationType.DATASET_UPDATE, {
      datasetId,
      ...data,
    });
  }

  sendGraphExtractionUpdate(datasetId: string, documentId: string, data: any) {
    this.sendNotification(NotificationType.GRAPH_EXTRACTION_UPDATE, {
      datasetId,
      documentId,
      ...data,
    });
  }

  sendWorkflowExecutionUpdate(
    executionId: string,
    workflowId: string,
    data: any,
  ) {
    this.sendNotification(NotificationType.WORKFLOW_EXECUTION_UPDATE, {
      executionId,
      workflowId,
      ...data,
    });
  }

  sendWorkflowExecutionCompleted(
    executionId: string,
    workflowId: string,
    data: any,
  ) {
    this.sendNotification(NotificationType.WORKFLOW_EXECUTION_COMPLETED, {
      executionId,
      workflowId,
      ...data,
    });
  }

  sendWorkflowExecutionFailed(
    executionId: string,
    workflowId: string,
    error: string,
  ) {
    this.sendNotification(NotificationType.WORKFLOW_EXECUTION_FAILED, {
      executionId,
      workflowId,
      error,
    });
  }

  sendPostApprovalCompleted(postId: string, data: any) {
    this.sendNotification(NotificationType.POST_APPROVAL_COMPLETED, {
      postId,
      ...data,
    });
  }

  sendPostApprovalFailed(postId: string, error: string) {
    this.sendNotification(NotificationType.POST_APPROVAL_FAILED, {
      postId,
      error,
    });
  }
}
