import axios from "axios";

// Create axios instance with base configuration
const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001",
  timeout: 10000,
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
  createdAt?: string;
  updatedAt?: string;
  processingStartedAt?: string;
  creator?: {
    id: string;
    email: string;
  };
  dataset?: Dataset;
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
  // Get segments by document ID
  getByDocument: async (documentId: string): Promise<DocumentSegment[]> => {
    const response = await apiClient.get(
      `/document-segments/document/${documentId}`
    );
    return response.data;
  },

  // Get segments by dataset ID
  getByDataset: async (datasetId: string): Promise<DocumentSegment[]> => {
    const response = await apiClient.get(
      `/document-segments/dataset/${datasetId}`
    );
    return response.data;
  },

  // Get all segments with pagination
  getAll: async (params?: {
    documentId?: string;
    datasetId?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    data: DocumentSegment[];
    total: number;
    page: number;
    limit: number;
  }> => {
    const response = await apiClient.get("/document-segments", { params });
    return response.data;
  },

  // Get segment by ID
  getById: async (id: string): Promise<DocumentSegment> => {
    const response = await apiClient.get(`/document-segments/${id}`);
    return response.data;
  },

  // Update segment
  update: async (
    id: string,
    data: Partial<DocumentSegment>
  ): Promise<DocumentSegment> => {
    const response = await apiClient.patch(`/document-segments/${id}`, data);
    return response.data;
  },

  // Delete segment
  delete: async (id: string): Promise<boolean> => {
    await apiClient.delete(`/document-segments/${id}`);
    return true;
  },

  // Toggle segment status
  toggleStatus: async (id: string): Promise<DocumentSegment> => {
    const response = await apiClient.patch(
      `/document-segments/${id}/toggle-status`
    );
    return response.data;
  },
};

export default apiClient;
