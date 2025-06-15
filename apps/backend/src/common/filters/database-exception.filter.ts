import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { QueryFailedError } from 'typeorm';

@Catch(QueryFailedError)
export class DatabaseExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DatabaseExceptionFilter.name);

  catch(exception: QueryFailedError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    // Log the full error for debugging
    this.logger.error('Database Error:', {
      message: exception.message,
      code: (exception as any).code,
      detail: (exception as any).detail,
      constraint: (exception as any).constraint,
    });

    // Handle unique constraint violations
    if ((exception as any).code === '23505') {
      // PostgreSQL unique violation code
      const detail = (exception as any).detail;
      if (detail) {
        const match = detail.match(
          /Key \(([^)]+)\)=\(([^)]+)\) already exists/,
        );
        if (match) {
          const [, field, value] = match;
          return response.status(HttpStatus.CONFLICT).json({
            statusCode: HttpStatus.CONFLICT,
            message: `${field} with value '${value}' already exists`,
            error: 'Conflict',
          });
        }
      }
    }

    return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Database operation failed',
      error: 'Internal Server Error',
      details:
        process.env.NODE_ENV === 'development' ? exception.message : undefined,
    });
  }
}
