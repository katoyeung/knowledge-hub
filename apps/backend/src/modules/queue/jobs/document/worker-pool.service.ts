import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker } from 'worker_threads';
import { join } from 'path';
import { EventEmitter } from 'events';

export interface EmbeddingTask {
  id: string;
  text: string;
  model: string;
  provider: string;
  customModelName?: string;
}

export interface EmbeddingResult {
  id: string;
  embedding: number[];
  dimensions: number;
  model: string;
  error?: string;
}

export interface WorkerPoolConfig {
  enabled: boolean;
  workerCount: number;
  maxQueueSize: number;
  timeout: number;
}

@Injectable()
export class WorkerPoolService extends EventEmitter {
  private readonly logger = new Logger(WorkerPoolService.name);
  private workers: Worker[] = [];
  private taskQueue: EmbeddingTask[] = [];
  private activeTasks = new Map<
    string,
    {
      resolve: (result: EmbeddingResult) => void;
      reject: (error: Error) => void;
      timeout: NodeJS.Timeout;
    }
  >();
  private config: WorkerPoolConfig;
  private isShuttingDown = false;

  constructor(private readonly configService: ConfigService) {
    super();
    this.config = {
      enabled:
        this.configService.get('EMBEDDING_WORKER_POOL_ENABLED', 'false') ===
        'true',
      workerCount:
        parseInt(this.configService.get('EMBEDDING_WORKER_COUNT', '0')) ||
        Math.max(1, require('os').cpus().length - 1),
      maxQueueSize: parseInt(
        this.configService.get('EMBEDDING_MAX_QUEUE_SIZE', '1000'),
      ),
      timeout: parseInt(
        this.configService.get('EMBEDDING_WORKER_TIMEOUT', '300000'),
      ), // 5 minutes
    };

    this.logger.log(`[WORKER_POOL] Initialized with config:`, this.config);

    if (this.config.enabled) {
      this.initializeWorkers();
    }
  }

  private initializeWorkers(): void {
    this.logger.log(
      `[WORKER_POOL] Initializing ${this.config.workerCount} workers`,
    );

    for (let i = 0; i < this.config.workerCount; i++) {
      this.createWorker(i);
    }

    // Start processing queue
    this.processQueue();
  }

  private createWorker(workerId: number): void {
    // For development, use ts-node to run TypeScript directly
    const workerPath =
      process.env.NODE_ENV === 'production'
        ? join(__dirname, '../../../dataset/workers/embedding.worker.js')
        : join(__dirname, '../../../dataset/workers/embedding.worker.ts');

    const worker = new Worker(workerPath, {
      workerData: { workerId },
    });

    worker.on('message', (result: EmbeddingResult) => {
      this.handleWorkerMessage(result);
    });

    worker.on('error', (error) => {
      this.logger.error(`[WORKER_POOL] Worker ${workerId} error:`, error);
      this.handleWorkerError(workerId, error);
    });

    worker.on('exit', (code) => {
      this.logger.warn(
        `[WORKER_POOL] Worker ${workerId} exited with code ${code}`,
      );
      if (!this.isShuttingDown) {
        // Restart worker if it exits unexpectedly
        setTimeout(() => this.createWorker(workerId), 1000);
      }
    });

    this.workers.push(worker);
    this.logger.log(`[WORKER_POOL] Worker ${workerId} created`);
  }

  private handleWorkerMessage(result: EmbeddingResult): void {
    const task = this.activeTasks.get(result.id);
    if (task) {
      clearTimeout(task.timeout);
      this.activeTasks.delete(result.id);

      if (result.error) {
        task.reject(new Error(result.error));
      } else {
        task.resolve(result);
      }
    } else {
      this.logger.warn(
        `[WORKER_POOL] Received result for unknown task: ${result.id}`,
      );
    }
  }

