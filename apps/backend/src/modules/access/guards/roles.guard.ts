import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { User } from '@modules/user/user.entity';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext) {
    const roles = this.reflector.get<string[]>(ROLES_KEY, ctx.getHandler());

    if (!roles) return true;
    const user: User = ctx.switchToHttp().getRequest().user;

    return user.roles.some((r) => roles.includes(r.name));
  }
}
