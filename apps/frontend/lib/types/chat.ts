export interface ModelInfo {
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
  available?: boolean;
  availabilityMessage?: string;
}

export interface ProviderInfo {
  id: string;
  name: string;
  models: ModelInfo[];
  available?: boolean;
  availabilityMessage?: string;
}

export interface ModelSelectionResponse {
  providers: ProviderInfo[];
}

export interface ChatMessage {
  id: string;
  content: string;
  role: "user" | "assistant" | "system";
  status: "pending" | "completed" | "failed";
  createdAt: string | Date;
  updatedAt: string | Date;
  sourceChunkIds?: string;
  sourceDocuments?: string;
  metadata?: {
    tokensUsed?: number;
    model?: string;
    provider?: string;
  };
}

export interface SourceChunk {
  id: string;
  content: string;
  documentId: string;
  documentName: string;
  similarity: number;
}

export interface ChatResponse {
  message: ChatMessage;
  conversationId: string;
  sourceChunks: SourceChunk[];
  metadata: {
    tokensUsed?: number;
    processingTime?: number;
    model?: string;
    provider?: string;
  };
}

export interface ChatWithDocumentsRequest {
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
}
