import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CPUThrottlingService {
  private readonly logger = new Logger(CPUThrottlingService.name);
  private readonly maxConcurrentJobs: number;
  private readonly httpRequestPriority: boolean;
  private activeJobs = 0;
  private httpRequestCount = 0;

  constructor(private readonly configService: ConfigService) {
    this.maxConcurrentJobs = parseInt(
      this.configService.get('MAX_CONCURRENT_JOBS', '2'),
    );
    this.httpRequestPriority =
      this.configService.get('HTTP_REQUEST_PRIORITY', 'true') === 'true';

    this.logger.log(
      `[CPU_THROTTLING] Initialized - Max concurrent jobs: ${this.maxConcurrentJobs}, HTTP priority: ${this.httpRequestPriority}`,
    );
  }

  /**
   * Check if a job can be processed without blocking HTTP requests
   */
  canProcessJob(): boolean {
    if (!this.httpRequestPriority) {
      return true;
    }

    // If there are active HTTP requests, limit job processing
    if (this.httpRequestCount > 0) {
      return (
        this.activeJobs < Math.max(1, Math.floor(this.maxConcurrentJobs / 2))
      );
    }

    return this.activeJobs < this.maxConcurrentJobs;
  }

  /**
   * Reserve CPU for HTTP request processing
   */
  reserveForHttpRequest(): void {
    this.httpRequestCount++;
    this.logger.debug(
      `[CPU_THROTTLING] HTTP request started - Active: ${this.httpRequestCount}`,
    );
  }

  /**
   * Release CPU reservation for HTTP request
   */
  releaseHttpRequest(): void {
    this.httpRequestCount = Math.max(0, this.httpRequestCount - 1);
    this.logger.debug(
      `[CPU_THROTTLING] HTTP request completed - Active: ${this.httpRequestCount}`,
    );
  }

  /**
   * Reserve CPU for job processing
   */
  reserveForJob(): boolean {
    if (!this.canProcessJob()) {
      return false;
    }

    this.activeJobs++;
    this.logger.debug(
      `[CPU_THROTTLING] Job started - Active jobs: ${this.activeJobs}, HTTP requests: ${this.httpRequestCount}`,
    );
    return true;
  }

  /**
   * Release CPU reservation for job processing
   */
  releaseJob(): void {
    this.activeJobs = Math.max(0, this.activeJobs - 1);
    this.logger.debug(
      `[CPU_THROTTLING] Job completed - Active jobs: ${this.activeJobs}, HTTP requests: ${this.httpRequestCount}`,
    );
  }

  /**
   * Get current CPU usage stats
   */
  getStats() {
    return {
      activeJobs: this.activeJobs,
      httpRequestCount: this.httpRequestCount,
      maxConcurrentJobs: this.maxConcurrentJobs,
      httpRequestPriority: this.httpRequestPriority,
      canProcessJob: this.canProcessJob(),
    };
  }
}
