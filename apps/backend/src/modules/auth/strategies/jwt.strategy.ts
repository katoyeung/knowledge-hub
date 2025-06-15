import { Injectable, Inject, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UserService } from '@modules/user/user.service';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { User } from '@modules/user/user.entity';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly cacheTTL: number;

  constructor(
    private readonly users: UserService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private readonly configService: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'topSecret51',
    });

    // Convert TTL from seconds to milliseconds
    this.cacheTTL = this.configService.get<number>('CACHE_TTL', 3600) * 1000;
  }

  async validate(payload: any): Promise<User> {
    const cacheKey = `user:${payload.sub}`;
    const cachedUser = await this.cacheManager.get<User>(cacheKey);

    if (cachedUser) {
      return cachedUser;
    }

    const user = await this.users.findOne({
      where: { id: payload.sub },
      relations: ['roles', 'roles.permissions'],
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    await this.cacheManager.set(cacheKey, user, this.cacheTTL);

    return user;
  }
}
