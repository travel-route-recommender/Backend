import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { ScopesGuard } from '../common/guards/scopes.guard';
import { PublicRateLimitGuard } from '../common/guards/public-rate-limit.guard';
import { JwtStrategy } from '../common/guards/jwt.strategy';
import {
  AuthIdentity,
  AuthIdentitySchema,
} from '../schemas/auth-identity.schema';
import { AuthSession, AuthSessionSchema } from '../schemas/auth-session.schema';
import {
  RefreshOperation,
  RefreshOperationSchema,
} from '../schemas/refresh-operation.schema';
import {
  RefreshToken,
  RefreshTokenSchema,
} from '../schemas/refresh-token.schema';
import { TravelRoom, TravelRoomSchema } from '../schemas/travel-room.schema';
import { UsersModule } from '../users/users.module';
import { ApiRateLimitService } from './api-rate-limit.service';
import { AuthController } from './auth.controller';
import { AuthCryptoService } from './auth-crypto.service';
import { AuthSessionService } from './auth-session.service';
import { AuthService } from './auth.service';
import { IdentityService } from './identity.service';
import { LoginProtectionService } from './login-protection.service';
import { OidcService } from './oidc.service';
import { PasswordService } from './password.service';
import { RequestContextService } from './request-context.service';
import { SecurityStoreService } from './security-store.service';
import { TokenService } from './token.service';

@Global()
@Module({
  imports: [
    UsersModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({}),
    MongooseModule.forFeature([
      { name: TravelRoom.name, schema: TravelRoomSchema },
      { name: AuthIdentity.name, schema: AuthIdentitySchema },
      { name: AuthSession.name, schema: AuthSessionSchema },
      { name: RefreshToken.name, schema: RefreshTokenSchema },
      { name: RefreshOperation.name, schema: RefreshOperationSchema },
    ]),
  ],
  providers: [
    ApiRateLimitService,
    AuthService,
    AuthSessionService,
    AuthCryptoService,
    IdentityService,
    LoginProtectionService,
    OidcService,
    PasswordService,
    RequestContextService,
    SecurityStoreService,
    TokenService,
    { provide: APP_GUARD, useClass: PublicRateLimitGuard },
    JwtStrategy,
    ScopesGuard,
    PublicRateLimitGuard,
  ],
  controllers: [AuthController],
  exports: [
    AuthService,
    AuthSessionService,
    ApiRateLimitService,
    AuthCryptoService,
    RequestContextService,
    SecurityStoreService,
    ScopesGuard,
    PublicRateLimitGuard,
  ],
})
export class AuthModule {}
