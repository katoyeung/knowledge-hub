"use client";

import { EventEmitter } from "events";

export interface DocumentProcessingNotification {
  documentId: string;
  datasetId: string;
  status:
    | "chunking"
    | "embedding"
    | "ner"
    | "completed"
    | "error"
    | "paused"
    | "cancelled"
    | "chunked"
    | "embedded";
  stage?: "chunking" | "embedding" | "ner";
  progress?: { current: number; total: number; percentage: number };
  message?: string;
  wordCount?: number;
  tokens?: number;
  segmentsCount?: number;
  embeddingDimensions?: number;
  error?: string;
}

export interface DatasetNotification {
  datasetId: string;
  type: string;
  data: any;
}

export interface NotificationMessage {
  type: "DOCUMENT_PROCESSING_UPDATE" | "DATASET_UPDATE" | "CONNECTED";
  data:
    | DocumentProcessingNotification
    | DatasetNotification
    | { clientId: string };
  timestamp: number;
}

class NotificationService extends EventEmitter {
  private eventSource: EventSource | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private isConnected = false;

  constructor() {
    super();
  }

  connect(clientId?: string): void {
    if (this.eventSource) {
      this.disconnect();
    }

    const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
    const url = `${baseUrl}/notifications/stream${clientId ? `?clientId=${clientId}` : ""}`;

    try {
      this.eventSource = new EventSource(url);
    } catch (error) {
      console.warn("Failed to create EventSource connection:", error);
      this.isConnected = false;
      this.emit("error", error);
      return;
    }

    this.eventSource.onopen = () => {
      console.log("Connected to notification stream");
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.emit("connected");
    };

    this.eventSource.onmessage = (event) => {
      try {
        const message: NotificationMessage = JSON.parse(event.data);
        this.handleMessage(message);
      } catch (error) {
        console.error("Failed to parse notification message:", error);
      }
    };

    this.eventSource.onerror = (error) => {
      // Only log meaningful errors, not empty objects
      if (error && Object.keys(error).length > 0) {
        console.error("Notification stream error:", error);
      } else {
        console.warn(
          "Notification stream connection failed - this is normal if the backend is not running"
        );
      }
      this.isConnected = false;
      this.emit("error", error);

      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.scheduleReconnect();
      } else {
        console.warn(
          "Max reconnection attempts reached for notification stream"
        );
        this.emit("maxReconnectAttemptsReached");
      }
    };
  }

  private scheduleReconnect(): void {
    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    console.log(
      `Scheduling reconnect attempt ${this.reconnectAttempts} in ${delay}ms`
    );

    setTimeout(() => {
      if (!this.isConnected) {
        this.connect();
      }
    }, delay);
  }

  private handleMessage(message: NotificationMessage): void {
    switch (message.type) {
      case "CONNECTED":
        console.log("Notification service connected:", message.data);
        break;
      case "DOCUMENT_PROCESSING_UPDATE":
        this.emit(
          "documentProcessingUpdate",
          message.data as DocumentProcessingNotification
        );
        break;
      case "DATASET_UPDATE":
        this.emit("datasetUpdate", message.data as DatasetNotification);
        break;
      default:
        console.log("Unknown notification type:", message.type);
    }
  }

  disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.isConnected = false;
  }

  isNotificationServiceConnected(): boolean {
    return this.isConnected;
  }

  // Convenience methods for specific event types
  onDocumentProcessingUpdate(
    callback: (notification: DocumentProcessingNotification) => void
  ): void {
    this.on("documentProcessingUpdate", callback);
  }

  onDatasetUpdate(callback: (notification: DatasetNotification) => void): void {
    this.on("datasetUpdate", callback);
  }

  onConnected(callback: () => void): void {
    this.on("connected", callback);
  }

  onError(callback: (error: Event) => void): void {
    this.on("error", callback);
  }

  onMaxReconnectAttemptsReached(callback: () => void): void {
    this.on("maxReconnectAttemptsReached", callback);
  }
}

// Export singleton instance
export const notificationService = new NotificationService();
