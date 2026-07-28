import { UnauthorizedException } from '@nestjs/common';

export type AuthUnauthorizedCode =
  | 'TOKEN_EXPIRED'
  | 'TOKEN_INVALID'
  | 'SESSION_REVOKED'
  | 'TOKEN_OBSOLETE'
  | 'ACCOUNT_UNAVAILABLE'
  | 'REFRESH_INVALID';

export function authUnauthorized(
  code: AuthUnauthorizedCode,
  message: string,
): UnauthorizedException {
  return new UnauthorizedException({ code, message });
}
