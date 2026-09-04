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
  email?: string;
  typ?: 'access' | 'refresh';
  jti?: string;
}

export class AuthUser {
  userId: string;
  email?: string;
}
