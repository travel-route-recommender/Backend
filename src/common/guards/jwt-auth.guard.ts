import { HttpException, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { authUnauthorized } from '../../auth/auth-errors';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = unknown>(
    error: unknown,
    user: TUser | false | null,
    info: unknown,
  ): TUser {
    if (error instanceof HttpException) throw error;
    if (error || !user) {
      if (this.errorName(info) === 'TokenExpiredError') {
        throw authUnauthorized('TOKEN_EXPIRED', 'Access token expired');
      }
      throw authUnauthorized('TOKEN_INVALID', 'Access token is invalid');
    }
    return user;
  }

  private errorName(error: unknown): string | undefined {
    if (!error || typeof error !== 'object' || !('name' in error)) {
      return undefined;
    }
    return typeof error.name === 'string' ? error.name : undefined;
  }
}
