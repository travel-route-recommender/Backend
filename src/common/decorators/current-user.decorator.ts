import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ user: AuthUser | undefined }>();
    return request.user;
  },
);

export interface JwtPayload {
  sub: string;
  sid: string;
  scope: string[];
  account_type: 'member' | 'guest';
  ver: number;
}

export class AuthUser {
  userId: string;
  sessionId: string;
  scopes: string[];
  accountType: 'member' | 'guest';
  securityVersion: number;
}
