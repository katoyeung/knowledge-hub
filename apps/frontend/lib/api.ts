import axios from "axios";
import {
  ChatMessage,
  SourceChunk,
  Conversation,
  PaginatedMessagesResponse,
} from "./types/chat";
import type {
  AuthUser,
  ApiKey,
  ApiKeyCreateResponse,
} from "@knowledge-hub/shared-types";

// CSV Connector Types
export enum CsvConnectorType {
  SOCIAL_MEDIA_POST = "social_media_post",
  NEWS_ARTICLE = "news_article",
  CUSTOM = "custom",
}

export interface CsvConnectorTemplate {
  name: string;
  displayName: string;
  description: string;
  standardFields: Record<string, string>;
  searchableColumns: string[];
  metadataColumns: string[];
}

export interface CsvUploadConfig {
  connectorType?: CsvConnectorType;
  fieldMappings?: Record<string, string>;
  searchableColumns?: string[];
  metadataColumns?: string[];
}

// Create axios instance with base configuration
const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api",
  timeout: 300000, // Increased timeout to 5 minutes for graph extraction operations
  headers: {
    "Content-Type": "application/json",
  },
});

// Add request interceptor for authentication
const addAuthInterceptor = (client: typeof apiClient) => {
  client.interceptors.request.use(
    (config) => {
      // Add auth token if available
      const token = localStorage.getItem("authToken");
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    },
    (error) => {
      return Promise.reject(error);
    }
  );
};

addAuthInterceptor(apiClient);

// Add response interceptor for error handling
const addResponseInterceptor = (client: typeof apiClient) => {
  client.interceptors.response.use(
    (response) => {
      return response;
    },
    (error) => {
      // Handle common errors
      if (error.response?.status === 401) {
        // Redirect to login or refresh token
        localStorage.removeItem("authToken");
        window.location.href = "/login";
      }
      return Promise.reject(error);
    }
  );
};

addResponseInterceptor(apiClient);

// Dataset API interface
export interface Dataset {
  id: string;
  name: string;
  description?: string;
  provider?: string;
  permission?: string;
  dataSourceType?: string;
  settings?: {
    chat_settings?: {
      provider?: string;
      model?: string;
      promptId?: string;
      temperature?: number;
      maxChunks?: number;
    };
    graph_settings?: {
      aiProviderId?: string;
      model?: string;
      promptId?: string;
      temperature?: number;
    };
    workflow_settings?: Record<string, unknown>;
  };
  createdAt: string;
  updatedAt: string;
  user?: {
    id: string;
    email: string;
  };
}

// Document processing metadata interface
export interface DocumentProcessingMetadata {
  currentStage: "chunking" | "embedding" | "ner" | "completed";
  chunking: {
    startedAt: Date;
    completedAt: Date;
    segmentCount: number;
  };
  embedding: {
    startedAt: Date;
    completedAt: Date;
    processedCount: number;
    totalCount: number;
  };
  ner: {
    startedAt: Date;
    completedAt: Date;
    processedCount: number;
    totalCount: number;
    enabled: boolean;
  };
}

// Document API interface
export interface Document {
  id: string;
  name: string;
  datasetId: string;
  position: number;
  dataSourceType: string;
  batch: string;
  createdFrom: string;
  fileId?: string;
  wordCount?: number;
  indexingStatus: string;
  enabled: boolean;
  archived: boolean;
  docType?: string;
  docForm?: string;
  docLanguage?: string;
  docMetadata?: Record<string, unknown>;
  // Processing metadata
  processingMetadata?: DocumentProcessingMetadata;
  // Embedding configuration
  embeddingModel?: string;
  embeddingDimensions?: number;
  createdAt?: string;
  updatedAt?: string;
  processingStartedAt?: string;
  creator?: {
    id: string;
    email: string;
  };
  dataset?: Dataset;
}

// Embedding API interface
export interface Embedding {
  id: string;
  modelName: string;
  hash: string;
  embedding: number[];
  createdAt: string;
  providerName: string;
}

// NER Keywords interface
export interface NerKeywords {
  extracted: string[];
  count: number;
  extractedAt: string;
}

// Document Segment API interface
export interface DocumentSegment {
  id: string;
  datasetId: string;
  documentId: string;
  position: number;
  content: string;
  answer?: string;
  wordCount: number;
  tokens: number;
  keywords?: NerKeywords;
  indexNodeId?: string;
  indexNodeHash?: string;
  hitCount: number;
  enabled: boolean;
  disabledAt?: string;
  disabledBy?: string;
  status: string;
  indexingAt?: string;
  completedAt?: string;
  error?: string;
  stoppedAt?: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  // Embedding relationship
  embeddingId?: string;
  embedding?: Embedding;
  document?: Document;
  dataset?: Dataset;
  // Graph data
  graphNodes?: any[];
  graphEdges?: any[];
  user?: {
    id: string;
    email: string;
  };
  // CSV-specific fields
  segmentType?: string;
  hierarchyMetadata?: {
    csvRow?: Record<string, unknown>;
    connectorType?: string;
    fieldMappings?: Record<string, string>;
  };
}

