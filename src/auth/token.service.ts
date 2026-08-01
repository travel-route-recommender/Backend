import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createPublicKey, randomUUID } from 'crypto';
import { AccessTokenClaims, AccountType } from './auth.types';

@Injectable()
export class TokenService {
  private static readonly UNSAFE_HS256_SECRETS = new Set([
    'change-me-access-secret',
    'tourmate-development-only-secret-not-for-production',
  ]);

  readonly issuer: string;
  readonly audience: string;
  readonly accessTokenLifetimeSeconds: number;
  readonly algorithm: 'RS256' | 'HS256';
  readonly verificationKey: string;
  private readonly signingKey: string;
  private readonly keyId: string;
  private readonly verificationKeys = new Map<string, string>();

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {
    this.issuer = this.config.get('JWT_ISSUER', 'https://auth.tourmate.local');
    this.audience = this.config.get('JWT_AUDIENCE', 'tourmate-api');
    this.accessTokenLifetimeSeconds = this.durationSeconds(
      this.config.get('JWT_ACCESS_EXPIRES_IN', '15m'),
      15 * 60,
    );
    this.keyId = this.config.get('JWT_ACCESS_KEY_ID', 'tourmate-access-1');

    const privateKey = this.decodeKey('JWT_ACCESS_PRIVATE_KEY_BASE64');
    const publicKey = this.decodeKey('JWT_ACCESS_PUBLIC_KEY_BASE64');
    if (privateKey || publicKey) {
      if (!privateKey || !publicKey) {
        throw new Error(
          'JWT_ACCESS_PRIVATE_KEY_BASE64 and JWT_ACCESS_PUBLIC_KEY_BASE64 must be configured together',
        );
      }
      this.algorithm = 'RS256';
      this.signingKey = privateKey;
      this.verificationKey = publicKey;
      this.verificationKeys.set(this.keyId, publicKey);
      for (const [keyId, key] of this.previousPublicKeys()) {
        if (keyId === this.keyId) {
          throw new Error(
            'JWT_ACCESS_PREVIOUS_PUBLIC_KEYS_JSON contains the active key id',
          );
        }
        this.verificationKeys.set(keyId, key);
      }
    } else {
      if (this.config.get('NODE_ENV') === 'production') {
        throw new Error('Production access tokens require asymmetric JWT keys');
      }
      this.algorithm = 'HS256';
      const secret = this.hs256Secret();
      this.signingKey = secret;
      this.verificationKey = secret;
      this.verificationKeys.set(this.keyId, secret);
    }
  }

  verificationKeyForToken(rawJwtToken: string): string {
    const [encodedHeader] = rawJwtToken.split('.');
    if (!encodedHeader) throw new Error('JWT header is missing');

    let header: { alg?: unknown; kid?: unknown };
    try {
      header = JSON.parse(
        Buffer.from(encodedHeader, 'base64url').toString('utf8'),
      ) as { alg?: unknown; kid?: unknown };
    } catch {
      throw new Error('JWT header is invalid');
    }

    if (header.alg !== this.algorithm) {
      throw new Error('JWT algorithm is not allowed');
    }
    if (typeof header.kid !== 'string' || !header.kid) {
      throw new Error('JWT key id is missing');
    }

    const key = this.verificationKeys.get(header.kid);
    if (!key) throw new Error('JWT key id is unknown');
    return key;
  }

  issueAccessToken(input: {
    userId: string;
    sessionId: string;
    scopes: string[];
    accountType: AccountType;
    securityVersion: number;
  }): Promise<string> {
    const payload: AccessTokenClaims = {
      sub: input.userId,
      sid: input.sessionId,
      scope: input.scopes,
      account_type: input.accountType,
      ver: input.securityVersion,
      jti: randomUUID(),
    };
    const keyOption =
      this.algorithm === 'RS256'
        ? { privateKey: this.signingKey }
        : { secret: this.signingKey };
    return this.jwt.signAsync(payload, {
      ...keyOption,
      algorithm: this.algorithm,
      keyid: this.keyId,
      issuer: this.issuer,
      audience: this.audience,
      expiresIn: this.accessTokenLifetimeSeconds,
    });
  }

  getJwks(): { keys: Record<string, unknown>[] } {
    if (this.algorithm !== 'RS256') {
      if (this.config.get('NODE_ENV') === 'production') {
        throw new ServiceUnavailableException(
          'Asymmetric JWT keys are unavailable',
        );
      }
      return { keys: [] };
    }
    const keys = [...this.verificationKeys.entries()].map(
      ([keyId, publicKey]) => ({
        ...createPublicKey(publicKey).export({ format: 'jwk' }),
        kid: keyId,
        alg: 'RS256',
        use: 'sig',
      }),
    );
    return {
      keys,
    };
  }

  private decodeKey(name: string): string | undefined {
    const value = this.config.get<string>(name);
    return value ? Buffer.from(value, 'base64').toString('utf8') : undefined;
  }

  private hs256Secret(): string {
    const secret = this.config.get<string>('JWT_ACCESS_SECRET')?.trim();
    const isTest = this.config.get('NODE_ENV') === 'test';
    if (isTest && (!secret || TokenService.UNSAFE_HS256_SECRETS.has(secret))) {
      return 'tourmate-test-only-secret-with-at-least-32-chars';
    }
    if (!secret) {
      if (isTest) {
        return 'tourmate-test-only-secret-with-at-least-32-chars';
      }
      throw new Error(
        'JWT_ACCESS_SECRET is required when asymmetric JWT keys are not configured',
      );
    }
    if (!isTest && TokenService.UNSAFE_HS256_SECRETS.has(secret)) {
      throw new Error('JWT_ACCESS_SECRET contains an unsafe placeholder value');
    }
    if (secret.length < 32) {
      throw new Error('JWT_ACCESS_SECRET must contain at least 32 characters');
    }
    return secret;
  }

  private previousPublicKeys(): Map<string, string> {
    const serialized = this.config.get<string>(
      'JWT_ACCESS_PREVIOUS_PUBLIC_KEYS_JSON',
      '{}',
    );
    if (!serialized.trim()) return new Map();

    let parsed: unknown;
    try {
      parsed = JSON.parse(serialized);
    } catch {
      throw new Error('JWT_ACCESS_PREVIOUS_PUBLIC_KEYS_JSON is invalid JSON');
    }
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
      throw new Error(
        'JWT_ACCESS_PREVIOUS_PUBLIC_KEYS_JSON must be a JSON object',
      );
    }

    const result = new Map<string, string>();
    for (const [keyId, encodedKey] of Object.entries(parsed)) {
      if (
        !/^[A-Za-z0-9._-]{1,128}$/.test(keyId) ||
        typeof encodedKey !== 'string'
      ) {
        throw new Error(
          'JWT_ACCESS_PREVIOUS_PUBLIC_KEYS_JSON contains an invalid entry',
        );
      }
      const publicKey = Buffer.from(encodedKey, 'base64').toString('utf8');
      if (!publicKey.includes('BEGIN PUBLIC KEY')) {
        throw new Error(
          `Previous JWT public key ${keyId} is not an SPKI PEM key`,
        );
      }
      result.set(keyId, publicKey);
    }
    return result;
  }

  private durationSeconds(value: string | number, fallback: number): number {
    if (typeof value === 'number' && value > 0) return value;
    const match = String(value)
      .trim()
      .match(/^(\d+)(s|m|h|d)$/);
    if (!match) return fallback;
    const amount = Number(match[1]);
    const multiplier = { s: 1, m: 60, h: 3_600, d: 86_400 }[match[2]];
    return amount * (multiplier ?? 1);
  }
}
