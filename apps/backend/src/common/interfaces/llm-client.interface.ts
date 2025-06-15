import { ApiResponse } from './api-client.interface';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

export interface LLMClient {
  chatCompletion(
    messages: LLMMessage[],
    model: string,
    jsonSchema?: Record<string, any>,
  ): Promise<ApiResponse<LLMResponse>>;
}
