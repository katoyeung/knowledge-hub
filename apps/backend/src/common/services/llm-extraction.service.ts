import { Injectable, Logger } from '@nestjs/common';
import { LLMClient } from '../interfaces/llm-client.interface';
import { LLMMessage } from '../interfaces/llm-client.interface';
import {
  LLMExtractionConfig,
  LLMExtractionResult,
  JSONParseOptions,
} from '../interfaces/llm-extraction.interface';
import { Prompt } from '@modules/prompts/entities/prompt.entity';

@Injectable()
export class LLMExtractionService {
  private readonly logger = new Logger(LLMExtractionService.name);

  /**
   * Call LLM for extraction/processing with structured JSON response
   */
  async extractWithLLM<T = any>(
    config: LLMExtractionConfig,
    llmClient: LLMClient,
    parseOptions?: JSONParseOptions,
  ): Promise<LLMExtractionResult<T>> {
    try {
      // Build user prompt with template variables
      const userPrompt = this.buildUserPrompt(
        config.content,
        config.prompt,
        config.templateVariables,
      );

      // Build messages
      const messages: LLMMessage[] = [
        { role: 'system', content: config.prompt.systemPrompt },
        { role: 'user', content: userPrompt },
      ];

      this.logger.log('Calling LLM for extraction...');

      // Call LLM
      const response = await llmClient.chatCompletion(
        messages,
        config.model,
        config.prompt.jsonSchema,
        config.temperature || 0.7,
      );

      if (!response.data?.choices?.[0]?.message?.content) {
        return {
          success: false,
          error: 'No valid response from LLM',
        };
      }

      const content = response.data.choices[0].message.content;

      // Parse JSON from response
      const parsed = this.parseJSONFromResponse<T>(content, parseOptions);

      if (!parsed) {
        return {
          success: false,
          error: 'Failed to parse JSON from LLM response',
          rawContent: content,
        };
      }

      return {
        success: true,
        data: parsed,
        rawContent: content,
      };
    } catch (error) {
      this.logger.error(`LLM extraction failed: ${error.message}`);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Build user prompt from template and content
   */
  private buildUserPrompt(
    content: string,
    prompt: Prompt,
    templateVariables?: Record<string, string>,
  ): string {
    if (!prompt.userPromptTemplate) {
      return content;
    }

    let userPrompt = prompt.userPromptTemplate;

    // Replace standard template variables
    userPrompt = userPrompt
      .replace(/\{\{content\}\}/g, content)
      .replace(/\{\{text\}\}/g, content)
      .replace(/\{\{post\}\}/g, content);

    // Replace custom template variables
    if (templateVariables) {
      for (const [key, value] of Object.entries(templateVariables)) {
        userPrompt = userPrompt.replace(
          new RegExp(`\\{\\{${key}\\}\\}`, 'g'),
          value,
        );
      }
    }

    return userPrompt;
  }

  /**
   * Parse JSON from LLM response content
   * Handles markdown code blocks, direct JSON, and text fallback
   */
  parseJSONFromResponse<T = any>(
    content: string,
    options?: JSONParseOptions,
  ): T | null {
    const opts: JSONParseOptions = {
      allowTextFallback: false,
      allowArrays: true,
      ...options,
    };

    // Try to find JSON in the response
    let jsonString = '';

    // First, try to find JSON in markdown code blocks
    const codeBlockMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (codeBlockMatch) {
      jsonString = codeBlockMatch[1];
    } else {
      // Try to find JSON object directly
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonString = jsonMatch[0];
      } else if (opts.allowArrays) {
        // If no JSON object found, try to find JSON array
        const arrayMatch = content.match(/\[[\s\S]*\]/);
        if (arrayMatch) {
          jsonString = arrayMatch[0];
        }
      }
    }

    // If JSON found, parse it
    if (jsonString) {
      try {
        const parsed = JSON.parse(jsonString);
        if (parsed && typeof parsed === 'object') {
          return parsed as T;
        }
      } catch (parseError) {
        this.logger.error(
          `JSON parsing error: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
        );
        this.logger.error(
          `Failed to parse JSON: ${jsonString.substring(0, 200)}`,
        );
      }
    }

    // Fallback to text parser if enabled
    if (opts.allowTextFallback && opts.textParser) {
      try {
        return opts.textParser(content) as T;
      } catch (error) {
        this.logger.warn(
          `Text parser failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    this.logger.warn('No JSON found in LLM response');
    return null;
  }

  /**
   * Extract JSON string from response (without parsing)
   */
  extractJSONString(content: string): string | null {
    // Try to find JSON in markdown code blocks
    const codeBlockMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (codeBlockMatch) {
      return codeBlockMatch[1];
    }

    // Try to find JSON object directly
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return jsonMatch[0];
    }

    // Try to find JSON array
    const arrayMatch = content.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      return arrayMatch[0];
    }

    return null;
  }
}
