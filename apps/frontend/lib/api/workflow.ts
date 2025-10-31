import apiClient from "../api";

// Workflow Types
export interface WorkflowNode {
  id: string;
  type: string;
  name: string;
  position: { x: number; y: number };
  config: Record<string, any>;
  inputMapping?: Record<string, string>;
  outputMapping?: Record<string, string>;
  enabled?: boolean;
  conditions?: string;
  testOutput?: {
    items?: any[];
    meta?: {
      totalCount: number;
      sampleCount: number;
      lastUpdated: string;
      hasMoreData?: boolean;
      [key: string]: any;
    };
    [key: string]: any;
  };
  inputSources?: Array<{
    type: "previous_node" | "dataset" | "document" | "segment" | "file" | "api";
    nodeId?: string;
    datasetId?: string;
    documentId?: string;
    segmentId?: string;
    filePath?: string;
    apiUrl?: string;
    filters?: Array<{
      field: string;
      operator: string;
      value: any;
    }>;
    mapping?: Record<string, string>;
  }>;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  condition?: string;
}

export interface WorkflowSettings {
  errorHandling: "stop" | "continue" | "retry";
  maxRetries: number;
  parallelExecution: boolean;
  notifyOnCompletion: boolean;
  notifyOnFailure: boolean;
  defaultInputSource?: "document_segments" | "external_data";
  defaultOutputFormat?: "json" | "csv" | "text";
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  settings: WorkflowSettings;
  isActive: boolean;
  isTemplate: boolean;
  tags?: string;
  metadata?: {
    version: string;
    createdBy: string;
    lastModifiedBy: string;
    category?: string;
    complexity?: "simple" | "medium" | "complex";
    templateId?: string;
    [key: string]: any;
  };
  userId: string;
  createdAt: string;
  updatedAt: string;
  user?: {
    id: string;
    email: string;
  };
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  datasetId?: string;
  documentId?: string;
  documentIds?: string[];
  status:
    | "pending"
    | "running"
    | "completed"
    | "failed"
    | "cancelled"
    | "paused";
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  results?: Record<string, any>;
  progress?: {
    currentNodeId?: string;
    currentNodeName?: string;
    completedNodes: number;
    totalNodes: number;
    message: string;
    overallProgress: number;
  };
  nodeSnapshots?: NodeExecutionSnapshot[];
  error?: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  workflow?: Workflow;
  user?: {
    id: string;
    email: string;
  };
}

export interface NodeExecutionSnapshot {
  nodeId: string;
  nodeName: string;
  timestamp: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  inputData: {
    count: number;
    sample: any[];
    schema: Record<string, any>;
  };
  outputData: {
    count: number;
    sample: any[];
    schema: Record<string, any>;
  };
  metrics: {
    processingTime: number;
    memoryUsage: number;
    cpuUsage: number;
    dataSize: number;
  };
  error?: string;
  progress: number; // 0-100
}

export interface PipelineStep {
  type: string;
  name: string;
  description: string;
  version: string;
  inputTypes: string[];
  outputTypes: string[];
  configSchema: Record<string, any>;
}

export interface CreateWorkflowDto {
  name: string;
  description?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  settings: WorkflowSettings;
  isTemplate?: boolean;
  tags?: string;
  metadata?: Record<string, any>;
}

export interface UpdateWorkflowDto {
  name?: string;
  description?: string;
  nodes?: WorkflowNode[];
  edges?: WorkflowEdge[];
  settings?: Partial<WorkflowSettings>;
  isActive?: boolean;
  isTemplate?: boolean;
  tags?: string;
  metadata?: Record<string, any>;
}

export interface ExecuteWorkflowDto {
  workflowId: string;
  documentIds?: string[];
  segmentIds?: string[];
  externalInput?: Record<string, any>;
  syncMode?: boolean;
  options?: {
    maxRetries?: number;
    notifyOnProgress?: boolean;
  };
}

export interface WorkflowExecutionInput {
  documentIds?: string[];
  segmentIds?: string[];
  datasetId?: string;
  externalInput?: Record<string, any>;
  dataSourceConfig?: {
    sourceType: "dataset" | "documents" | "segments" | "custom";
    datasetId?: string;
    documentIds?: string[];
    segmentIds?: string[];
    customData?: any;
    filters?: {
      enabled?: boolean;
      status?: string;
      minWordCount?: number;
      maxWordCount?: number;
    };
    limit?: number;
    offset?: number;
  };
}

export interface WorkflowExecutionResponse {
  executionId: string;
  status: string;
  message: string;
}

export interface CancelWorkflowExecutionDto {
  reason?: string;
}

