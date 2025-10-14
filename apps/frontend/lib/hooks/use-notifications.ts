"use client";

import { useEffect, useRef } from "react";
import {
  notificationService,
  DocumentProcessingNotification,
  DatasetNotification,
} from "../notification-service";

export interface UseNotificationsOptions {
  clientId?: string;
  onDocumentProcessingUpdate?: (
    notification: DocumentProcessingNotification
  ) => void;
  onDatasetUpdate?: (notification: DatasetNotification) => void;
  onConnected?: () => void;
  onError?: (error: Event) => void;
  onMaxReconnectAttemptsReached?: () => void;
}

export function useNotifications(options: UseNotificationsOptions = {}) {
  const {
    clientId,
    onDocumentProcessingUpdate,
    onDatasetUpdate,
    onConnected,
    onError,
    onMaxReconnectAttemptsReached,
  } = options;

  const isConnectedRef = useRef(false);

  useEffect(() => {
    // Connect to notification service
    notificationService.connect(clientId);

    // Set up event listeners
    if (onDocumentProcessingUpdate) {
      notificationService.onDocumentProcessingUpdate(
        onDocumentProcessingUpdate
      );
    }

    if (onDatasetUpdate) {
      notificationService.onDatasetUpdate(onDatasetUpdate);
    }

    if (onConnected) {
      notificationService.onConnected(onConnected);
    }

    if (onError) {
      notificationService.onError(onError);
    }

    if (onMaxReconnectAttemptsReached) {
      notificationService.onMaxReconnectAttemptsReached(
        onMaxReconnectAttemptsReached
      );
    }

    // Track connection status
    const handleConnected = () => {
      isConnectedRef.current = true;
    };

    const handleError = () => {
      isConnectedRef.current = false;
    };

    notificationService.onConnected(handleConnected);
    notificationService.onError(handleError);

    // Cleanup on unmount
    return () => {
      notificationService.disconnect();
      isConnectedRef.current = false;
    };
  }, [
    clientId,
    onDocumentProcessingUpdate,
    onDatasetUpdate,
    onConnected,
    onError,
    onMaxReconnectAttemptsReached,
  ]);

  return {
    isConnected: isConnectedRef.current,
    connect: () => notificationService.connect(clientId),
    disconnect: () => notificationService.disconnect(),
  };
}

// Hook specifically for document processing notifications
export function useDocumentProcessingNotifications(
  datasetId: string,
  onUpdate: (notification: DocumentProcessingNotification) => void
) {
  return useNotifications({
    onDocumentProcessingUpdate: (notification) => {
      if (notification.datasetId === datasetId) {
        onUpdate(notification);
      }
    },
  });
}

// Hook specifically for dataset notifications
export function useDatasetNotifications(
  datasetId: string,
  onUpdate: (notification: DatasetNotification) => void
) {
  return useNotifications({
    onDatasetUpdate: (notification) => {
      if (notification.datasetId === datasetId) {
        onUpdate(notification);
      }
    },
  });
}
