import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { AuthProvider } from '../schemas/auth-identity.schema';
import { AuthCryptoService } from './auth-crypto.service';
import { SecurityStoreService } from './security-store.service';

interface SocialChallenge {
  provider: 'google' | 'kakao';
  installationIdHash: string;
  nonce: string;
  state: string;
}

interface KakaoAuthorizationCodeInput {
  code: string;
  challengeId: string;
  state: string;
  codeVerifier: string;
  redirectUri: string;
  installationId: string;
}

interface KakaoTokenResponse {
  id_token?: string;
}

export interface VerifiedSocialIdentity {
  provider: 'google' | 'kakao';
  issuer: string;
  subject: string;
  email?: string;
  emailVerified: boolean;
  nickname?: string;
  picture?: string;
}

@Injectable()
export class OidcService {
  private googleJwks?: unknown;
  private kakaoJwks?: unknown;

  constructor(
    private readonly config: ConfigService,
    private readonly crypto: AuthCryptoService,
    private readonly store: SecurityStoreService,
  ) {}

  async createChallenge(provider: 'google' | 'kakao', installationId: string) {
    const challengeId = this.crypto.randomToken(24);
    const nonce = this.crypto.randomToken(32);
    const state = this.crypto.randomToken(32);
    const challenge: SocialChallenge = {
      provider,
      installationIdHash: this.crypto.hashIdentifier(
        `installation:${installationId}`,
      ),
      nonce,
      state,
    };
    await this.store.set(
      this.challengeKey(challengeId),
      JSON.stringify(challenge),
      5 * 60,
    );
    return { challengeId, nonce, state, expiresIn: 300 };
  }

  async verify(
    provider: 'google' | 'kakao',
    idToken: string,
    challengeId: string,
    installationId: string,
    returnedState?: string,
  ): Promise<VerifiedSocialIdentity> {
    const challengeKey = this.challengeKey(challengeId);
    const challenge = await this.assertChallenge(
      provider,
      challengeId,
      installationId,
      returnedState,
    );

    await this.store.delete(challengeKey);

    const jose = await import('jose');
    const canonicalIssuer =
      provider === 'google'
        ? 'https://accounts.google.com'
        : 'https://kauth.kakao.com';
    const acceptedIssuers =
      provider === 'google'
        ? ['https://accounts.google.com', 'accounts.google.com']
        : [canonicalIssuer];
    const audiences = this.audiences(provider);
    const jwks =
      provider === 'google'
        ? (this.googleJwks ??= jose.createRemoteJWKSet(
            new URL('https://www.googleapis.com/oauth2/v3/certs'),
          ))
        : (this.kakaoJwks ??= jose.createRemoteJWKSet(
            new URL('https://kauth.kakao.com/.well-known/jwks.json'),
          ));

    try {
      const result = await jose.jwtVerify(
        idToken,
        jwks as Parameters<typeof jose.jwtVerify>[1],
        {
          algorithms: ['RS256'],
          issuer: acceptedIssuers,
          audience: audiences,
        },
      );
      const payload = result.payload;
      if (!payload.sub || payload.nonce !== challenge.nonce) {
        throw new UnauthorizedException('Invalid social identity token');
      }
      const email =
        typeof payload.email === 'string'
          ? this.crypto.normalizeEmail(payload.email)
          : undefined;
      return {
        provider,
        issuer: canonicalIssuer,
        subject: payload.sub,
        email,
        emailVerified:
          provider === 'kakao'
            ? Boolean(email)
            : payload.email_verified === true,
        nickname:
          typeof payload.name === 'string'
            ? payload.name
            : typeof payload.nickname === 'string'
              ? payload.nickname
              : undefined,
        picture:
          typeof payload.picture === 'string' ? payload.picture : undefined,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Invalid social identity token');
    }
  }

  async verifyKakaoAuthorizationCode(
    input: KakaoAuthorizationCodeInput,
  ): Promise<VerifiedSocialIdentity> {
    await this.assertChallenge(
      'kakao',
      input.challengeId,
      input.installationId,
      input.state,
    );

    const clientId = this.config.get<string>('KAKAO_OIDC_CLIENT_ID')?.trim();
    const clientSecret = this.config
      .get<string>('KAKAO_OIDC_CLIENT_SECRET')
      ?.trim();
    if (!clientId || !clientSecret) {
      throw new ServiceUnavailableException('Kakao login is not configured');
    }
    if (!this.audiences('kakao').includes(clientId)) {
      throw new ServiceUnavailableException(
        'Kakao OIDC client ID is not an accepted audience',
      );
    }
    this.assertKakaoRedirectUri(input.redirectUri);

    const form = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: input.redirectUri,
      code: input.code,
      code_verifier: input.codeVerifier,
    });

    let idToken: string | undefined;
    try {
      const response = await axios.post<KakaoTokenResponse>(
        'https://kauth.kakao.com/oauth/token',
        form.toString(),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 5_000,
        },
      );
      idToken = response.data.id_token;
    } catch {
      throw new UnauthorizedException('Invalid Kakao authorization code');
    }
    if (!idToken) {
      throw new UnauthorizedException('Kakao OIDC ID token was not issued');
    }

    return this.verify(
      'kakao',
      idToken,
      input.challengeId,
      input.installationId,
      input.state,
    );
  }

  assertSocialProvider(provider: string): asserts provider is AuthProvider {
    if (provider !== 'google' && provider !== 'kakao') {
      throw new BadRequestException('Unsupported social provider');
    }
  }

  private audiences(provider: 'google' | 'kakao'): string[] {
    const key =
      provider === 'google' ? 'GOOGLE_OIDC_AUDIENCES' : 'KAKAO_OIDC_AUDIENCES';
    const values = (this.config.get<string>(key) ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    if (values.length === 0) {
      throw new ServiceUnavailableException(
        `${provider} login is not configured`,
      );
    }
    return values;
  }

  private async assertChallenge(
    provider: 'google' | 'kakao',
    challengeId: string,
    installationId: string,
    returnedState?: string,
  ): Promise<SocialChallenge> {
    const encodedChallenge = await this.store.get(
      this.challengeKey(challengeId),
    );
    if (!encodedChallenge) {
      throw new UnauthorizedException('Social login challenge expired');
    }

    let challenge: SocialChallenge;
    try {
      challenge = JSON.parse(encodedChallenge) as SocialChallenge;
    } catch {
      throw new UnauthorizedException('Invalid social login challenge');
    }
    const installationIdHash = this.crypto.hashIdentifier(
      `installation:${installationId}`,
    );
    if (
      challenge.provider !== provider ||
      challenge.installationIdHash !== installationIdHash ||
      (returnedState !== undefined && challenge.state !== returnedState)
    ) {
      throw new UnauthorizedException('Invalid social login challenge');
    }
    return challenge;
  }

  private assertKakaoRedirectUri(redirectUri: string): void {
    const configured = (
      this.config.get<string>('KAKAO_OIDC_MOBILE_REDIRECT_URIS') ?? ''
    )
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    let normalized: string;
    try {
      normalized = new URL(redirectUri).toString();
    } catch {
      throw new UnauthorizedException('Invalid Kakao redirect URI');
    }
    const allowed = configured.some((value) => {
      try {
        return new URL(value).toString() === normalized;
      } catch {
        return false;
      }
    });
    if (!allowed) {
      throw new UnauthorizedException('Invalid Kakao redirect URI');
    }
  }

  private challengeKey(challengeId: string): string {
    return `security:oidc-challenge:${this.crypto.hashIdentifier(challengeId)}`;
  }
}