// Workflow API functions
export const workflowApi = {
  // Get all workflows
  getAll: async (params?: {
    isActive?: boolean;
    isTemplate?: boolean;
    datasetId?: string;
    tags?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ workflows: Workflow[]; total: number }> => {
    const response = await apiClient.get("/workflow/configs", { params });
    return response.data;
  },

  // Get workflow by ID
  getById: async (id: string): Promise<Workflow> => {
    const response = await apiClient.get(`/workflow/configs/${id}`);
    return response.data;
  },

  // Create new workflow
  create: async (data: CreateWorkflowDto): Promise<Workflow> => {
    const response = await apiClient.post("/workflow/configs", data);
    return response.data;
  },

  // Update workflow
  update: async (id: string, data: UpdateWorkflowDto): Promise<Workflow> => {
    const response = await apiClient.put(`/workflow/configs/${id}`, data);
    return response.data;
  },

  // Delete workflow
  delete: async (
    id: string
  ): Promise<{ success: boolean; message: string }> => {
    const response = await apiClient.delete(`/workflow/configs/${id}`);
    return response.data;
  },

  // Execute workflow (asynchronous)
  execute: async (
    data: ExecuteWorkflowDto
  ): Promise<WorkflowExecutionResponse> => {
    const response = await apiClient.post("/workflow/execute", data);
    return response.data;
  },

  // Execute workflow synchronously (wait for completion)
  executeSync: async (
    data: ExecuteWorkflowDto
  ): Promise<WorkflowExecutionResponse> => {
    const response = await apiClient.post("/workflow/execute/sync", data);
    return response.data;
  },

  // Get workflow execution status
  getExecutionStatus: async (id: string): Promise<WorkflowExecution> => {
    const response = await apiClient.get(`/workflow/executions/${id}`);
    return response.data;
  },

  // Cancel workflow execution
  cancelExecution: async (
    id: string,
    data: CancelWorkflowExecutionDto
  ): Promise<{ success: boolean; message: string }> => {
    const response = await apiClient.post(
      `/workflow/executions/${id}/cancel`,
      data
    );
    return response.data;
  },

  // Get all executions for the current user
  getAllExecutions: async (params?: {
    limit?: number;
    offset?: number;
  }): Promise<{
    executions: WorkflowExecution[];
    total: number;
  }> => {
    const response = await apiClient.get("/workflow/executions", { params });
    return response.data;
  },

  // Get execution history for a workflow
  getExecutionHistory: async (
    workflowId: string,
    params?: {
      limit?: number;
      offset?: number;
    }
  ): Promise<{
    executions: WorkflowExecution[];
    total: number;
  }> => {
    const response = await apiClient.get(
      `/workflow/configs/${workflowId}/executions`,
      { params }
    );
    return response.data;
  },

  // Get available pipeline steps
  getAvailableSteps: async (): Promise<PipelineStep[]> => {
    const response = await apiClient.get("/workflow/steps");
    return response.data;
  },

  // Get step configuration schema
  getStepConfigSchema: async (type: string): Promise<Record<string, any>> => {
    const response = await apiClient.get(`/workflow/steps/${type}`);
    return response.data;
  },

  // Validate step configuration
  validateStepConfig: async (
    type: string,
    config: Record<string, any>
  ): Promise<{ isValid: boolean; errors: string[] }> => {
    const response = await apiClient.post(
      `/workflow/steps/${type}/validate`,
      config
    );
    return response.data;
  },

  // Duplicate workflow
  duplicate: async (id: string): Promise<Workflow> => {
    const response = await apiClient.post(`/workflow/configs/${id}/duplicate`);
    return response.data;
  },

  // Get execution snapshots
  getExecutionSnapshots: async (
    executionId: string
  ): Promise<NodeExecutionSnapshot[]> => {
    const response = await apiClient.get(
      `/workflow/executions/${executionId}/snapshots`
    );
    return response.data;
  },

  // Get specific node snapshot
  getNodeSnapshot: async (
    executionId: string,
    nodeId: string
  ): Promise<NodeExecutionSnapshot> => {
    const response = await apiClient.get(
      `/workflow/executions/${executionId}/snapshots/${nodeId}`
    );
    return response.data;
  },

  // Delete single execution
  deleteExecution: async (
    executionId: string
  ): Promise<{ success: boolean; message: string }> => {
    const response = await apiClient.delete(
      `/workflow/executions/${executionId}`
    );
    return response.data;
  },

  // Delete multiple executions
  deleteExecutions: async (
    executionIds: string[]
  ): Promise<{ success: boolean; message: string; deletedCount: number }> => {
    const response = await apiClient.delete("/workflow/executions/batch", {
      data: { executionIds },
    });
    return response.data;
  },
};

export default workflowApi;
