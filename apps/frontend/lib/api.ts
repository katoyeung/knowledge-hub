import axios from "axios";

// Create axios instance with base configuration
const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001",
  timeout: 30000, // Increased timeout to 30 seconds for delete operations
  headers: {
    "Content-Type": "application/json",
  },
});

// Add request interceptor for authentication
apiClient.interceptors.request.use(
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

// Add response interceptor for error handling
apiClient.interceptors.response.use(
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

// Dataset API interface
export interface Dataset {
  id: string;
  name: string;
  description?: string;
  provider?: string;
  permission?: string;
  dataSourceType?: string;
  createdAt: string;
  updatedAt: string;
  user?: {
    id: string;
    email: string;
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
  keywords?: Record<string, unknown>;
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
  user?: {
    id: string;
    email: string;
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
    files: File[]
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
    // 🆕 Search Weight Configuration
    bm25Weight?: number;
    embeddingWeight?: number;
    // 🆕 LangChain RAG Configuration
    enableLangChainRAG?: boolean;
    langChainConfig?: string;
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
      // 🆕 Search Weight Configuration
      bm25Weight?: number;
      embeddingWeight?: number;
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
};

// Document API functions
export const documentApi = {
  // Get documents by dataset ID
  getByDataset: async (datasetId: string): Promise<Document[]> => {
    const response = await apiClient.get(
      `/documents?filter=dataset.id||eq||${datasetId}`
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
      enableLangChainRAG?: boolean;
      langChainConfig?: {
        chunkSize: number;
        chunkOverlap: number;
        numChunks: number;
        llmProvider: string;
        llmModel: string;
        embeddingModel: string;
      };
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
    if (options.enableLangChainRAG) {
      formData.append("enableLangChainRAG", "true");
    }
    if (options.langChainConfig) {
      formData.append(
        "langChainConfig",
        JSON.stringify(options.langChainConfig)
      );
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

  // Chat with documents
  chatWithDocuments: (data: {
    message: string;
    datasetId: string;
    documentIds?: string[];
    segmentIds?: string[];
    llmProvider?: string;
    model?: string;
    maxChunks?: number;
    temperature?: number;
    conversationId?: string;
    conversationTitle?: string;
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
  }> => apiClient.post("/chat/with-documents", data).then((res) => res.data),

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
      metadata?: any;
      userId: string;
      datasetId: string;
      createdAt: string;
      updatedAt: string;
      messages?: any[];
    }>
  > => {
    const params = datasetId ? { datasetId } : {};
    return apiClient
      .get("/chat/conversations", { params })
      .then((res) => res.data);
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
      metadata?: any;
    }>
  > =>
    apiClient
      .get(`/chat/conversations/${conversationId}/messages`)
      .then((res) => res.data),
};

export default apiClient;
