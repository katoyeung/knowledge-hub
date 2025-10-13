import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { Cache } from 'cache-manager';
import { BaseLLMClient } from './base-llm-client.service';
import { LLMMessage, LLMResponse } from '../interfaces/llm-client.interface';
import { ApiResponse } from '../interfaces/api-client.interface';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class PerplexityApiClient extends BaseLLMClient {
  protected readonly defaultModel = 'sonar';

  constructor(
    configService: ConfigService,
    httpService: HttpService,
    cacheManager: Cache,
  ) {
    super(configService, httpService, cacheManager, {
      baseUrl: 'https://api.perplexity.ai',
      apiKeyEnv: 'PERPLEXITY_API_KEY',
      cacheTTL: configService.get<number>('PERPLEXITY_CACHE_TTL', 0) * 1000, // Set to 0 for never expire
    });
  }

  /**
   * Process Perplexity response to extract citations and format them as links
   */
  private processPerplexityResponse(responseData: any): any {
    if (!responseData.choices || responseData.choices.length === 0) {
      return responseData;
    }

    // Extract real citations from Perplexity response
    const realCitations = responseData.citations || [];
    const searchResults = responseData.search_results || [];

    const processedChoices = responseData.choices.map((choice: any) => {
      if (!choice.message?.content) {
        return choice;
      }

      const content = choice.message.content;
      const { processedContent, citations } = this.extractCitationsWithRealUrls(
        content,
        realCitations,
        searchResults,
      );

      // Add citations as links at the bottom if they exist
      const finalContent =
        citations.length > 0
          ? `${processedContent}\n\n**Sources:**\n${citations
              .map((citation, index) => `${index + 1}. ${citation}`)
              .join('\n')}`
          : processedContent;

      return {
        ...choice,
        message: {
          ...choice.message,
          content: finalContent,
        },
      };
    });

    return {
      ...responseData,
      choices: processedChoices,
    };
  }

  /**
   * Extract citations from Perplexity response content using real URLs
   */
  private extractCitationsWithRealUrls(
    content: string,
    realCitations: string[],
    searchResults: any[],
  ): {
    processedContent: string;
    citations: string[];
  } {
    // Debug logging removed for production

    // Match citation patterns like [1], [2], [1][2], etc.
    const citationRegex = /\[(\d+)\]/g;
    const citationMap = new Map<number, string>();

    // Find all citation references
    let match;
    while ((match = citationRegex.exec(content)) !== null) {
      const citationNumber = parseInt(match[1], 10);
      if (!citationMap.has(citationNumber)) {
        // Use real citation URL if available, otherwise fallback to placeholder
        const realUrl =
          realCitations[citationNumber - 1] ||
          `https://perplexity.ai/source/${citationNumber}`;
        citationMap.set(citationNumber, realUrl);
      }
    }

    // Reset regex for replacement
    citationRegex.lastIndex = 0;

    // Replace citation references with clickable markdown links
    // Add spaces between consecutive citations to ensure proper rendering
    const processedContent = content.replace(
      citationRegex,
      (match, citationNumber) => {
        const url = citationMap.get(parseInt(citationNumber, 10));
        return ` [${citationNumber}](${url})`;
      },
    );

    // Create citations list with clickable markdown links
    const sortedCitations = Array.from(citationMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([number, url]) => {
        // Try to find the corresponding search result for better formatting
        const searchResult = searchResults[number - 1];
        if (searchResult && searchResult.title) {
          return `[${number}] [${searchResult.title}](${url})`;
        }
        return `[${number}] [${url}](${url})`;
      });

    return {
      processedContent,
      citations: sortedCitations,
    };
  }

  /**
   * Extract citations from Perplexity response content (legacy method for streaming)
   */
  private extractCitations(content: string): {
    processedContent: string;
    citations: string[];
  } {
    // Match citation patterns like [1], [2], [1][2], etc.
    const citationRegex = /\[(\d+)\]/g;
    const citationMap = new Map<number, string>();

    // Find all citation references
    let match;
    while ((match = citationRegex.exec(content)) !== null) {
      const citationNumber = parseInt(match[1], 10);
      if (!citationMap.has(citationNumber)) {
        // For now, we'll use placeholder URLs since Perplexity doesn't provide source URLs in the response
        // In a real implementation, you might want to store these mappings or fetch them separately
        citationMap.set(
          citationNumber,
          `https://perplexity.ai/source/${citationNumber}`,
        );
      }
    }

    // Reset regex for replacement
    citationRegex.lastIndex = 0;

    // Replace citation references with clickable markdown links
    const processedContent = content.replace(
      citationRegex,
      (match, citationNumber) => {
        const url = citationMap.get(parseInt(citationNumber, 10));
        return `[${citationNumber}](${url})`;
      },
    );

    // Create citations list - only include unique citations
    const sortedCitations = Array.from(citationMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([number, url]) => `[${number}] ${url}`);

    return {
      processedContent,
      citations: sortedCitations,
    };
  }

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

    // Build payload - Perplexity doesn't support response_format with json_schema
    const payload: any = {
      model,
      messages,
      temperature: temperature || 0.7,
      max_tokens: 4096,
      stream: false,
    };

    // Add JSON schema instruction to system message if provided
    if (jsonSchema) {
      const systemMessage = messages.find((m) => m.role === 'system');
      if (systemMessage) {
        systemMessage.content += `\n\nIMPORTANT: You must respond with valid JSON that matches this schema: ${JSON.stringify(jsonSchema)}`;
      } else {
        messages.unshift({
          role: 'system',
          content: `You must respond with valid JSON that matches this schema: ${JSON.stringify(jsonSchema)}`,
        });
      }
    }

    const headers = {
      Authorization: `Bearer ${this.config.apiKey}`,
      'Content-Type': 'application/json',
    };

    try {
      this.logger.debug(
        'Perplexity API request payload:',
        JSON.stringify(payload, null, 2),
      );

      const response = await firstValueFrom(
        this.httpService.post<any>(
          `${this.config.baseUrl}/chat/completions`,
          payload,
          {
            headers,
            timeout: this.config.timeout,
          },
        ),
      );

      // Extract citations and add them to the response
      const processedResponse = this.processPerplexityResponse(response.data);

      // Transform Perplexity response to match LLMResponse interface
      const llmResponse: LLMResponse = {
        choices: processedResponse.choices || [],
        usage: response.data.usage,
      };

      const apiResponse: ApiResponse<LLMResponse> = {
        data: llmResponse,
        status: response.status,
        headers: response.headers as Record<string, string>,
      };

      // Cache the response
      await this.setCachedResponse(cacheKey, apiResponse);

      return apiResponse;
    } catch (error) {
      this.logger.error(
        `Perplexity API request failed: ${error.message}`,
        error.stack,
      );

      // Log the actual error response from Perplexity API
      if (error.response?.data) {
        this.logger.error(
          'Perplexity API error response:',
          JSON.stringify(error.response.data, null, 2),
        );
      }

      throw error;
    }
  }

  async *chatCompletionStream(
    messages: LLMMessage[],
    model: string = this.defaultModel,
    jsonSchema?: Record<string, any>,
    temperature?: number,
  ): AsyncGenerator<string, void, unknown> {
    // For Perplexity, we'll collect the full response first, then process citations
    // This ensures citations are properly formatted even if split across tokens
    const fullResponse = await this.chatCompletion(
      messages,
      model,
      jsonSchema,
      temperature,
    );

    // The content is already processed with citations by chatCompletion
    const content = fullResponse.data.choices[0]?.message?.content || '';

    // Just yield the already processed content
    yield content;
  }
}
