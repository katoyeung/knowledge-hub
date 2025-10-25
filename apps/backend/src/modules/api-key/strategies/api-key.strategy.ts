import { Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-custom';
import { Request } from 'express';
import { ApiKeyService } from '../api-key.service';
import { User } from '@modules/user/user.entity';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ApiKeyStrategy extends PassportStrategy(Strategy, 'api-key') {
  private readonly cacheTTL: number;

  constructor(
    private readonly apiKeyService: ApiKeyService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private readonly configService: ConfigService,
  ) {
    super();
    // Convert TTL from seconds to milliseconds
    this.cacheTTL = this.configService.get<number>('CACHE_TTL', 3600) * 1000;
  }

  async validate(req: Request): Promise<User> {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Invalid authorization header');
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Check if it's an API key (starts with 'sk-')
    if (!token.startsWith('sk-')) {
      throw new UnauthorizedException('Invalid API key format');
    }

    // Check cache first
    const cacheKey = `apikey:${token}`;
    const cachedUser = await this.cacheManager.get<User>(cacheKey);

    if (cachedUser) {
      return cachedUser;
    }

    // Validate the API key
    const apiKey = await this.apiKeyService.validateApiKey(token);

    if (!apiKey || !apiKey.user) {
      throw new UnauthorizedException('Invalid API key');
    }

    // Cache the user for performance
    await this.cacheManager.set(cacheKey, apiKey.user, this.cacheTTL);

    return apiKey.user;
  }
}
