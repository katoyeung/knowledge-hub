import { Injectable, Logger } from '@nestjs/common';
import { EventBusService } from '../services/event-bus.service';
import { EventTypes } from '../constants/event-types';
import { SystemEvent } from '../interfaces/event.interface';

@Injectable()
export class SystemEventHandler {
  private readonly logger = new Logger(SystemEventHandler.name);

  constructor(private readonly eventBus: EventBusService) {
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.eventBus.subscribe(
      EventTypes.SYSTEM_ERROR,
      this.handleSystemError.bind(this),
    );
    this.eventBus.subscribe(
      EventTypes.SYSTEM_WARNING,
      this.handleSystemWarning.bind(this),
    );
    this.eventBus.subscribe(
      EventTypes.SYSTEM_INFO,
      this.handleSystemInfo.bind(this),
    );
  }

  private handleSystemError(event: SystemEvent): void {
    this.logger.error(`System error: ${event.payload.message}`, {
      eventType: event.type,
      timestamp: event.timestamp,
      context: event.payload.context,
      error: event.payload.error,
    });
  }

  private handleSystemWarning(event: SystemEvent): void {
    this.logger.warn(`System warning: ${event.payload.message}`, {
      eventType: event.type,
      timestamp: event.timestamp,
      context: event.payload.context,
    });
  }

  private handleSystemInfo(event: SystemEvent): void {
    this.logger.log(`System info: ${event.payload.message}`, {
      eventType: event.type,
      timestamp: event.timestamp,
      context: event.payload.context,
    });
  }
}
