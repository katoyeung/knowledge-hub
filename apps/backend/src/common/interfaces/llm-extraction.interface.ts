import { Prompt } from '@modules/prompts/entities/prompt.entity';
import { AiProvider } from '@modules/ai-provider/entities/ai-provider.entity';
import { LLMMessage } from './llm-client.interface';

/**
 * Configuration for LLM-based extraction/processing
 */
export interface LLMExtractionConfig {
  prompt: Prompt;
  aiProvider: AiProvider;
  model: string;
  temperature?: number;
  content: string;
  templateVariables?: Record<string, string>;
}

/**
 * Result of LLM extraction/processing
 */
export interface LLMExtractionResult<T = any> {
  success: boolean;
  data?: T;
  rawContent?: string;
  error?: string;
}

/**
 * Options for parsing JSON from LLM response
 */
export interface JSONParseOptions {
  /**
   * Whether to allow fallback parsing from text if JSON is not found
   */
  allowTextFallback?: boolean;
  /**
   * Custom parser function for text fallback
   */
  textParser?: (content: string) => any;
  /**
   * Whether to allow JSON arrays (default: true)
   */
  allowArrays?: boolean;
}
