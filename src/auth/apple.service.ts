import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';
import { SignJWT, createRemoteJWKSet, importPKCS8, jwtVerify } from 'jose';

const APPLE_ISS = 'https://appleid.apple.com';
const APPLE_JWKS = createRemoteJWKSet(
  new URL('https://appleid.apple.com/auth/keys'),
);

export type AppleIdentity = {
  sub: string;
  email?: string;
  emailVerified?: boolean;
  isPrivateEmail?: boolean;
};

@Injectable()
export class AppleService {
  constructor(private readonly config: ConfigService) {}

  private clientId() {
    return this.config.get<string>('APPLE_CLIENT_ID', '');
  }

  private teamId() {
    return this.config.get<string>('APPLE_TEAM_ID', '');
  }

  private keyId() {
    return this.config.get<string>('APPLE_KEY_ID', '');
  }

  private privateKey() {
    return (this.config.get<string>('APPLE_PRIVATE_KEY', '') || '')
      .replace(/\\n/g, '\n')
      .replace(/——/g, '-----');
  }

  private encSecret() {
    return (
      this.config.get<string>('APPLE_TOKEN_ENC_KEY') ||
      this.config.get<string>('JWT_ACCESS_SECRET') ||
      'change-me-access-secret'
    );
  }

  async verifyIdentityToken(
    identityToken: string,
    nonce?: string,
  ): Promise<AppleIdentity> {
    const audience = this.clientId();
    if (!audience) {
      throw new UnauthorizedException('Apple Sign In이 설정되지 않았습니다');
    }

    try {
      const { payload } = await jwtVerify(identityToken, APPLE_JWKS, {
        issuer: APPLE_ISS,
        audience,
      });

      if (nonce) {
        if (payload.nonce !== nonce) {
          throw new UnauthorizedException('Invalid Apple nonce');
        }
      }

      const sub = payload.sub;
      if (!sub) throw new UnauthorizedException('Invalid Apple token');

      const email =
        typeof payload.email === 'string' ? payload.email : undefined;
      const emailVerified =
        payload.email_verified === true ||
        payload.email_verified === 'true';
      const isPrivateEmail =
        payload.is_private_email === true ||
        payload.is_private_email === 'true' ||
        (email?.endsWith('@privaterelay.appleid.com') ?? false);

      return { sub, email, emailVerified, isPrivateEmail };
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('Invalid Apple identityToken');
    }
  }

  async createClientSecret() {
    const key = this.privateKey();
    const kid = this.keyId();
    const teamId = this.teamId();
    const clientId = this.clientId();
    if (!key || !kid || !teamId || !clientId) {
      throw new UnauthorizedException('Apple Sign In이 설정되지 않았습니다');
    }

    const pkcs8 = await importPKCS8(key, 'ES256');
    return new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid })
      .setIssuer(teamId)
      .setSubject(clientId)
      .setAudience(APPLE_ISS)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(pkcs8);
  }

  async exchangeAuthorizationCode(code: string) {
    const clientSecret = await this.createClientSecret();
    const body = new URLSearchParams({
      client_id: this.clientId(),
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
    });

    try {
      const { data } = await axios.post(
        'https://appleid.apple.com/auth/token',
        body.toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      );
      return {
        accessToken: data.access_token as string | undefined,
        refreshToken: data.refresh_token as string | undefined,
        idToken: data.id_token as string | undefined,
      };
    } catch {
      throw new UnauthorizedException('Apple authorization code 교환에 실패했습니다');
    }
  }

  async revokeRefreshToken(refreshToken: string) {
    const clientSecret = await this.createClientSecret();
    const body = new URLSearchParams({
      client_id: this.clientId(),
      client_secret: clientSecret,
      token: refreshToken,
      token_type_hint: 'refresh_token',
    });
    try {
      await axios.post(
        'https://appleid.apple.com/auth/revoke',
        body.toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      );
    } catch {
      // revoke 실패해도 내부 삭제는 진행
    }
  }

  encryptRefreshToken(token: string) {
    const key = createHash('sha256').update(this.encSecret()).digest();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const enc = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [
      iv.toString('base64url'),
      tag.toString('base64url'),
      enc.toString('base64url'),
    ].join('.');
  }

  decryptRefreshToken(packed: string) {
    const [ivB64, tagB64, encB64] = packed.split('.');
    if (!ivB64 || !tagB64 || !encB64) return null;
    const key = createHash('sha256').update(this.encSecret()).digest();
    const decipher = createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(ivB64, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
    const dec = Buffer.concat([
      decipher.update(Buffer.from(encB64, 'base64url')),
      decipher.final(),
    ]);
    return dec.toString('utf8');
  }
}