// Dataset API functions
export const datasetApi = {
  // Get all datasets
  getAll: async (params?: {
    page?: number;
    limit?: number;
    sort?: string;
    filter?: string;
  }): Promise<{
    data: Dataset[];
    count: number;
    total: number;
    page: number;
    pageCount: number;
  }> => {
    const response = await apiClient.get("/datasets", { params });

    // Handle both direct array response and paginated response
    if (Array.isArray(response.data)) {
      return {
        data: response.data,
        count: response.data.length,
        total: response.data.length,
        page: 1,
        pageCount: 1,
      };
    }

    return response.data;
  },

  // Search datasets with case-insensitive search
  searchDatasets: async (params?: {
    q?: string;
    page?: number;
    limit?: number;
    sort?: string;
  }): Promise<{
    data: Dataset[];
    count: number;
    total: number;
    page: number;
    pageCount: number;
  }> => {
    const response = await apiClient.get("/datasets/search", { params });
    return response.data;
  },

  // Get dataset by ID
  getById: async (id: string): Promise<Dataset> => {
    const response = await apiClient.get(`/datasets/${id}`);
    return response.data;
  },

  // Create new dataset
  create: async (
    data: Omit<Dataset, "id" | "createdAt" | "updatedAt">
  ): Promise<Dataset> => {
    const response = await apiClient.post("/datasets", data);
    return response.data;
  },

  // Update dataset
  update: async (id: string, data: Partial<Dataset>): Promise<Dataset> => {
    const response = await apiClient.patch(`/datasets/${id}`, data);
    return response.data;
  },

  // Delete dataset
  delete: async (id: string): Promise<boolean> => {
    await apiClient.delete(`/datasets/${id}`);
    return true;
  },

  // Get effective configuration for a dataset
  getEffectiveConfig: async (
    id: string
  ): Promise<{
    datasetId: string;
    embeddingModel: string;
    userConfiguration: {
      chunkSize: number;
      chunkOverlap: number;
      useModelDefaults: boolean;
    };
    effectiveConfiguration: {
      chunkSize: number;
      chunkOverlap: number;
      textSplitter: string;
    };
    modelOptimizations: {
      enabled: boolean;
      description: string;
      recommendedChunkSize: number;
      recommendedChunkOverlap: number;
      maxTokens: number;
    };
    optimizationApplied: boolean;
  }> => {
    const response = await apiClient.get(`/datasets/effective-config/${id}`);
    return response.data;
  },

  // Step-by-step dataset creation
  createStepOne: async (data: {
    name: string;
    description?: string;
  }): Promise<{
    success: boolean;
    message: string;
    data: Dataset;
  }> => {
    const response = await apiClient.post("/datasets/create-step-one", data);
    return response.data;
  },

  // Upload documents to existing dataset
  uploadDocuments: async (
    datasetId: string,
    files: File[],
    csvConfig?: CsvUploadConfig
  ): Promise<{
    success: boolean;
    message: string;
    data: {
      dataset: Dataset;
      documents: Document[];
      uploadedFiles: Array<{
        originalName: string;
        filename: string;
        size: number;
        mimetype: string;
      }>;
    };
  }> => {
    const formData = new FormData();
    files.forEach((file) => {
      formData.append("files", file);
    });

    // Add CSV configuration if provided
    if (csvConfig) {
      if (csvConfig.connectorType) {
        formData.append("csvConnectorType", csvConfig.connectorType);
      }
      if (csvConfig.fieldMappings) {
        formData.append(
          "csvFieldMappings",
          JSON.stringify(csvConfig.fieldMappings)
        );
      }
      if (csvConfig.searchableColumns) {
        formData.append(
          "csvSearchableColumns",
          JSON.stringify(csvConfig.searchableColumns)
        );
      }
    }

    const response = await apiClient.post(
      `/datasets/${datasetId}/upload-documents`,
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      }
    );
    return response.data;
  },

  // Process documents with embedding configuration
  processDocuments: async (data: {
    datasetId: string;
    documentIds: string[];
    embeddingModel: string;
    customModelName?: string;
    embeddingModelProvider?: string;
    textSplitter: string;
    chunkSize: number;
    chunkOverlap: number;
    separators?: string[];
    // 🆕 Parent-Child Chunking option
    enableParentChildChunking?: boolean;
    // 🆕 NER processing option
    nerEnabled?: boolean;
  }): Promise<{
    success: boolean;
    message: string;
    data: {
      dataset: Dataset;
      processedDocuments: Document[];
    };
  }> => {
    const response = await apiClient.post("/datasets/process-documents", data);
    return response.data;
  },

  // Complete dataset setup
  completeSetup: async (
    datasetId: string,
    data: {
      embeddingModel: string;
      embeddingModelProvider?: string;
      textSplitter: string;
      chunkSize: number;
      chunkOverlap: number;
      separators?: string[];
    }
  ): Promise<{
    success: boolean;
    message: string;
    data: Dataset;
  }> => {
    const response = await apiClient.post(
      `/datasets/${datasetId}/complete-setup`,
      data
    );
    return response.data;
  },

  // Search documents using hybrid search (BM25 + Semantic + Reranker)
  search: async (data: {
    documentId: string;
    query: string;
    limit?: number;
    similarityThreshold?: number;
    rerankerType?: "mathematical" | "ml-cross-encoder" | "none";
    // 🆕 Search Weight Configuration
    bm25Weight?: number;
    embeddingWeight?: number;
  }): Promise<{
    results: Array<{
      id: string;
      content: string;
      similarity: number;
      segment: DocumentSegment;
      matchType: string;
      scores: {
        bm25: number;
        semantic: number;
        reranker: number;
        final: number;
      };
    }>;
    query: string;
    count: number;
    model?: string;
    rerankerType?: "mathematical" | "ml-cross-encoder" | "none";
    message?: string;
  }> => {
    const response = await apiClient.post("/datasets/search-documents", data);
    return response.data;
  },

  // Graph settings methods
  updateGraphSettings: async (
    datasetId: string,
    graphSettings: {
      aiProviderId?: string;
      model?: string;
      promptId?: string;
      temperature?: number;
    }
  ): Promise<Dataset> => {
    const response = await apiClient.put(
      `/datasets/${datasetId}/graph-settings`,
      graphSettings
    );
    return response.data.dataset;
  },

  getGraphSettings: async (
    datasetId: string
  ): Promise<{
    success: boolean;
    graphSettings: any;
    message: string;
  }> => {
    const response = await apiClient.get(
      `/datasets/${datasetId}/graph-settings`
    );
    return response.data;
  },

  getResolvedGraphSettings: async (
    datasetId: string
  ): Promise<{
    success: boolean;
    graphSettings: any;
    message: string;
  }> => {
    const response = await apiClient.get(
      `/datasets/${datasetId}/resolved-graph-settings`
    );
    return response.data;
  },

  triggerGraphExtraction: async (
    datasetId: string,
    documentId: string
  ): Promise<{
    success: boolean;
    result: { nodesCreated: number; edgesCreated: number };
    message: string;
  }> => {
    const response = await apiClient.post(
      `/datasets/${datasetId}/documents/${documentId}/extract-graph`
    );
    return response.data;
  },
};

// Document API functions
export const documentApi = {
  // Get documents by dataset ID
  getByDataset: async (datasetId: string): Promise<Document[]> => {
    const response = await apiClient.get(
      `/documents?filter=datasetId||eq||${datasetId}`
    );
    // Handle both direct array response and paginated response
    return Array.isArray(response.data)
      ? response.data
      : response.data.data || [];
  },

  // Upload documents
  upload: async (
    files: File[],
    options: {
      datasetId?: string;
      datasetName?: string;
      datasetDescription?: string;
      csvConfig?: CsvUploadConfig;
    } = {}
  ): Promise<{
    success: boolean;
    message: string;
    data: {
      dataset: Dataset;
      documents: Document[];
      uploadedFiles: Array<{
        originalName: string;
        filename: string;
        size: number;
        mimetype: string;
      }>;
    };
  }> => {
    const formData = new FormData();

    // Add files to form data
    files.forEach((file) => {
      formData.append("files", file);
    });

    // Add options to form data
    if (options.datasetId) {
      formData.append("datasetId", options.datasetId);
    }
    if (options.datasetName) {
      formData.append("datasetName", options.datasetName);
    }
    if (options.datasetDescription) {
      formData.append("datasetDescription", options.datasetDescription);
    }

    // Add CSV configuration if provided
    if (options.csvConfig) {
      if (options.csvConfig.connectorType) {
        formData.append("csvConnectorType", options.csvConfig.connectorType);
      }
      if (options.csvConfig.fieldMappings) {
        formData.append(
          "csvFieldMappings",
          JSON.stringify(options.csvConfig.fieldMappings)
        );
      }
      if (options.csvConfig.searchableColumns) {
        formData.append(
          "csvSearchableColumns",
          JSON.stringify(options.csvConfig.searchableColumns)
        );
      }
    }

    const response = await apiClient.post("/documents/upload", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });

    return response.data;
  },

  // Get all documents
  getAll: async (params?: {
    page?: number;
    limit?: number;
    sort?: string;
    filter?: string;
  }): Promise<{
    data: Document[];
    count: number;
    total: number;
    page: number;
    pageCount: number;
  }> => {
    const response = await apiClient.get("/documents", { params });
    return response.data;
  },

  // Get document by ID
  getById: async (id: string): Promise<Document> => {
    const response = await apiClient.get(`/documents/${id}`);
    return response.data;
  },

  // Delete document
  delete: async (id: string): Promise<boolean> => {
    await apiClient.delete(`/documents/${id}`);
    return true;
  },

  // Resume document processing
  resume: async (
    id: string
  ): Promise<{
    success: boolean;
    message: string;
    data: {
      documentId: string;
    };
  }> => {
    const response = await apiClient.post(`/documents/${id}/resume`);
    return response.data;
  },

  // Pause document processing
  pause: async (
    id: string
  ): Promise<{
    success: boolean;
    message: string;
    data: {
      documentId: string;
    };
  }> => {
    const response = await apiClient.post(`/documents/${id}/pause`);
    return response.data;
  },

  // Retry document processing
  retry: async (
    id: string
  ): Promise<{
    success: boolean;
    message: string;
    data: {
      documentId: string;
    };
  }> => {
    const response = await apiClient.post(`/documents/${id}/retry`);
    return response.data;
  },

  // Cancel document processing
  cancel: async (
    id: string
  ): Promise<{
    success: boolean;
    message: string;
    data: {
      documentId: string;
      cancelledCount: number;
    };
  }> => {
    const response = await apiClient.post(`/documents/${id}/cancel`);
    return response.data;
  },

  // Get job status
  getJobStatus: async (
    id: string
  ): Promise<{
    success: boolean;
    data: {
      documentId: string;
      currentStage: string;
      overallStatus: string;
      stageProgress: {
        [stage: string]: { current: number; total: number; percentage: number };
      };
      activeJobIds: string[];
      jobs: Array<{
        id: string;
        type: string;
        data: Record<string, unknown>;
        status: string;
        progress: number;
        createdAt: Date;
        startedAt?: Date;
        completedAt?: Date;
        failedReason?: string;
        attemptsMade: number;
        attemptsLimit: number;
      }>;
      lastError: { stage: string; message: string; timestamp: Date } | null;
      processingMetadata: DocumentProcessingMetadata;
    };
  }> => {
    const response = await apiClient.get(`/documents/${id}/job-status`);
    return response.data;
  },

  // Get CSV connector templates
  getCsvTemplates: async (): Promise<
    Array<{
      name: string;
      displayName: string;
      description: string;
      standardFields: Record<string, string>;
      searchableColumns: string[];
      metadataColumns: string[];
    }>
  > => {
    const response = await apiClient.get("/csv-connector/templates");
    return response.data;
  },

  // Validate CSV headers against template
  validateCsvHeaders: async (
    file: File,
    templateName: string
  ): Promise<{
    isValid: boolean;
    missingColumns: string[];
    extraColumns: string[];
  }> => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("templateName", templateName);

    const response = await apiClient.post("/csv-connector/validate", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
    return response.data;
  },
};

