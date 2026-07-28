import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthSessionService } from '../../auth/auth-session.service';
import { AccessTokenClaims } from '../../auth/auth.types';
import { RequestContextService } from '../../auth/request-context.service';
import { TokenService } from '../../auth/token.service';
import { authUnauthorized } from '../../auth/auth-errors';
import { AuthUser } from '../decorators/current-user.decorator';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    tokenService: TokenService,
    private readonly sessions: AuthSessionService,
    private readonly requestContext: RequestContextService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKeyProvider: (_request, rawJwtToken: string, done) => {
        try {
          done(null, tokenService.verificationKeyForToken(rawJwtToken));
        } catch (error) {
          done(error);
        }
      },
      algorithms: [tokenService.algorithm],
      issuer: tokenService.issuer,
      audience: tokenService.audience,
      passReqToCallback: true,
    });
  }

  async validate(
    request: Request,
    payload: AccessTokenClaims,
  ): Promise<AuthUser> {
    if (
      !payload.sub ||
      !payload.sid ||
      !Array.isArray(payload.scope) ||
      !['member', 'guest'].includes(payload.account_type) ||
      !Number.isInteger(payload.ver) ||
      payload.ver < 1
    ) {
      throw authUnauthorized('TOKEN_INVALID', 'Access token is invalid');
    }
    const context = this.requestContext.fromRequest(request, {});
    await this.sessions.assertAccessAllowed(
      payload.sub,
      payload.sid,
      payload.ver,
      request.path,
      context.ipPrefix,
    );
    return {
      userId: payload.sub,
      sessionId: payload.sid,
      scopes: payload.scope,
      accountType: payload.account_type,
      securityVersion: payload.ver,
    };
  }
}
