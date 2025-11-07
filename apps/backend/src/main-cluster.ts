// Set Node.js memory limit at runtime using v8 flags
// This works even when nest CLI spawns new processes
try {
  const v8 = require('v8');
  v8.setFlagsFromString('--max-old-space-size=8192');
} catch (e) {
  // v8 module might not be available in all Node versions, fallback to env
  if (!process.env.NODE_OPTIONS?.includes('--max-old-space-size')) {
    process.env.NODE_OPTIONS =
      (process.env.NODE_OPTIONS || '') + ' --max-old-space-size=8192';
  }
}

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { DatabaseExceptionFilter } from './common/filters/database-exception.filter';
import { CustomValidationPipe } from './common/pipes/validation.pipe';
import { CPUThrottlingInterceptor } from './common/interceptors/cpu-throttling.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);

  // Get CORS origins from environment variable and split by comma
  const corsOrigins = configService.get<string>('CORS_ORIGINS')?.split(',') || [
    'http://localhost:3001',
  ];

  app.enableCors({
    origin: corsOrigins, // Now it's an array of allowed origins
    methods:
      configService.get<string>('CORS_METHODS') ||
      'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true, // Always true when using credentials
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Register the database exception filter globally
  app.useGlobalFilters(new DatabaseExceptionFilter());

  // Use the custom validation pipe globally
  app.useGlobalPipes(new CustomValidationPipe());

  // Add CPU throttling interceptor globally
  const cpuThrottlingInterceptor = app.get(CPUThrottlingInterceptor);
  app.useGlobalInterceptors(cpuThrottlingInterceptor);

  // Set global prefix for all routes
  app.setGlobalPrefix('api');

  if (process.env.NODE_ENV === 'production') {
    app.useLogger(['warn', 'error']);
  }

  await app.listen(configService.get<number>('PORT') || 3001);
}

// For now, just run the bootstrap function directly
// TODO: Implement proper cluster mode when needed
bootstrap().catch((err) => {
  console.error('Error during bootstrap:', err);
  process.exit(1);
});