// Document Segment API functions
export const documentSegmentApi = {
  getAll: (): Promise<DocumentSegment[]> =>
    apiClient.get("/document-segments").then((res) => res.data),

  getById: (id: string): Promise<DocumentSegment> =>
    apiClient.get(`/document-segments/${id}`).then((res) => res.data),

  getByDocument: (documentId: string): Promise<DocumentSegment[]> =>
    apiClient
      .get(`/document-segments/document/${documentId}`)
      .then((res) => res.data),

  getByDocumentPaginated: (
    documentId: string,
    params?: { page?: number; limit?: number }
  ): Promise<{
    data: DocumentSegment[];
    count: number;
    total: number;
    page: number;
    pageCount: number;
  }> =>
    apiClient
      .get(`/document-segments/document/${documentId}`, { params })
      .then((res) => res.data),

  getByDocumentWithFilters: (
    documentId: string,
    params?: {
      page?: number;
      limit?: number;
      search?: string;
      hasGraphData?: "true" | "false" | "all";
    }
  ): Promise<{
    data: DocumentSegment[];
    count: number;
    total: number;
    page: number;
    pageCount: number;
  }> =>
    apiClient
      .get(`/document-segments/document/${documentId}/filtered`, { params })
      .then((res) => res.data),

  getByDataset: (datasetId: string): Promise<DocumentSegment[]> =>
    apiClient
      .get(`/document-segments/dataset/${datasetId}`)
      .then((res) => res.data),

  create: (data: Partial<DocumentSegment>): Promise<DocumentSegment> =>
    apiClient.post("/document-segments", data).then((res) => res.data),

  update: (
    id: string,
    data: Partial<DocumentSegment>
  ): Promise<DocumentSegment> =>
    apiClient.patch(`/document-segments/${id}`, data).then((res) => res.data),

  delete: (id: string): Promise<void> =>
    apiClient.delete(`/document-segments/${id}`).then((res) => res.data),

  toggleStatus: (id: string): Promise<DocumentSegment> =>
    apiClient
      .patch(`/document-segments/${id}/toggle-status`)
      .then((res) => res.data),

  getDocumentStatusCounts: (
    documentId: string
  ): Promise<{
    documentId: string;
    totalSegments: number;
    statusCounts: Record<string, number>;
  }> =>
    apiClient
      .get(`/document-segments/document/${documentId}/status-counts`)
      .then((res) => res.data),

  fixStuckSegments: (
    documentId: string
  ): Promise<{
    documentId: string;
    stuckSegmentsFound: number;
    fixedSegments: number;
    message: string;
  }> =>
    apiClient
      .post(`/document-segments/document/${documentId}/fix-stuck-segments`)
      .then((res) => res.data),

  // Bulk operations
  bulkDelete: (segmentIds: string[]): Promise<{ deleted: number }> =>
    apiClient
      .post("/document-segments/bulk/delete", { segmentIds })
      .then((res) => res.data),

  bulkUpdateStatus: (
    segmentIds: string[],
    enabled: boolean
  ): Promise<{ updated: number }> =>
    apiClient
      .post("/document-segments/bulk/update-status", { segmentIds, enabled })
      .then((res) => res.data),
};

// AI Provider API interface
export interface AiProvider {
  id: string;
  name: string;
  type:
    | "openai"
    | "anthropic"
    | "openrouter"
    | "dashscope"
    | "perplexity"
    | "ollama"
    | "custom";
  apiKey?: string;
  baseUrl?: string;
  isActive: boolean;
  models?: Array<{
    id: string;
    name: string;
    description?: string;
    maxTokens?: number;
    contextWindow?: number;
    pricing?: {
      input: number;
      output: number;
    };
  }>;
  createdAt: string;
  updatedAt: string;
  userId: string;
  user?: {
    id: string;
    email: string;
  };
}

// AI Provider Model interface
export interface AiProviderModel {
  id: string;
  name: string;
  description?: string;
  maxTokens?: number;
  contextWindow?: number;
  pricing?: {
    input: number;
    output: number;
  };
}

// Prompt API interface
export interface Prompt {
  id: string;
  name: string;
  systemPrompt: string;
  userPromptTemplate?: string;
  description?: string;
  jsonSchema?: object;
  type: string;
  isGlobal: boolean;
  isActive: boolean;
  userId: string;
  createdAt: string;
  updatedAt: string;
  user?: {
    id: string;
    email: string;
  };
}

