import {
  ChatMessage,
  MessageRole,
  MessageStatus,
} from '../entities/chat-message.entity';

export class ChatResponseDto {
  message: ChatMessage;
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
}

export class ChatMessageDto {
  id: string;
  content: string;
  role: MessageRole;
  status: MessageStatus;
  createdAt: Date;
  updatedAt: Date;
  sourceChunkIds?: string; // JSON string, not array
  sourceDocuments?: string; // JSON string, not array
  metadata?: object;
}

export class PaginatedMessagesResponseDto {
  messages: ChatMessageDto[];
  total: number;
  hasMore: boolean;
  page: number;
  limit: number;
}

export class ConversationDto {
  id: string;
  title: string;
  description?: string;
  selectedDocumentIds?: string[];
  selectedSegmentIds?: string[];
  metadata?: object;
  userId: string;
  datasetId: string;
  createdAt: Date;
  updatedAt: Date;
}
