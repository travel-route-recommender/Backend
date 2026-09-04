import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthUser, JwtPayload } from '../decorators/current-user.decorator';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly jwtService: JwtService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>(
        'JWT_ACCESS_SECRET',
        'change-me-access-secret',
      ),
    });
  }

  validate(payload: JwtPayload): AuthUser {
    if (!payload.sub || (payload.typ && payload.typ !== 'access')) {
      throw new UnauthorizedException({
        code: 'INVALID_ACCESS_TOKEN',
        message: '로그인 정보가 만료되었습니다. 다시 로그인해 주세요.',
      });
    }
    return { userId: payload.sub, email: payload.email };
  }
}
