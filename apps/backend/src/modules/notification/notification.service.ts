import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';

export enum NotificationType {
  SCREENER_UPDATE = 'SCREENER_UPDATE',
  INSTRUMENT_UPDATE = 'INSTRUMENT_UPDATE',
  INDICATOR_UPDATE = 'INDICATOR_UPDATE',
}

export interface NotificationMessage {
  type: NotificationType;
  data: any;
  timestamp: number;
}

@Injectable()
export class NotificationService {
  private notificationSubject = new Subject<NotificationMessage>();

  constructor() {}

  getNotificationStream() {
    return this.notificationSubject.asObservable();
  }

  sendNotification(type: NotificationType, data: any) {
    const message: NotificationMessage = {
      type,
      data,
      timestamp: Date.now(),
    };
    this.notificationSubject.next(message);
  }

  sendScreenerUpdate(screenerId: string, data: any) {
    this.sendNotification(NotificationType.SCREENER_UPDATE, {
      screenerId,
      ...data,
    });
  }

  sendInstrumentUpdate(instrumentId: string, data: any) {
    this.sendNotification(NotificationType.INSTRUMENT_UPDATE, {
      instrumentId,
      ...data,
    });
  }

  sendIndicatorUpdate(indicatorId: string, data: any) {
    this.sendNotification(NotificationType.INDICATOR_UPDATE, {
      indicatorId,
      ...data,
    });
  }
}
