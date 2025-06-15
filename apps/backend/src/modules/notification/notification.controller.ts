import { Controller, Get, Res, Headers } from '@nestjs/common';
import { Response } from 'express';
import { NotificationGateway } from './notification.gateway';
import { v4 as uuidv4 } from 'uuid';

@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationGateway: NotificationGateway) {}

  @Get('stream')
  streamNotifications(
    @Res() res: Response,
    @Headers('x-client-id') clientId?: string,
  ) {
    const id = clientId || uuidv4();
    this.notificationGateway.addClient(id, res);
  }
}
