export interface ChatSettings {
  // AI Provider Settings
  provider?: string;
  model?: string;
  temperature?: number;
  maxChunks?: number;
  promptId?: string;

  // 🆕 Search Weight Configuration
  bm25Weight?: number;
  embeddingWeight?: number;

  // Conversation History Settings
  includeConversationHistory?: boolean;
  conversationHistoryLimit?: number;
}

export interface ResolvedChatConfig {
  provider: any; // AiProvider type
  model: string;
  temperature: number;
  maxChunks: number;
  promptId?: string;
  includeConversationHistory: boolean;
  conversationHistoryLimit: number;
}
