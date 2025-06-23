import { Controller, Get, Post } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Post('test-document-parser')
  testDocumentParser() {
    return {
      success: true,
      message: 'Document parser module is loaded and accessible',
      timestamp: new Date().toISOString(),
      note: 'This is a public test endpoint - use /document-parser/admin/test for authenticated testing',
    };
  }

  @Get('health')
  getHealth(): { status: string } {
    return { status: 'ok' };
  }
}