// AI Provider API functions
export const aiProviderApi = {
  // Get all AI providers
  getAll: async (params?: {
    page?: number;
    limit?: number;
    sort?: string;
    filter?: string;
  }): Promise<{
    data: AiProvider[];
    count: number;
    total: number;
    page: number;
    pageCount: number;
  }> => {
    const response = await apiClient.get("/ai-providers", { params });

    // Handle both direct array response and paginated response
    if (Array.isArray(response.data)) {
      return {
        data: response.data,
        count: response.data.length,
        total: response.data.length,
        page: 1,
        pageCount: 1,
      };
    }

    return response.data;
  },

  // Get AI provider by ID
  getById: async (id: string): Promise<AiProvider> => {
    const response = await apiClient.get(`/ai-providers/${id}`);
    return response.data;
  },

  // Create new AI provider
  create: async (
    data: Omit<AiProvider, "id" | "createdAt" | "updatedAt" | "userId">
  ): Promise<AiProvider> => {
    const response = await apiClient.post("/ai-providers", data);
    return response.data;
  },

  // Update AI provider
  update: async (
    id: string,
    data: Partial<AiProvider>
  ): Promise<AiProvider> => {
    const response = await apiClient.patch(`/ai-providers/${id}`, data);
    return response.data;
  },

  // Delete AI provider
  delete: async (id: string): Promise<boolean> => {
    await apiClient.delete(`/ai-providers/${id}`);
    return true;
  },

  // Model Management Methods

  // Get all models for an AI provider
  getModels: async (providerId: string): Promise<AiProviderModel[]> => {
    const response = await apiClient.get(`/ai-providers/${providerId}/models`);
    return response.data;
  },

  // Get a specific model from an AI provider
  getModel: async (
    providerId: string,
    modelId: string
  ): Promise<AiProviderModel> => {
    const encodedModelId = encodeURIComponent(modelId);
    const response = await apiClient.get(
      `/ai-providers/${providerId}/models/${encodedModelId}`
    );
    return response.data;
  },

  // Add a new model to an AI provider
  addModel: async (
    providerId: string,
    modelData: AiProviderModel
  ): Promise<AiProvider> => {
    const response = await apiClient.post(
      `/ai-providers/${providerId}/models`,
      modelData
    );
    return response.data;
  },

  // Update an existing model in an AI provider
  updateModel: async (
    providerId: string,
    modelId: string,
    modelData: Partial<AiProviderModel>
  ): Promise<AiProvider> => {
    const encodedModelId = encodeURIComponent(modelId);
    const response = await apiClient.patch(
      `/ai-providers/${providerId}/models/${encodedModelId}`,
      modelData
    );
    return response.data;
  },

  // Remove a model from an AI provider
  removeModel: async (
    providerId: string,
    modelId: string
  ): Promise<AiProvider> => {
    // URL encode the modelId to handle special characters like / and :
    const encodedModelId = encodeURIComponent(modelId);

    try {
      const response = await apiClient.delete(
        `/ai-providers/${providerId}/models/${encodedModelId}`
      );
      return response.data;
    } catch (error: unknown) {
      throw error;
    }
  },

  // Resume document processing
  resumeProcessing: async (
    documentId: string
  ): Promise<{
    success: boolean;
    message: string;
    data: {
      documentId: string;
    };
  }> => {
    const response = await apiClient.post(`/documents/${documentId}/resume`);
    return response.data;
  },
};

// Prompt API functions
export const promptApi = {
  // Get all prompts
  getAll: async (params?: {
    page?: number;
    limit?: number;
    sort?: string;
    filter?: string;
  }): Promise<{
    data: Prompt[];
    count: number;
    total: number;
    page: number;
    pageCount: number;
  }> => {
    const response = await apiClient.get("/prompts", { params });

    // Handle both direct array response and paginated response
    if (Array.isArray(response.data)) {
      return {
        data: response.data,
        count: response.data.length,
        total: response.data.length,
        page: 1,
        pageCount: 1,
      };
    }

    return response.data;
  },

  // Search prompts with pagination
  search: async (params: {
    q?: string;
    page?: number;
    limit?: number;
    sort?: string;
  }): Promise<{
    data: Prompt[];
    count: number;
    total: number;
    page: number;
    pageCount: number;
  }> => {
    const response = await apiClient.get("/prompts/search", { params });
    return response.data;
  },

  // Get prompt by ID
  getById: async (id: string): Promise<Prompt> => {
    const response = await apiClient.get(`/prompts/${id}`);
    return response.data;
  },

  // Create new prompt
  create: async (
    data: Omit<Prompt, "id" | "createdAt" | "updatedAt" | "userId">
  ): Promise<Prompt> => {
    const response = await apiClient.post("/prompts", data);
    return response.data;
  },

  // Update prompt
  update: async (id: string, data: Partial<Prompt>): Promise<Prompt> => {
    const response = await apiClient.patch(`/prompts/${id}`, data);
    return response.data;
  },

  // Delete prompt
  delete: async (id: string): Promise<boolean> => {
    await apiClient.delete(`/prompts/${id}`);
    return true;
  },
};

// Chat API functions
export const chatApi = {
  // Get available models
  getModels: (): Promise<{
    providers: Array<{
      id: string;
      name: string;
      models: Array<{
        id: string;
        name: string;
        provider: string;
        description?: string;
        maxTokens?: number;
        contextWindow?: number;
        pricing?: {
          input: number;
          output: number;
        };
      }>;
    }>;
  }> => apiClient.get("/chat/models").then((res) => res.data),

  // Chat with documents (non-streaming)
  chatWithDocuments: (data: {
    message: string;
    datasetId: string;
    documentIds?: string[];
    segmentIds?: string[];
    maxChunks?: number;
    temperature?: number;
    conversationId?: string;
    conversationTitle?: string;
    includeConversationHistory?: boolean;
    conversationHistoryLimit?: number;
  }): Promise<{
    message: {
      id: string;
      content: string;
      role: string;
      status: string;
      createdAt: string;
      updatedAt: string;
      sourceChunkIds?: string;
      sourceDocuments?: string;
      metadata?: {
        tokensUsed?: number;
        model?: string;
        provider?: string;
      };
    };
    conversationId: string;
    sourceChunks: Array<{
      id: string;
      content: string;
      documentId: string;
      documentName: string;
      similarity: number;
    }>;
    metadata: {
      tokensUsed?: number;
      processingTime?: number;
      model?: string;
      provider?: string;
    };
  }> =>
    apiClient
      .post("/chat/with-documents", { ...data, stream: false })
      .then((res) => res.data),

  // Get conversations
  getConversations: (
    datasetId?: string
  ): Promise<
    Array<{
      id: string;
      title: string;
      description?: string;
      selectedDocumentIds?: string[];
      selectedSegmentIds?: string[];
      metadata?: Record<string, unknown>;
      userId: string;
      datasetId: string;
      createdAt: string;
      updatedAt: string;
      messages?: Array<{
        id: string;
        content: string;
        role: string;
        status: string;
        createdAt: string;
        updatedAt: string;
        sourceChunkIds?: string;
        sourceDocuments?: string;
        metadata?: Record<string, unknown>;
      }>;
    }>
  > => {
    const params = datasetId ? { datasetId } : {};
    return apiClient
      .get("/chat/conversations", { params })
      .then((res) => res.data);
  },

  // Get latest conversation for dataset
  getLatestConversation: async (
    datasetId: string
  ): Promise<Conversation | null> => {
    try {
      const response = await apiClient.get(
        `/chat/conversations/latest?datasetId=${datasetId}`
      );
      return response.data;
    } catch (error: unknown) {
      // If no conversation exists, return null instead of throwing
      if (
        error &&
        typeof error === "object" &&
        "response" in error &&
        error.response &&
        typeof error.response === "object" &&
        "status" in error.response &&
        error.response.status === 404
      ) {
        return null;
      }
      console.warn("Failed to load latest conversation:", error);
      return null;
    }
  },

  // Get conversation messages
  getConversationMessages: (
    conversationId: string
  ): Promise<
    Array<{
      id: string;
      content: string;
      role: string;
      status: string;
      createdAt: string;
      updatedAt: string;
      sourceChunkIds?: string;
      sourceDocuments?: string;
      metadata?: Record<string, unknown>;
    }>
  > =>
    apiClient
      .get(`/chat/conversations/${conversationId}/messages`)
      .then((res) => res.data),

  // Get conversation messages (paginated)
  getConversationMessagesPaginated: async (
    conversationId: string,
    page: number = 1,
    limit: number = 10
  ): Promise<PaginatedMessagesResponse> => {
    try {
      const response = await apiClient.get(
        `/chat/conversations/${conversationId}/messages/paginated`,
        {
          params: { page, limit },
        }
      );
      return response.data;
    } catch (error: unknown) {
      console.warn("Failed to load conversation messages:", error);
      // Return empty response instead of throwing
      return {
        messages: [],
        total: 0,
        hasMore: false,
        page: 1,
        limit: 10,
      };
    }
  },

  // Chat with documents (streaming)
  chatWithDocumentsStream: async (
    data: {
      message: string;
      datasetId: string;
      documentIds?: string[];
      segmentIds?: string[];
      maxChunks?: number;
      temperature?: number;
      conversationId?: string;
      conversationTitle?: string;
      includeConversationHistory?: boolean;
      conversationHistoryLimit?: number;
    },
    onToken: (token: string) => void,
    onComplete: (response: {
      message: ChatMessage;
      conversationId: string;
      sourceChunks: SourceChunk[];
      metadata: Record<string, unknown>;
    }) => void,
    onError: (error: string) => void
  ): Promise<void> => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}/chat/with-documents/stream`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("authToken")}`,
          },
          body: JSON.stringify({ ...data, stream: true }),
        }
      );

      if (!response.ok) {
        let errorMessage = `HTTP error! status: ${response.status}`;
        try {
          const errorData = await response.text();
          errorMessage = `API Error (${response.status}): ${errorData}`;
        } catch {
          // If we can't parse the error response, use the default message
        }
        throw new Error(errorMessage);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response body reader available");
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const eventData = JSON.parse(line.slice(6));

              if (eventData.type === "token" && eventData.content) {
                onToken(eventData.content);
              } else if (eventData.type === "complete") {
                onComplete({
                  message: eventData.message,
                  conversationId: eventData.conversationId,
                  sourceChunks: eventData.sourceChunks,
                  metadata: eventData.metadata,
                });
              } else if (eventData.type === "error") {
                onError(eventData.error || "Unknown error occurred");
              }
            } catch {
              // If JSON parsing fails, treat it as an error
              onError(`Failed to parse server response: ${line.slice(6)}`);
            }
          }
        }
      }
    } catch (error) {
      onError(
        error instanceof Error ? error.message : "Unknown error occurred"
      );
    }
  },
};

