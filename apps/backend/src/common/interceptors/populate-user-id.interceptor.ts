import { RequestWithUser } from '@common/interfaces/request-with-user.interface';
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';

@Injectable()
export class PopulateUserIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;
    const body: unknown = request.body;

    if (user && typeof body === 'object' && body !== null) {
      (body as { userId?: number }).userId = user.id;
    }

    return next.handle();
  }
}
