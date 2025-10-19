import { Injectable } from '@nestjs/common';
import { BaseApiClient } from './base-api-client.service';
import { HttpService } from '@nestjs/axios';
import { Cache } from 'cache-manager';
import { ConfigService } from '@nestjs/config';
import {
  LLMClient,
  LLMMessage,
  LLMResponse,
} from '../interfaces/llm-client.interface';
import { ApiResponse } from '../interfaces/api-client.interface';
import { LLMProviderConfig } from '../interfaces/llm-provider-config.interface';
import { createHash } from 'crypto';
import { CACHE_KEYS } from '@common/constants/cache-keys';
import { firstValueFrom } from 'rxjs';

@Injectable()
export abstract class BaseLLMClientV2
  extends BaseApiClient
  implements LLMClient
{
  protected abstract readonly providerConfig: LLMProviderConfig;
  protected cacheTTL: number;

  constructor(
    configService: ConfigService,
    httpService: HttpService,
    cacheManager: Cache,
  ) {
    super(
      {
        baseUrl: '', // Will be set by initializeConfig
        apiKey: '', // Will be set by initializeConfig
        timeout: 300000,
        cacheTTL: 0,
      },
      httpService,
      cacheManager,
    );
    this.cacheTTL = 0;
  }

  protected initializeConfig(configService: ConfigService): void {
    this.config.baseUrl =
      configService.get<string>(this.providerConfig.baseUrl) ||
      this.providerConfig.baseUrl;
    this.config.apiKey =
      configService.get<string>(this.providerConfig.apiKeyEnv) || '';
    this.cacheTTL =
      configService.get<number>(
        `${this.providerConfig.apiKeyEnv}_CACHE_TTL`,
        0,
      ) * 1000;
  }

  protected get defaultModel(): string | undefined {
    return this.providerConfig.defaultModel;
  }

  protected getLLMCacheKey(
    messages: LLMMessage[],
    model: string,
    jsonSchema?: Record<string, any>,
    temperature?: number,
  ): string {
    const content = JSON.stringify({
      messages,
      model,
      jsonSchema,
      temperature,
    });
    const hash = createHash('sha256').update(content).digest('hex');
    return `${CACHE_KEYS.LLM.RESPONSE}:${this.constructor.name}:${hash}`;
  }

  protected async getCachedResponse<T>(
    cacheKey: string,
  ): Promise<ApiResponse<T> | null> {
    // Skip cache if TTL is 0 (disabled)
    if (this.cacheTTL === 0) {
      return null;
    }

    try {
      const cachedData = await this.cacheManager.get<ApiResponse<T>>(cacheKey);
      if (cachedData) {
        this.logger.debug(
          `Cache hit for ${cacheKey} - TTL: ${this.cacheTTL}ms`,
        );
        return cachedData;
      }
    } catch (error) {
      this.logger.warn(`Cache error: ${error.message}`);
    }
    return null;
  }

  protected async setCachedResponse<T>(
    cacheKey: string,
    response: ApiResponse<T>,
  ): Promise<void> {
    // Skip cache if TTL is 0 (disabled)
    if (this.cacheTTL === 0) {
      return;
    }

    try {
      await this.cacheManager.set(cacheKey, response, this.cacheTTL);
      this.logger.debug(`Cached response for ${cacheKey}`);
    } catch (error) {
      this.logger.warn(`Cache error: ${error.message}`);
    }
  }

  // Common implementation for all providers
  async chatCompletion(
    messages: LLMMessage[],
    model: string = this.defaultModel || '',
    jsonSchema?: Record<string, any>,
    temperature?: number,
  ): Promise<ApiResponse<LLMResponse>> {
    // Validate that model is provided
    if (!model) {
      throw new Error(
        'Model is required but not provided. Please configure a model in your dataset settings.',
      );
    }

    const cacheKey = this.getLLMCacheKey(
      messages,
      model,
      jsonSchema,
      temperature,
    );

    // Try to get from cache first
    const cachedResponse = await this.getCachedResponse<LLMResponse>(cacheKey);
    if (cachedResponse) {
      return cachedResponse;
    }

    // Build request payload
    const payload = this.buildRequestPayload(
      messages,
      model,
      jsonSchema,
      temperature,
      false,
    );
    const headers = this.buildHeaders();

    try {
      const response = await this.makeRequest(payload, headers, false);
      const apiResponse = this.transformResponse(response);

      // Cache the response
      await this.setCachedResponse(cacheKey, apiResponse);

      return apiResponse;
    } catch (error) {
      this.logger.error(
        `${this.constructor.name} API request failed: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  // Common streaming implementation
  async *chatCompletionStream(
    messages: LLMMessage[],
    model: string = this.defaultModel || '',
    jsonSchema?: Record<string, any>,
    temperature?: number,
  ): AsyncGenerator<string, void, unknown> {
    // Build request payload
    const payload = this.buildRequestPayload(
      messages,
      model,
      jsonSchema,
      temperature,
      true,
    );
    const headers = this.buildHeaders();

    try {
      const response = await this.makeRequest(payload, headers, true);
      const stream = response.data;
      let buffer = '';

      for await (const chunk of stream) {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const content = this.parseStreamLine(line);
          if (content) {
            yield content;
          }
        }
      }
    } catch (error) {
      this.logger.error(
        `${this.constructor.name} streaming API request failed: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  // Template methods that each provider implements
  protected buildRequestPayload(
    messages: LLMMessage[],
    model: string,
    jsonSchema?: Record<string, any>,
    temperature?: number,
    stream?: boolean,
  ): any {
    const payload: any = {
      model,
      messages,
      temperature: temperature || 0.7,
      max_tokens: 4096,
      stream: stream || false,
    };

    // Handle JSON schema based on provider support
    if (jsonSchema) {
      if (this.providerConfig.supportsJsonSchema) {
        payload.response_format = {
          type: 'json_schema',
          json_schema: {
            name: 'graph_extraction',
            strict: true,
            schema: jsonSchema,
          },
        };
      } else if (this.providerConfig.supportsStructuredOutput) {
        // Handle structured output format based on provider type
        this.addStructuredOutputFormat(payload, jsonSchema);
      } else {
        // Inject into system message for providers that don't support it natively
        this.injectJsonSchema(messages, jsonSchema);
      }
    }

    return payload;
  }

  /**
   * Build request payload with structured output from a prompt
   */
  protected buildRequestPayloadFromPrompt(
    messages: LLMMessage[],
    model: string,
    prompt: any,
    temperature?: number,
    stream?: boolean,
  ): any {
    const payload: any = {
      model,
      messages,
      temperature: temperature || 0.7,
      max_tokens: 4096,
      stream: stream || false,
    };

    // Extract structured output configuration from prompt
    if (prompt?.jsonSchema) {
      const structuredOutput = this.adaptPromptSchemaForProvider(prompt);
      if (structuredOutput) {
        // Merge structured output into payload
        Object.assign(payload, structuredOutput);
      }
    }

    return payload;
  }

  /**
   * Adapt prompt schema for the current provider
   */
  protected adaptPromptSchemaForProvider(prompt: any): any {
    if (!prompt?.jsonSchema) {
      return null;
    }

    const schema = prompt.jsonSchema;
    const providerType = this.getProviderType();

    // Handle different schema structures
    const normalizedSchema = this.normalizeSchema(schema);

    if (this.providerConfig.supportsJsonSchema) {
      return this.buildOpenAIFormat(normalizedSchema, prompt);
    } else if (this.providerConfig.supportsStructuredOutput) {
      return this.buildProviderSpecificFormat(normalizedSchema, providerType);
    } else {
      // For providers without native support, inject into system message
      this.injectJsonSchema(prompt.messages || [], normalizedSchema);
      return {};
    }
  }

  /**
   * Get the provider type for this client
   */
  protected getProviderType(): string {
    // This should be overridden by each provider implementation
    return 'custom';
  }

  /**
   * Normalize schema to handle different input formats
   */
  protected normalizeSchema(schema: any): any {
    // Handle nested schema structure (e.g., { schema: { ... } })
    if (schema.schema) {
      return schema.schema;
    }

    // Handle OpenAI format with json_schema wrapper
    if (schema.json_schema) {
      return schema.json_schema;
    }

    // Return as-is if already normalized
    return schema;
  }

  /**
   * Build OpenAI-compatible format
   */
  protected buildOpenAIFormat(schema: any, prompt: any): any {
    return {
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: prompt.name || 'response',
          strict: schema.strict ?? true,
          schema: {
            ...schema,
            additionalProperties: schema.additionalProperties ?? false,
          },
        },
      },
    };
  }

  /**
   * Build provider-specific format
   */
  protected buildProviderSpecificFormat(
    schema: any,
    providerType: string,
  ): any {
    switch (providerType) {
      case 'ollama':
        return {
          format: {
            type: 'object',
            properties: schema.properties || {},
            required: schema.required || [],
            additionalProperties: schema.additionalProperties ?? false,
          },
        };

      case 'anthropic':
        return {
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'response',
              strict: schema.strict ?? true,
              schema: {
                ...schema,
                additionalProperties: schema.additionalProperties ?? false,
              },
            },
          },
        };

      default:
        // For custom providers, return empty object (will use system message injection)
        return {};
    }
  }

  protected buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.providerConfig.customHeaders,
    };

    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    return headers;
  }

  protected async makeRequest(
    payload: any,
    headers: Record<string, string>,
    stream: boolean,
  ): Promise<any> {
    const requestPath = this.providerConfig.requestPath || '/chat/completions';

    this.logger.debug(
      `🔧 Making request to: ${this.config.baseUrl}${requestPath}`,
    );
    this.logger.debug(
      `🔧 Request payload: ${JSON.stringify(payload, null, 2)}`,
    );

    return await firstValueFrom(
      this.httpService.post(`${this.config.baseUrl}${requestPath}`, payload, {
        headers,
        timeout: this.config.timeout,
        responseType: stream ? 'stream' : 'json',
      }),
    );
  }

  protected transformResponse(response: any): ApiResponse<LLMResponse> {
    const transform = this.providerConfig.responseTransform;

    if (transform) {
      // Use custom transformation paths
      const choices =
        this.getNestedValue(response.data, transform.choicesPath) || [];
      const usage =
        this.getNestedValue(response.data, transform.usagePath) || {};

      return {
        data: {
          choices: choices.map((choice: any) => ({
            message: {
              content: this.getNestedValue(choice, transform.contentPath) || '',
            },
          })),
          usage,
        },
        status: response.status,
        headers: response.headers as Record<string, string>,
      };
    }

    // Default transformation
    return {
      data: {
        choices: response.data.choices || [],
        usage: response.data.usage || {},
      },
      status: response.status,
      headers: response.headers as Record<string, string>,
    };
  }

  protected parseStreamLine(line: string): string | null {
    const streamConfig = this.providerConfig.streamTransform;

    switch (this.providerConfig.streamingFormat) {
      case 'sse':
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]' || data === streamConfig?.doneSignal) {
            return null;
          }
          try {
            const parsed = JSON.parse(data);
            return (
              this.getNestedValue(
                parsed,
                streamConfig?.contentPath || 'choices[0].delta.content',
              ) || null
            );
          } catch {
            return null;
          }
        }
        return null;

      case 'json':
        try {
          const parsed = JSON.parse(line);
          if (parsed.done) return null;
          return (
            this.getNestedValue(
              parsed,
              streamConfig?.contentPath || 'message.content',
            ) || null
          );
        } catch {
          return null;
        }

      default:
        return null;
    }
  }

  private addStructuredOutputFormat(
    payload: any,
    jsonSchema: Record<string, any>,
  ): void {
    const format = this.providerConfig.structuredOutputFormat || 'openai';

    switch (format) {
      case 'openai':
        // OpenAI format (already handled by supportsJsonSchema)
        payload.response_format = {
          type: 'json_schema',
          json_schema: {
            name: 'graph_extraction',
            strict: true,
            schema: jsonSchema,
          },
        };
        break;

      case 'ollama':
        // Ollama format - uses 'format' field with JSON schema
        payload.format = {
          type: 'object',
          properties: jsonSchema.properties || jsonSchema,
          required:
            jsonSchema.required ||
            Object.keys(jsonSchema.properties || jsonSchema),
        };
        break;

      case 'custom':
        // Custom format - can be overridden by specific providers
        this.addCustomStructuredOutputFormat(payload, jsonSchema);
        break;

      default:
        // Fallback to system message injection
        this.injectJsonSchema(payload.messages, jsonSchema);
        break;
    }
  }

  protected addCustomStructuredOutputFormat(
    payload: any,
    jsonSchema: Record<string, any>,
  ): void {
    // Default custom implementation - can be overridden by specific providers
    payload.format = {
      type: 'object',
      properties: jsonSchema.properties || jsonSchema,
      required:
        jsonSchema.required || Object.keys(jsonSchema.properties || jsonSchema),
    };
  }

  protected injectJsonSchema(
    messages: LLMMessage[],
    jsonSchema: Record<string, any>,
  ): void {
    const schemaInstruction = `\n\nIMPORTANT: You must respond with valid JSON that matches this schema: ${JSON.stringify(jsonSchema)}`;

    const systemMessage = messages.find((m) => m.role === 'system');
    if (systemMessage) {
      systemMessage.content += schemaInstruction;
    } else {
      messages.unshift({
        role: 'system',
        content: `You must respond with valid JSON that matches this schema: ${JSON.stringify(jsonSchema)}`,
      });
    }
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => {
      if (key.includes('[') && key.includes(']')) {
        const arrayKey = key.substring(0, key.indexOf('['));
        const index = parseInt(
          key.substring(key.indexOf('[') + 1, key.indexOf(']')),
        );
        return current?.[arrayKey]?.[index];
      }
      return current?.[key];
    }, obj);
  }
}
