export interface LLMProviderConfig {
  baseUrl: string;
  apiKeyEnv: string;
  defaultModel: string | undefined;
  supportsJsonSchema: boolean;
  supportsStructuredOutput: boolean; // New: Support for structured output format
  structuredOutputFormat?: 'openai' | 'ollama' | 'custom'; // New: Format type for structured output
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
