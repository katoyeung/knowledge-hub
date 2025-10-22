import { Injectable } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { Response } from 'express';

@Injectable()
export class NotificationGateway {
  private clients: Map<string, Response> = new Map();

  constructor(private readonly notificationService: NotificationService) {
    // Subscribe to notification stream
    this.notificationService.getNotificationStream().subscribe((message) => {
      this.broadcastMessage(message);
    });
  }

  addClient(clientId: string, res: Response) {
    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Send initial connection message
    res.write(
      `data: ${JSON.stringify({
        type: 'CONNECTED',
        data: { clientId },
        timestamp: Date.now(),
      })}\n\n`,
    );

    // Store client connection
    this.clients.set(clientId, res);

    // Handle client disconnect
    res.on('close', () => {
      this.removeClient(clientId);
    });
  }

  removeClient(clientId: string) {
    this.clients.delete(clientId);
  }

  private broadcastMessage(message: any) {
    const messageString = `data: ${JSON.stringify(message)}\n\n`;
    this.clients.forEach((client) => {
      client.write(messageString);
    });
  }
}
