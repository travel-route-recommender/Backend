import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthUser } from '../decorators/current-user.decorator';
import { REQUIRED_SCOPES_KEY } from '../decorators/require-scopes.decorator';

@Injectable()
export class ScopesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(
      REQUIRED_SCOPES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    const granted = new Set(request.user?.scopes ?? []);
    if (!request.user || !required.every((scope) => granted.has(scope))) {
      throw new ForbiddenException('This account cannot use this feature');
    }
    return true;
  }
}
