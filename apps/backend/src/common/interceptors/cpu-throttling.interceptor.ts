import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, finalize } from 'rxjs/operators';
import { CPUThrottlingService } from '../services/cpu-throttling.service';

@Injectable()
export class CPUThrottlingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(CPUThrottlingInterceptor.name);

  constructor(private readonly cpuThrottling: CPUThrottlingService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url } = request;

    // Reserve CPU for HTTP request
    this.cpuThrottling.reserveForHttpRequest();

    this.logger.debug(
      `[CPU_THROTTLING] Processing HTTP request: ${method} ${url}`,
    );

    return next.handle().pipe(
      tap(() => {
        this.logger.debug(
          `[CPU_THROTTLING] HTTP request completed: ${method} ${url}`,
        );
      }),
      finalize(() => {
        // Always release CPU reservation
        this.cpuThrottling.releaseHttpRequest();
      }),
    );
  }
}