  private handleWorkerError(workerId: number, error: Error): void {
    // Find and reject all tasks assigned to this worker
    for (const [taskId, task] of this.activeTasks.entries()) {
      task.reject(new Error(`Worker ${workerId} failed: ${error.message}`));
      clearTimeout(task.timeout);
      this.activeTasks.delete(taskId);
    }

    // Remove the failed worker
    const workerIndex = this.workers.findIndex((w) => w.threadId === workerId);
    if (workerIndex !== -1) {
      this.workers.splice(workerIndex, 1);
    }

    // Create a new worker to replace the failed one
    if (!this.isShuttingDown) {
      setTimeout(() => this.createWorker(workerId), 1000);
    }
  }

  private processQueue(): void {
    if (this.isShuttingDown || this.workers.length === 0) {
      return;
    }

    // Find available worker (check if worker is still active)
    const availableWorker = this.workers.find((worker) => {
      try {
        // Try to get worker thread ID to check if it's still alive
        return worker.threadId !== undefined;
      } catch {
        return false;
      }
    });

    if (availableWorker && this.taskQueue.length > 0) {
      const task = this.taskQueue.shift()!;
      this.executeTask(availableWorker, task);
    }

    // Continue processing queue
    setTimeout(() => this.processQueue(), 100);
  }

  private executeTask(worker: Worker, task: EmbeddingTask): void {
    // Set up timeout
    const timeout = setTimeout(() => {
      this.activeTasks.delete(task.id);
      this.logger.error(
        `[WORKER_POOL] Task ${task.id} timed out after ${this.config.timeout}ms`,
      );
    }, this.config.timeout);

    // Store task info
    this.activeTasks.set(task.id, {
      resolve: () => {},
      reject: () => {},
      timeout,
    });

    // Send task to worker
    worker.postMessage(task);
  }

  async processEmbedding(task: EmbeddingTask): Promise<EmbeddingResult> {
    if (!this.config.enabled) {
      throw new Error('Worker pool is disabled');
    }

    if (this.isShuttingDown) {
      throw new Error('Worker pool is shutting down');
    }

    if (this.taskQueue.length >= this.config.maxQueueSize) {
      throw new Error(`Task queue is full (${this.config.maxQueueSize} tasks)`);
    }

    return new Promise((resolve, reject) => {
      // Add task to queue
      this.taskQueue.push(task);

      // Set up task handlers
      const timeout = setTimeout(() => {
        this.activeTasks.delete(task.id);
        reject(
          new Error(`Task ${task.id} timed out after ${this.config.timeout}ms`),
        );
      }, this.config.timeout);

      this.activeTasks.set(task.id, {
        resolve,
        reject,
        timeout,
      });

      this.logger.debug(
        `[WORKER_POOL] Queued task ${task.id} (queue size: ${this.taskQueue.length})`,
      );
    });
  }

  async processEmbeddingsBatch(
    tasks: EmbeddingTask[],
  ): Promise<EmbeddingResult[]> {
    if (!this.config.enabled) {
      throw new Error('Worker pool is disabled');
    }

    this.logger.log(`[WORKER_POOL] Processing batch of ${tasks.length} tasks`);

    const promises = tasks.map((task) => this.processEmbedding(task));
    return Promise.all(promises);
  }

  getStats(): {
    workerCount: number;
    activeTasks: number;
    queueSize: number;
    isEnabled: boolean;
  } {
    return {
      workerCount: this.workers.length,
      activeTasks: this.activeTasks.size,
      queueSize: this.taskQueue.length,
      isEnabled: this.config.enabled,
    };
  }

  async shutdown(): Promise<void> {
    this.logger.log('[WORKER_POOL] Shutting down worker pool');
    this.isShuttingDown = true;

    // Reject all pending tasks
    for (const [taskId, task] of this.activeTasks.entries()) {
      clearTimeout(task.timeout);
      task.reject(new Error('Worker pool is shutting down'));
    }
    this.activeTasks.clear();

    // Terminate all workers
    const terminationPromises = this.workers.map((worker) =>
      worker.terminate(),
    );
    await Promise.all(terminationPromises);

    this.workers = [];
    this.logger.log('[WORKER_POOL] Worker pool shutdown complete');
  }
}
