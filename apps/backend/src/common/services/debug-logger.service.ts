import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class DebugLogger {
  private readonly logger = new Logger(DebugLogger.name);
  private readonly isDebugEnabled: boolean;
  private readonly isFileLoggingEnabled: boolean;

  constructor(private readonly configService: ConfigService) {
    this.isDebugEnabled =
      this.configService.get<string>('DEBUG_CHAT_SERVICE') === 'true' ||
      this.configService.get<string>('NODE_ENV') === 'development';

    this.isFileLoggingEnabled =
      this.isDebugEnabled &&
      this.configService.get<string>('DEBUG_FILE_LOGGING') === 'true';
  }

  /**
   * Log debug information with structured data
   */
  logDebug(method: string, data: Record<string, any>, message?: string): void {
    if (!this.isDebugEnabled) return;

    const logData = {
      timestamp: new Date().toISOString(),
      method,
      ...data,
    };

    if (message) {
      this.logger.debug(`${message} - ${JSON.stringify(logData)}`);
    } else {
      this.logger.debug(`DEBUG [${method}]: ${JSON.stringify(logData)}`);
    }

    // Optional file logging for development
    if (this.isFileLoggingEnabled) {
      this.writeToFile(method, logData);
    }
  }

  /**
   * Log debug information with a custom message
   */
  logDebugMessage(message: string, data?: Record<string, any>): void {
    if (!this.isDebugEnabled) return;

    if (data) {
      this.logger.debug(`${message} - ${JSON.stringify(data)}`);
    } else {
      this.logger.debug(message);
    }
  }

  /**
   * Log segment retrieval debug information
   */
  logSegmentRetrieval(step: string, data: Record<string, any>): void {
    this.logDebug(
      'retrieveRelevantSegments',
      data,
      `Segment retrieval - ${step}`,
    );
  }

  /**
   * Log chat process debug information
   */
  logChatProcess(step: string, data: Record<string, any>): void {
    this.logDebug('chatWithDocuments', data, `Chat process - ${step}`);
  }

  /**
   * Log response generation debug information
   */
  logResponseGeneration(step: string, data: Record<string, any>): void {
    this.logDebug('generateResponse', data, `Response generation - ${step}`);
  }

  /**
   * Write debug data to file (development only)
   */
  private writeToFile(method: string, data: Record<string, any>): void {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const fs = require('fs');
      const filename = `/tmp/debug-${method}.log`;
      const logEntry = JSON.stringify(data, null, 2) + '\n';

      fs.writeFileSync(filename, logEntry, { flag: 'a' });
    } catch (error) {
      // Silently fail file logging to avoid breaking the main flow
      this.logger.warn(`Failed to write debug file: ${error.message}`);
    }
  }

  /**
   * Check if debug logging is enabled
   */
  isEnabled(): boolean {
    return this.isDebugEnabled;
  }
}
