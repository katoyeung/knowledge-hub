import { Injectable, Logger } from '@nestjs/common';
import { EventBusService } from '../services/event-bus.service';
import { EventTypes } from '../constants/event-types';
import { QueueEvent } from '../interfaces/event.interface';

@Injectable()
export class QueueEventHandler {
  private readonly logger = new Logger(QueueEventHandler.name);

  constructor(private readonly eventBus: EventBusService) {
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.eventBus.subscribe(
      EventTypes.QUEUE_JOB_ADDED,
      this.handleJobAdded.bind(this),
    );
    this.eventBus.subscribe(
      EventTypes.QUEUE_JOB_STARTED,
      this.handleJobStarted.bind(this),
    );
    this.eventBus.subscribe(
      EventTypes.QUEUE_JOB_COMPLETED,
      this.handleJobCompleted.bind(this),
    );
    this.eventBus.subscribe(
      EventTypes.QUEUE_JOB_FAILED,
      this.handleJobFailed.bind(this),
    );
    this.eventBus.subscribe(
      EventTypes.QUEUE_JOB_RETRY,
      this.handleJobRetry.bind(this),
    );
  }

  private handleJobAdded(event: QueueEvent): void {
    this.logger.debug(`Job added to queue: ${event.payload.jobType}`, {
      eventType: event.type,
      timestamp: event.timestamp,
      jobId: event.payload.jobId,
    });
  }

  private handleJobStarted(event: QueueEvent): void {
    this.logger.debug(`Job started: ${event.payload.jobType}`, {
      eventType: event.type,
      timestamp: event.timestamp,
      jobId: event.payload.jobId,
    });
  }

  private handleJobCompleted(event: QueueEvent): void {
    this.logger.debug(`Job completed: ${JSON.stringify(event)}`);
  }

  private handleJobFailed(event: QueueEvent): void {
    this.logger.error(`Job failed: ${event.payload.jobType}`, {
      eventType: event.type,
      timestamp: event.timestamp,
      jobId: event.payload.jobId,
      error: event.payload.error,
    });
  }

  private handleJobRetry(event: QueueEvent): void {
    this.logger.warn(`Job retry: ${event.payload.jobType}`, {
      eventType: event.type,
      timestamp: event.timestamp,
      jobId: event.payload.jobId,
      error: event.payload.error,
    });
  }
}
