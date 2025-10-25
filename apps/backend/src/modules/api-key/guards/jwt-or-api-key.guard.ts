import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { ApiKeyAuthGuard } from './api-key-auth.guard';

@Injectable()
export class JwtOrApiKeyAuthGuard extends AuthGuard(['jwt', 'api-key']) {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    // If no authorization header, deny access
    if (!authHeader) {
      return false;
    }

    // Check if it's an API key (starts with 'sk-')
    if (authHeader.startsWith('Bearer sk-')) {
      const apiKeyGuard = new ApiKeyAuthGuard();
      return apiKeyGuard.canActivate(context) as Promise<boolean>;
    }

    // Otherwise, try JWT authentication
    const jwtGuard = new JwtAuthGuard();
    return jwtGuard.canActivate(context) as Promise<boolean>;
  }
}