// User API functions
export const userApi = {
  // Get user settings
  getSettings: async (userId: string): Promise<object> => {
    const response = await apiClient.get(`/users/${userId}/settings`);
    return response.data;
  },

  // Update user settings
  updateSettings: async (userId: string, settings: object): Promise<object> => {
    const response = await apiClient.patch(
      `/users/${userId}/settings`,
      settings
    );
    return response.data;
  },

  // User graph settings methods
  updateUserGraphSettings: async (
    userId: string,
    graphSettings: {
      aiProviderId?: string;
      model?: string;
      promptId?: string;
      temperature?: number;
    }
  ): Promise<any> => {
    const response = await apiClient.put(
      `/users/${userId}/graph-settings`,
      graphSettings
    );
    return response.data;
  },

  getUserGraphSettings: async (userId: string): Promise<any> => {
    const response = await apiClient.get(`/users/${userId}/graph-settings`);
    return response.data;
  },
};

// API Key API functions
export const apiKeyApi = {
  // Get all API keys for the current user
  list: async (): Promise<ApiKey[]> => {
    const response = await apiClient.get("/api-keys");
    return response.data;
  },

  // Create a new API key
  create: async (name: string): Promise<ApiKeyCreateResponse> => {
    const response = await apiClient.post("/api-keys", { name });
    return response.data;
  },

  // Get a specific API key by ID
  get: async (id: string): Promise<ApiKey> => {
    const response = await apiClient.get(`/api-keys/${id}`);
    return response.data;
  },

  // Delete an API key
  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/api-keys/${id}`);
  },
};

// Graph API Types
export interface GraphNode {
  id: string;
  datasetId: string;
  documentId: string;
  segmentId?: string;
  type:
    | "author"
    | "brand"
    | "topic"
    | "hashtag"
    | "influencer"
    | "location"
    | "organization"
    | "product"
    | "event";
  label: string;
  properties?: {
    normalized_name?: string;
    channel?: string;
    platform?: string;
    verified?: boolean;
    follower_count?: number;
    engagement_rate?: number;
    sentiment_score?: number;
    confidence?: number;
    temporal_data?: {
      first_mentioned: string;
      last_mentioned: string;
      mention_count: number;
    };
    [key: string]: unknown;
  };
  createdAt: string;
  updatedAt: string;
}

export interface GraphEdge {
  id: string;
  datasetId: string;
  sourceNodeId: string;
  targetNodeId: string;
  type:
    | "mentions"
    | "sentiment"
    | "interacts_with"
    | "competes_with"
    | "discusses"
    | "shares_topic"
    | "follows"
    | "collaborates"
    | "influences"
    | "located_in"
    | "part_of"
    | "related_to";
  weight: number;
  properties?: {
    sentiment?: "positive" | "negative" | "neutral";
    sentiment_score?: number;
    interaction_count?: number;
    engagement_rate?: number;
    temporal_data?: {
      first_interaction: string;
      last_interaction: string;
      frequency: number;
    };
    confidence?: number;
    context?: string;
    [key: string]: unknown;
  };
  createdAt: string;
  updatedAt: string;
}

export interface GraphQuery {
  nodeTypes?: string[];
  edgeTypes?: string[];
  labels?: string[];
  brands?: string[];
  authors?: string[];
  topics?: string[];
  startDate?: string;
  endDate?: string;
  minWeight?: number;
  maxWeight?: number;
  limit?: number;
  offset?: number;
  searchTerm?: string;
  includeProperties?: boolean;
  propertiesFilter?: Record<string, unknown>;
  sortBy?: "createdAt" | "updatedAt" | "weight" | "label";
  sortOrder?: "ASC" | "DESC";
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: {
    totalNodes: number;
    totalEdges: number;
    nodeTypeDistribution: Array<{ type: string; count: number }>;
    edgeTypeDistribution: Array<{ type: string; count: number }>;
    topBrands: Array<{ brand: string; mentionCount: number }>;
  };
}

export interface GraphExtractionConfig {
  promptId?: string;
  aiProviderId?: string;
  model?: string;
  temperature?: number;
  enableDeduplication?: boolean;
  nodeTypeFilters?: {
    include?: string[];
    exclude?: string[];
  };
  edgeTypeFilters?: {
    include?: string[];
    exclude?: string[];
  };
  batchSize?: number;
  confidenceThreshold?: number;
  normalizationRules?: {
    brandNames?: Record<string, string>;
    authorNames?: Record<string, string>;
    topicMappings?: Record<string, string>;
  };
  extractionSettings?: {
    extractSentiment?: boolean;
    extractEngagement?: boolean;
    extractTemporalData?: boolean;
    extractCompetitorMentions?: boolean;
    extractInfluencerNetworks?: boolean;
  };
  syncMode?: boolean; // Execute synchronously instead of using queue
}

export interface BrandComparisonRequest {
  brands: string[];
  metrics?: string[];
  startDate?: string;
  endDate?: string;
  limit?: number;
  timeGranularity?: "hour" | "day" | "week" | "month";
  confidenceThreshold?: number;
}

export interface BrandComparisonResponse {
  brands: string[];
  comparisonDate: string;
  metrics: {
    sentiment?: Array<{
      brand: string;
      positive: number;
      negative: number;
      neutral: number;
      total: number;
      averageScore: number;
      trend: "increasing" | "decreasing" | "stable";
    }>;
    mentionVolume?: Array<{
      brand: string;
      totalMentions: number;
      uniqueAuthors: number;
      averagePerDay: number;
      peakDate: string;
      peakMentions: number;
    }>;
    engagement?: Array<{
      brand: string;
      totalLikes: number;
      totalShares: number;
      totalComments: number;
      averageEngagementRate: number;
      topPerformingPost: {
        content: string;
        engagement: number;
        date: string;
      };
    }>;
    topicAnalysis?: Array<{
      brand: string;
      topics: Array<{
        topic: string;
        frequency: number;
        sentiment: number;
        uniqueAuthors: number;
      }>;
      uniqueTopics: string[];
      sharedTopics: string[];
    }>;
    influencerOverlap?: Array<{
      brand1: string;
      brand2: string;
      sharedInfluencers: Array<{
        influencer: string;
        mentions1: number;
        mentions2: number;
        overlapScore: number;
      }>;
      overlapCoefficient: number;
      uniqueInfluencers1: number;
      uniqueInfluencers2: number;
    }>;
    competitiveLandscape?: Array<{
      brand: string;
      competitors: Array<{
        competitor: string;
        coMentionFrequency: number;
        competitiveSentiment: number;
        marketPosition: "leader" | "challenger" | "follower" | "niche";
      }>;
      marketShare: number;
      competitiveIntensity: number;
    }>;
    temporalTrends?: Array<{
      date: string;
      data: Record<string, number>;
    }>;
  };
  summary: {
    totalBrands: number;
    analysisPeriod: {
      start: string;
      end: string;
    };
    keyInsights: string[];
    recommendations: string[];
  };
}

// Graph API functions
export const graphApi = {
  // Get graph data for a dataset
  getGraphData: async (
    datasetId: string,
    query?: GraphQuery
  ): Promise<GraphData> => {
    const response = await apiClient.get(`/graph/datasets/${datasetId}/graph`, {
      params: query,
    });
    return response.data.data;
  },

  // Get graph nodes
  getNodes: async (
    datasetId: string,
    query?: GraphQuery
  ): Promise<{
    data: GraphNode[];
    total: number;
    page: number;
    limit: number;
  }> => {
    const response = await apiClient.get(`/graph/datasets/${datasetId}/nodes`, {
      params: query,
    });
    return response.data;
  },

  // Get graph edges
  getEdges: async (
    datasetId: string,
    query?: GraphQuery
  ): Promise<{
    data: GraphEdge[];
    total: number;
    page: number;
    limit: number;
  }> => {
    const response = await apiClient.get(`/graph/datasets/${datasetId}/edges`, {
      params: query,
    });
    return response.data;
  },

  // Get graph statistics
  getStats: async (
    datasetId: string,
    query?: GraphQuery
  ): Promise<{
    totalNodes: number;
    totalEdges: number;
    nodeTypeDistribution: Array<{ type: string; count: number }>;
    edgeTypeDistribution: Array<{ type: string; count: number }>;
    topBrands: Array<{ brand: string; mentionCount: number }>;
  }> => {
    const response = await apiClient.get(`/graph/datasets/${datasetId}/stats`, {
      params: query,
    });
    return response.data.data;
  },

  // Get graph data for a specific segment
  getSegmentGraphData: async (
    segmentId: string
  ): Promise<{
    nodes: GraphNode[];
    edges: GraphEdge[];
  }> => {
    const response = await apiClient.get(`/graph/segments/${segmentId}/graph`);
    return response.data.data;
  },

  // Trigger graph extraction for a dataset
  triggerExtraction: async (
    datasetId: string,
    config: GraphExtractionConfig
  ): Promise<{ success: boolean; message: string; jobCount: number }> => {
    const response = await apiClient.post(
      `/graph/datasets/${datasetId}/extract`,
      config
    );
    return response.data;
  },

  // Trigger graph extraction for a specific document
  triggerDocumentExtraction: async (
    documentId: string,
    config: GraphExtractionConfig
  ): Promise<{ success: boolean; message: string; documentId: string }> => {
    const response = await apiClient.post(
      `/graph/documents/${documentId}/extract`,
      config
    );
    return response.data;
  },

  // Trigger graph extraction for specific segments
  triggerSegmentExtraction: async (
    documentId: string,
    segmentIds: string[],
    config: GraphExtractionConfig
  ): Promise<{
    success: boolean;
    message: string;
    nodesCreated: number;
    edgesCreated: number;
    nodes?: GraphNode[];
    edges?: GraphEdge[];
  }> => {
    const response = await apiClient.post(
      `/graph/documents/${documentId}/segments/extract`,
      {
        segmentIds,
        ...config,
      }
    );
    return response.data;
  },

  // Get a specific node
  getNode: async (nodeId: string): Promise<GraphNode> => {
    const response = await apiClient.get(`/graph/nodes/${nodeId}`);
    return response.data.data;
  },

  // Get a specific edge
  getEdge: async (edgeId: string): Promise<GraphEdge> => {
    const response = await apiClient.get(`/graph/edges/${edgeId}`);
    return response.data.data;
  },

  // Get node neighbors
  getNodeNeighbors: async (
    datasetId: string,
    nodeId: string,
    depth?: number,
    nodeTypes?: string[]
  ): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> => {
    const response = await apiClient.get(
      `/graph/datasets/${datasetId}/nodes/${nodeId}/neighbors`,
      {
        params: { depth, nodeTypes: nodeTypes?.join(",") },
      }
    );
    return response.data.data;
  },

  // Find shortest path between nodes
  getShortestPath: async (
    datasetId: string,
    sourceId: string,
    targetId: string,
    maxDepth?: number
  ): Promise<{
    path: GraphNode[];
    distance: number;
    edges: GraphEdge[];
  } | null> => {
    const response = await apiClient.get(
      `/graph/datasets/${datasetId}/shortest-path/${sourceId}/${targetId}`,
      {
        params: { maxDepth },
      }
    );
    return response.data.data;
  },

  // Detect communities
  getCommunities: async (
    datasetId: string,
    minSize?: number
  ): Promise<{
    communities: Array<{
      id: number;
      nodes: GraphNode[];
      size: number;
      density: number;
    }>;
    modularity: number;
  }> => {
    const response = await apiClient.get(
      `/graph/datasets/${datasetId}/communities`,
      {
        params: { minSize },
      }
    );
    return response.data.data;
  },

  // Calculate centrality
  getCentrality: async (
    datasetId: string,
    type: "degree" | "betweenness" | "closeness" = "degree",
    limit?: number
  ): Promise<Array<{ node: GraphNode; centrality: number; rank: number }>> => {
    const response = await apiClient.get(
      `/graph/datasets/${datasetId}/centrality`,
      {
        params: { type, limit },
      }
    );
    return response.data.data;
  },

  // Get influential nodes
  getInfluentialNodes: async (
    datasetId: string,
    nodeType?: string,
    minConnections?: number,
    limit?: number
  ): Promise<Array<{ node: GraphNode; centrality: number; rank: number }>> => {
    const response = await apiClient.get(
      `/graph/datasets/${datasetId}/influential-nodes`,
      {
        params: { nodeType, minConnections, limit },
      }
    );
    return response.data.data;
  },

  // Get bridge nodes
  getBridgeNodes: async (
    datasetId: string,
    minBetweenness?: number
  ): Promise<Array<{ node: GraphNode; centrality: number; rank: number }>> => {
    const response = await apiClient.get(
      `/graph/datasets/${datasetId}/bridge-nodes`,
      {
        params: { minBetweenness },
      }
    );
    return response.data.data;
  },

  // Get graph metrics
  getGraphMetrics: async (
    datasetId: string
  ): Promise<{ density: number; averagePathLength: number }> => {
    const response = await apiClient.get(
      `/graph/datasets/${datasetId}/graph-metrics`
    );
    return response.data.data;
  },

  // Delete graph data
  deleteGraphData: async (
    datasetId: string
  ): Promise<{ success: boolean; message: string }> => {
    const response = await apiClient.delete(`/graph/datasets/${datasetId}`);
    return response.data;
  },

  // Clear graph data for a specific segment
  clearSegmentGraph: async (
    segmentId: string
  ): Promise<{ success: boolean; message: string }> => {
    const response = await apiClient.delete(`/graph/segments/${segmentId}`);
    return response.data;
  },

  // Entity Dictionary APIs
  entityDictionary: {
    // Get entities with pagination and filters
    getEntities: async (
      datasetId: string,
      params?: {
        entityType?: string;
        searchTerm?: string;
        source?: string;
        limit?: number;
        offset?: number;
      }
    ) => {
      const response = await apiClient.get(
        `/graph/datasets/${datasetId}/entities`,
        { params }
      );
      return response.data;
    },

    // Get entity statistics
    getStatistics: async (datasetId: string) => {
      const response = await apiClient.get(
        `/graph/datasets/${datasetId}/entities/statistics`
      );
      return response.data;
    },

    // Get entity suggestions
    getSuggestions: async (datasetId: string) => {
      const response = await apiClient.get(
        `/graph/datasets/${datasetId}/entities/suggestions`
      );
      return response.data;
    },

    // Create entity
    createEntity: async (
      datasetId: string,
      data: {
        entityType: string;
        canonicalName: string;
        confidenceScore?: number;
        source?: string;
        metadata?: any;
        aliases?: string[];
      }
    ) => {
      const response = await apiClient.post(
        `/graph/datasets/${datasetId}/entities`,
        data
      );
      return response.data;
    },

    // Update entity
    updateEntity: async (
      datasetId: string,
      entityId: string,
      data: {
        entityType?: string;
        canonicalName?: string;
        confidenceScore?: number;
        source?: string;
        metadata?: any;
        aliases?: string[];
      }
    ) => {
      const response = await apiClient.put(
        `/graph/datasets/${datasetId}/entities/${entityId}`,
        data
      );
      return response.data;
    },

    // Delete entity
    deleteEntity: async (datasetId: string, entityId: string) => {
      const response = await apiClient.delete(
        `/graph/datasets/${datasetId}/entities/${entityId}`
      );
      return response.data;
    },

    // Bulk import entities
    bulkImport: async (
      datasetId: string,
      data: {
        entities: Array<{
          entityType: string;
          canonicalName: string;
          description?: string;
          category?: string;
          tags?: string[];
          aliases?: string[];
          metadata?: any;
        }>;
        source?: string;
        options?: {
          skipDuplicates?: boolean;
          updateExisting?: boolean;
          defaultConfidence?: number;
        };
      }
    ) => {
      const response = await apiClient.post(
        `/graph/datasets/${datasetId}/entities/bulk-import`,
        data
      );
      return response.data;
    },

    // Export entities
    exportEntities: async (datasetId: string) => {
      const response = await apiClient.get(
        `/graph/datasets/${datasetId}/entities/export`
      );
      return response.data;
    },

    // Auto-discover entities from existing graph
    autoDiscover: async (datasetId: string) => {
      const response = await apiClient.post(
        `/graph/datasets/${datasetId}/entities/auto-discover`
      );
      return response.data;
    },

    // Discover aliases
    discoverAliases: async (datasetId: string) => {
      const response = await apiClient.post(
        `/graph/datasets/${datasetId}/entities/discover-aliases`
      );
      return response.data;
    },
  },

  // Entity Normalization APIs
  entityNormalization: {
    // Trigger normalization
    normalize: async (
      datasetId: string,
      data: {
        nodeIds?: string[];
        entityType?: string;
        similarityThreshold?: number;
        method?: string;
        confidenceThreshold?: number;
        keyNodeId?: string;
      }
    ) => {
      const response = await apiClient.post(
        `/graph/datasets/${datasetId}/normalize`,
        data
      );
      return response.data;
    },

    // Normalize specific node
    normalizeNode: async (
      nodeId: string,
      data: {
        datasetId: string;
        threshold?: number;
      }
    ) => {
      const response = await apiClient.post(
        `/graph/nodes/${nodeId}/normalize`,
        data
      );
      return response.data;
    },

    // Find duplicates
    findDuplicates: async (
      datasetId: string,
      data: {
        nodeType?: string;
        threshold?: number;
      }
    ) => {
      const response = await apiClient.post(
        `/graph/datasets/${datasetId}/find-duplicates`,
        data
      );
      return response.data;
    },

    // Merge nodes
    mergeNodes: async (
      datasetId: string,
      data: {
        sourceIds: string[];
        targetId: string;
      }
    ) => {
      const response = await apiClient.post(
        `/graph/datasets/${datasetId}/merge-nodes`,
        data
      );
      return response.data;
    },

    // Schedule normalization job
    scheduleNormalization: async (
      datasetId: string,
      data: {
        nodeTypes?: string[];
        similarityThreshold?: number;
        batchSize?: number;
      }
    ) => {
      const response = await apiClient.post(
        `/graph/datasets/${datasetId}/schedule-normalization`,
        data
      );
      return response.data;
    },

    // Get normalization logs
    getLogs: async (
      datasetId: string,
      params?: {
        limit?: number;
        offset?: number;
      }
    ) => {
      const response = await apiClient.get(
        `/graph/datasets/${datasetId}/normalization-logs`,
        { params }
      );
      return response.data;
    },

    // Get normalization statistics
    getStats: async (datasetId: string) => {
      const response = await apiClient.get(
        `/graph/datasets/${datasetId}/normalization-stats`
      );
      return response.data;
    },
  },
};

// Brand Comparison API functions
export const brandComparisonApi = {
  // Compare brands
  compareBrands: async (
    datasetId: string,
    request: BrandComparisonRequest
  ): Promise<BrandComparisonResponse> => {
    const response = await apiClient.post(
      `/brand-comparison/datasets/${datasetId}/compare`,
      request
    );
    return response.data.data;
  },

  // Compare brand sentiment
  compareSentiment: async (
    datasetId: string,
    request: BrandComparisonRequest
  ): Promise<
    Array<{
      brand: string;
      positive: number;
      negative: number;
      neutral: number;
      total: number;
      averageScore: number;
      trend: "increasing" | "decreasing" | "stable";
    }>
  > => {
    const response = await apiClient.post(
      `/brand-comparison/datasets/${datasetId}/sentiment-analysis`,
      request
    );
    return response.data.data;
  },

  // Compare mention volume
  compareMentionVolume: async (
    datasetId: string,
    request: BrandComparisonRequest
  ): Promise<
    Array<{
      brand: string;
      totalMentions: number;
      uniqueAuthors: number;
      averagePerDay: number;
      peakDate: string;
      peakMentions: number;
    }>
  > => {
    const response = await apiClient.post(
      `/brand-comparison/datasets/${datasetId}/mention-volume`,
      request
    );
    return response.data.data;
  },

  // Compare engagement
  compareEngagement: async (
    datasetId: string,
    request: BrandComparisonRequest
  ): Promise<
    Array<{
      brand: string;
      totalLikes: number;
      totalShares: number;
      totalComments: number;
      averageEngagementRate: number;
      topPerformingPost: {
        content: string;
        engagement: number;
        date: string;
      };
    }>
  > => {
    const response = await apiClient.post(
      `/brand-comparison/datasets/${datasetId}/engagement-analysis`,
      request
    );
    return response.data.data;
  },

  // Compare topics
  compareTopics: async (
    datasetId: string,
    request: BrandComparisonRequest
  ): Promise<
    Array<{
      brand: string;
      topics: Array<{
        topic: string;
        frequency: number;
        sentiment: number;
        uniqueAuthors: number;
      }>;
      uniqueTopics: string[];
      sharedTopics: string[];
    }>
  > => {
    const response = await apiClient.post(
      `/brand-comparison/datasets/${datasetId}/topic-analysis`,
      request
    );
    return response.data.data;
  },

  // Analyze influencer overlap
  analyzeInfluencerOverlap: async (
    datasetId: string,
    request: BrandComparisonRequest
  ): Promise<
    Array<{
      brand1: string;
      brand2: string;
      sharedInfluencers: Array<{
        influencer: string;
        mentions1: number;
        mentions2: number;
        overlapScore: number;
      }>;
      overlapCoefficient: number;
      uniqueInfluencers1: number;
      uniqueInfluencers2: number;
    }>
  > => {
    const response = await apiClient.post(
      `/brand-comparison/datasets/${datasetId}/influencer-overlap`,
      request
    );
    return response.data.data;
  },

  // Analyze competitive landscape
  analyzeCompetitiveLandscape: async (
    datasetId: string,
    request: BrandComparisonRequest
  ): Promise<
    Array<{
      brand: string;
      competitors: Array<{
        competitor: string;
        coMentionFrequency: number;
        competitiveSentiment: number;
        marketPosition: "leader" | "challenger" | "follower" | "niche";
      }>;
      marketShare: number;
      competitiveIntensity: number;
    }>
  > => {
    const response = await apiClient.post(
      `/brand-comparison/datasets/${datasetId}/competitive-landscape`,
      request
    );
    return response.data.data;
  },

  // Analyze temporal trends
  analyzeTemporalTrends: async (
    datasetId: string,
    request: BrandComparisonRequest
  ): Promise<
    Array<{
      date: string;
      data: Record<string, number>;
    }>
  > => {
    const response = await apiClient.post(
      `/brand-comparison/datasets/${datasetId}/temporal-trends`,
      request
    );
    return response.data.data;
  },
};

// Queue API functions
export const queueApi = {
  getStatus: async (): Promise<{
    status: string;
    timestamp: string;
    jobCounts: {
      waiting: number;
      active: number;
      completed: number;
      failed: number;
      delayed: number;
      paused: number;
    };
    details: {
      waiting: number;
      active: number;
      completed: number;
      failed: number;
    };
    waitingJobs: Array<{
      id: string;
      name: string;
      data: any;
      createdAt: number;
    }>;
    activeJobs: Array<{
      id: string;
      name: string;
      data: any;
      createdAt: number;
    }>;
  }> => {
    const response = await apiClient.get("/queue-status");
    return response.data;
  },

  retryFailedJobs: async (): Promise<{
    status: string;
    message: string;
    retriedJobs: Array<{ id: string; name: string }>;
    timestamp: string;
  }> => {
    const response = await apiClient.get("/queue-status/retry-failed");
    return response.data;
  },

  resumeJobs: async (
    datasetId: string
  ): Promise<{
    status: string;
    message: string;
    datasetId: string;
    queuedJobs: number;
    documents: string[];
    timestamp: string;
  }> => {
    const response = await apiClient.post("/queue-status/resume-jobs", {
      datasetId,
    });
    return response.data;
  },
};

// Posts API interface
export interface Post {
  id: string;
  hash: string;
  provider?: string;
  source?: string;
  title?: string;
  meta?: Record<string, any>;
  userId?: string;
  datasetId?: string;
  createdAt: string;
  updatedAt: string;
  user?: {
    id: string;
    email: string;
  };
  dataset?: {
    id: string;
    name: string;
  };
}

export interface CreatePostDto {
  hash: string;
  provider?: string;
  source?: string;
  title?: string;
  meta?: Record<string, any>;
  userId?: string;
  datasetId?: string;
}

export interface UpdatePostDto extends Partial<CreatePostDto> {}

export interface PostSearchParams {
  hash?: string;
  provider?: string;
  source?: string;
  title?: string;
  metaKey?: string;
  metaValue?: string;
  userId?: string;
  datasetId?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export interface PaginatedPostsResponse {
  data: Post[];
  total: number;
  page: number;
  limit: number;
}

// Posts API functions
export const postsApi = {
  getAll: async (
    params?: PostSearchParams
  ): Promise<PaginatedPostsResponse> => {
    const response = await apiClient.get("/posts/search", { params });
    // Handle response format: { success: true, data: [], total, page, limit }
    if (response.data.success) {
      return {
        data: response.data.data || [],
        total: response.data.total || 0,
        page: response.data.page || 1,
        limit: response.data.limit || 20,
      };
    }
    // Fallback to direct response
    return response.data;
  },

  getById: async (id: string): Promise<Post> => {
    const response = await apiClient.get(`/posts/${id}`);
    return response.data;
  },

  getByHash: async (hash: string): Promise<Post | null> => {
    try {
      const response = await apiClient.get(`/posts/by-hash/${hash}`);
      return response.data.data || null;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  },

  create: async (data: CreatePostDto): Promise<Post> => {
    const response = await apiClient.post("/posts", data);
    return response.data;
  },

  update: async (id: string, data: UpdatePostDto): Promise<Post> => {
    const response = await apiClient.put(`/posts/${id}`, data);
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/posts/${id}`);
  },

  upsert: async (data: CreatePostDto, strategy?: string): Promise<Post> => {
    const response = await apiClient.post("/posts/upsert", data, {
      params: strategy ? { strategy } : undefined,
    });
    return response.data.data || response.data;
  },

  bulkUpsert: async (
    posts: CreatePostDto[],
    strategy?: string
  ): Promise<{ created: number; updated: number }> => {
    const response = await apiClient.post(
      "/posts/bulk-upsert",
      { posts },
      {
        params: strategy ? { strategy } : undefined,
      }
    );
    return response.data;
  },
};

// Export workflow API
export { workflowApi } from "./api/workflow";

// Export apiClient as named export for convenience
export { apiClient };

export default apiClient;
