import { ExecutionContext, Injectable, CanActivate } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMS_KEY } from '../decorators/permissions.decorator';
import { User } from '@modules/user/user.entity';

@Injectable()
export class PermsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext) {
    const perms = this.reflector.get<{ action: string; resource: string }[]>(
      PERMS_KEY,
      ctx.getHandler(),
    );

    if (!perms) return true;
    const user: User = ctx.switchToHttp().getRequest().user;
    const up = user.roles.flatMap((r) => r.permissions);

    return perms.every((p) =>
      up.some((up) => up.action === p.action && up.resource === p.resource),
    );
  }
}
