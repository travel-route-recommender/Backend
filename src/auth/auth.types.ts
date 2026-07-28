import { ClientPlatform } from '../schemas/auth-session.schema';

export type AccountType = 'member' | 'guest';

export const MEMBER_SCOPES = [
  'profile:read',
  'profile:write',
  'quiz:read',
  'quiz:write',
  'room:create',
  'room:read',
  'room:admin',
  'candidate:write',
  'schedule:write',
  'invite:accept',
  'save:read',
  'save:write',
  'duri:use',
] as const;

export const GUEST_SCOPES = [
  'profile:read',
  'profile:write',
  'quiz:read',
  'quiz:write',
  'room:read',
  'candidate:write',
] as const;

export interface ClientContext {
  installationId: string;
  platform: ClientPlatform;
  deviceName?: string;
  appVersion?: string;
  ip: string;
  ipPrefix: string;
  userAgent?: string;
}

export interface AccessTokenClaims {
  sub: string;
  sid: string;
  scope: string[];
  account_type: AccountType;
  ver: number;
  jti?: string;
  iss?: string;
  aud?: string | string[];
  iat?: number;
  exp?: number;
}

export interface AuthTokenResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  refreshExpiresAt: string;
  sessionId: string;
  user: Record<string, unknown>;
}
