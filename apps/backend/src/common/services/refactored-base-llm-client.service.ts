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
export abstract class RefactoredBaseLLMClient
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
        timeout: 30000,
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

  protected get defaultModel(): string {
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
    model: string = this.defaultModel,
    jsonSchema?: Record<string, any>,
    temperature?: number,
  ): Promise<ApiResponse<LLMResponse>> {
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
    model: string = this.defaultModel,
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
          json_schema: jsonSchema,
        };
      } else {
        // Inject into system message for providers that don't support it natively
        this.injectJsonSchema(messages, jsonSchema);
      }
    }

    return payload;
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

  private injectJsonSchema(
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
