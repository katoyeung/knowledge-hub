"use client";

import { useEffect, useState, useCallback } from "react";

export interface NotificationMessage {
  type: string;
  data: any;
  timestamp: number;
}

export interface WorkflowExecutionNotification {
  executionId: string;
  workflowId: string;
  status: "running" | "completed" | "failed";
  message: string;
  metrics?: any;
  duration?: number;
  completedAt?: string;
  error?: string;
  progress?: any;
  currentNode?: string;
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<NotificationMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [eventSource, setEventSource] = useState<EventSource | null>(null);

  const connect = useCallback(() => {
    if (eventSource) {
      eventSource.close();
    }

    const clientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const es = new EventSource(
      `http://localhost:3001/api/notifications/stream?clientId=${clientId}`
    );

    es.onopen = () => {
      console.log("🔗 Connected to notification stream");
      setIsConnected(true);
    };

    es.onmessage = (event) => {
      try {
        const message: NotificationMessage = JSON.parse(event.data);
        console.log("📨 Received notification:", message);

        setNotifications((prev) => [...prev.slice(-49), message]); // Keep last 50 notifications
      } catch (error) {
        console.error("Failed to parse notification:", error);
      }
    };

    es.onerror = (error) => {
      console.error("❌ Notification stream error:", error);
      setIsConnected(false);

      // Reconnect after 5 seconds
      setTimeout(() => {
        if (es.readyState === EventSource.CLOSED) {
          connect();
        }
      }, 5000);
    };

    setEventSource(es);
  }, [eventSource]);

  const disconnect = useCallback(() => {
    if (eventSource) {
      eventSource.close();
      setEventSource(null);
      setIsConnected(false);
    }
  }, [eventSource]);

  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
  }, []);

  // Helper functions to filter notifications
  const getWorkflowNotifications = useCallback(
    (workflowId?: string) => {
      return notifications.filter((notification) => {
        if (notification.type.startsWith("WORKFLOW_EXECUTION_")) {
          if (workflowId) {
            return notification.data.workflowId === workflowId;
          }
          return true;
        }
        return false;
      });
    },
    [notifications]
  );

  const getExecutionNotifications = useCallback(
    (executionId: string) => {
      return notifications.filter(
        (notification) => notification.data.executionId === executionId
      );
    },
    [notifications]
  );

  const getLatestExecutionStatus = useCallback(
    (executionId: string) => {
      const execNotifications = getExecutionNotifications(executionId);
      if (execNotifications.length === 0) return null;

      const latest = execNotifications[execNotifications.length - 1];
      return latest.data as WorkflowExecutionNotification;
    },
    [getExecutionNotifications]
  );

  return {
    notifications,
    isConnected,
    connect,
    disconnect,
    getWorkflowNotifications,
    getExecutionNotifications,
    getLatestExecutionStatus,
  };
}

// Hook for document processing notifications
export function useDocumentProcessingNotifications() {
  const { notifications, getWorkflowNotifications } = useNotifications();

  const getDocumentProcessingNotifications = useCallback(
    (datasetId?: string) => {
      return notifications.filter((notification) => {
        if (notification.type.startsWith("DOCUMENT_PROCESSING_")) {
          if (datasetId) {
            return notification.data.datasetId === datasetId;
          }
          return true;
        }
        return false;
      });
    },
    [notifications]
  );

  const getLatestDocumentProcessingStatus = useCallback(
    (datasetId: string) => {
      const docNotifications = getDocumentProcessingNotifications(datasetId);
      if (docNotifications.length === 0) return null;

      const latest = docNotifications[docNotifications.length - 1];
      return latest.data;
    },
    [getDocumentProcessingNotifications]
  );

  return {
    documentProcessingNotifications: getDocumentProcessingNotifications(),
    getDocumentProcessingNotifications,
    getLatestDocumentProcessingStatus,
  };
}

// Hook for graph extraction notifications
export function useGraphExtractionNotifications() {
  const { notifications } = useNotifications();

  const getGraphExtractionNotifications = useCallback(
    (datasetId?: string) => {
      return notifications.filter((notification) => {
        if (notification.type.startsWith("GRAPH_EXTRACTION_")) {
          if (datasetId) {
            return notification.data.datasetId === datasetId;
          }
          return true;
        }
        return false;
      });
    },
    [notifications]
  );

  const getLatestGraphExtractionStatus = useCallback(
    (datasetId: string) => {
      const graphNotifications = getGraphExtractionNotifications(datasetId);
      if (graphNotifications.length === 0) return null;

      const latest = graphNotifications[graphNotifications.length - 1];
      return latest.data;
    },
    [getGraphExtractionNotifications]
  );

  return {
    graphExtractionNotifications: getGraphExtractionNotifications(),
    getGraphExtractionNotifications,
    getLatestGraphExtractionStatus,
  };
}

// Hook for post approval notifications
export function usePostApprovalNotifications() {
  const { notifications } = useNotifications();

  const getPostApprovalNotifications = useCallback(
    (postId?: string) => {
      return notifications.filter((notification) => {
        if (
          notification.type === "POST_APPROVAL_COMPLETED" ||
          notification.type === "POST_APPROVAL_FAILED"
        ) {
          if (postId) {
            return notification.data.postId === postId;
          }
          return true;
        }
        return false;
      });
    },
    [notifications]
  );

  const getLatestPostApprovalStatus = useCallback(
    (postId: string) => {
      const postNotifications = getPostApprovalNotifications(postId);
      if (postNotifications.length === 0) return null;

      const latest = postNotifications[postNotifications.length - 1];
      return latest.data;
    },
    [getPostApprovalNotifications]
  );

  return {
    postApprovalNotifications: getPostApprovalNotifications(),
    getPostApprovalNotifications,
    getLatestPostApprovalStatus,
  };
}
