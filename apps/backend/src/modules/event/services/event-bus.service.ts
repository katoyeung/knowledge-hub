import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EventTypes } from '../constants/event-types';
import { Event } from '../interfaces/event.interface';

type EventHandler = (event: Event) => void;

@Injectable()
export class EventBusService {
  private readonly logger = new Logger(EventBusService.name);
  private readonly subscribers: Map<string, Set<EventHandler>> = new Map();

  constructor(private readonly eventEmitter: EventEmitter2) {}

  publish(event: Event): void {
    try {
      this.eventEmitter.emit(event.type, event);
    } catch (error) {
      this.logger.error(`Failed to publish event: ${event.type}`, {
        error: error.message,
        stack: error.stack,
        event,
      });
      throw error;
    }
  }

  subscribe(eventType: EventTypes, handler: EventHandler): void {
    try {
      if (!this.subscribers.has(eventType)) {
        this.subscribers.set(eventType, new Set());
      }

      const handlers = this.subscribers.get(eventType)!;
      handlers.add(handler);

      this.eventEmitter.on(eventType, handler);
    } catch (error) {
      this.logger.error(`Failed to subscribe to event: ${eventType}`, {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  unsubscribe(eventType: EventTypes, handler: EventHandler): void {
    try {
      const handlers = this.subscribers.get(eventType);
      if (handlers) {
        handlers.delete(handler);
        this.eventEmitter.off(eventType, handler);
      }
    } catch (error) {
      this.logger.error(`Failed to unsubscribe from event: ${eventType}`, {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  unsubscribeAll(eventType: EventTypes): void {
    try {
      const handlers = this.subscribers.get(eventType);
      if (handlers) {
        handlers.forEach((handler) => {
          this.eventEmitter.off(eventType, handler);
        });
        handlers.clear();
      }
    } catch (error) {
      this.logger.error(
        `Failed to unsubscribe all handlers from event: ${eventType}`,
        {
          error: error.message,
          stack: error.stack,
        },
      );
      throw error;
    }
  }
}
