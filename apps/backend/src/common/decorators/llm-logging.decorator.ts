/**
 * Decorator for logging LLM API requests, responses, and errors
 */
export function LogLLMRequest() {
  return function (
    target: any,
    propertyName: string,
    descriptor: PropertyDescriptor,
  ) {
    const method = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const startTime = Date.now();
      const providerName = target.constructor.name
        .replace('ApiClient', '')
        .toLowerCase();
      const requestId = `${providerName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Extract parameters from the method call
      const [
        messages,
        model = target.defaultModel,
        jsonSchema,
        temperature,
        maxTokens,
      ] = args;

      // Get configuration from the instance (this) - not target
      const config = this.config || this.getEffectiveConfig?.() || {};
      const url = `${config.baseUrl}/chat/completions`;

      // Prepare payload for logging
      const payload = {
        model,
        messages,
        ...(jsonSchema && {
          response_format: {
            type: 'json_schema',
            json_schema: jsonSchema,
          },
        }),
        ...(temperature !== undefined && { temperature }),
        ...(maxTokens !== undefined && { max_tokens: maxTokens }),
      };

      const headers = {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      };

      // Log request input
      const inputData = {
        requestId,
        provider: providerName,
        model,
        url,
        headers: {
          ...headers,
          Authorization: headers.Authorization
            ? headers.Authorization.replace(/Bearer (.{4})$/, 'Bearer ***$1')
            : 'NOT SET',
        },
        payload: {
          ...payload,
          messages: messages.map((msg: any) => ({
            role: msg.role,
            content:
              msg.content.length > 100
                ? `${msg.content.substring(0, 100)}...`
                : msg.content,
            contentLength: msg.content.length,
          })),
        },
        timestamp: new Date().toISOString(),
      };

      try {
        // Execute the original method
        const result = await method.apply(this, args);
        const duration = Date.now() - startTime;

        // Log successful response
        const outputData = {
          requestId,
          provider: providerName,
          model,
          status: result.status,
          duration: `${duration}ms`,
          response: {
            choices:
              result.data.choices?.map((choice: any) => ({
                message: {
                  content:
                    choice.message.content.length > 200
                      ? `${choice.message.content.substring(0, 200)}...`
                      : choice.message.content,
                  contentLength: choice.message.content.length,
                },
              })) || [],
            usage: result.data.usage,
          },
          timestamp: new Date().toISOString(),
        };

        // Use the logger service from the instance
        if (this.loggerService) {
          await this.loggerService.logProviderRequest(
            null, // userId - pass null for system-level logs
            providerName,
            model,
            'chat_completion',
            inputData,
            outputData,
            duration,
          );
        } else {
          // Fallback to console logging if logger service not available
          console.log(
            `🚀 [${requestId}] ${providerName} LLM Request Started`,
            inputData,
          );
          console.log(
            `✅ [${requestId}] ${providerName} LLM Request Completed`,
            outputData,
          );
        }

        return result;
      } catch (error) {
        const duration = Date.now() - startTime;

        // Determine error type
        let errorType: 'api_error' | 'invalid_response' | 'exception' =
          'exception';
        if (error.response?.data?.error) {
          errorType = 'api_error';
        } else if (error.message?.includes('Invalid response structure')) {
          errorType = 'invalid_response';
        }

        // Log error
        const errorData = {
          requestId,
          provider: providerName,
          model,
          errorType,
          error: {
            message: error.message,
            stack: error.stack,
            response: error.response?.data,
            status: error.response?.status,
            code: error.code,
          },
          duration: `${duration}ms`,
          timestamp: new Date().toISOString(),
        };

        // Use the logger service from the instance
        if (this.loggerService) {
          await this.loggerService.logProviderRequest(
            null, // userId - pass null for system-level logs
            providerName,
            model,
            'chat_completion',
            inputData,
            errorData,
            duration,
            `${errorType}: ${error.message}`,
          );
        } else {
          // Fallback to console logging if logger service not available
          console.error(
            `❌ [${requestId}] ${providerName} LLM Request ${errorType.replace('_', ' ')}`,
            errorData,
          );
        }

        throw error;
      }
    };

    return descriptor;
  };
}
