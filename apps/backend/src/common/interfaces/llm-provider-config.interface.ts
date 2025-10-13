export interface LLMProviderConfig {
  baseUrl: string;
  apiKeyEnv: string;
  defaultModel: string;
  supportsJsonSchema: boolean;
  streamingFormat: 'sse' | 'json' | 'custom';
  customHeaders?: Record<string, string>;
  requestPath?: string; // For providers with different endpoints
  responseTransform?: {
    choicesPath: string;
    usagePath: string;
    contentPath: string;
  };
  streamTransform?: {
    dataPrefix?: string;
    doneSignal?: string;
    contentPath: string;
  };
}
