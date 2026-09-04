import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthUser, JwtPayload } from '../decorators/current-user.decorator';
import { UsersService } from '../../users/users.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly usersService: UsersService,
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

  async validate(payload: JwtPayload): Promise<AuthUser> {
    if (!payload.sub || !(await this.usersService.existsById(payload.sub))) {
      throw new UnauthorizedException('Invalid token');
    }
    return { userId: payload.sub, email: payload.email };
  }
}
