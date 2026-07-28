import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { AuthCryptoService } from './auth-crypto.service';
import { OidcService, VerifiedSocialIdentity } from './oidc.service';
import { SecurityStoreService } from './security-store.service';

describe('OidcService Kakao mobile authorization', () => {
  const values: Record<string, string> = {
    KAKAO_OIDC_AUDIENCES: 'kakao-client-id',
    KAKAO_OIDC_CLIENT_ID: 'kakao-client-id',
    KAKAO_OIDC_CLIENT_SECRET: 'server-only-client-secret',
    KAKAO_OIDC_MOBILE_REDIRECT_URIS: 'tripmatch://auth/callback/kakao',
  };
  const config = {
    get: (key: string) => values[key],
  } as unknown as ConfigService;
  const stored = new Map<string, string>();
  const store = {
    get: (key: string) => Promise.resolve(stored.get(key) ?? null),
    set: (key: string, value: string) => {
      stored.set(key, value);
      return Promise.resolve();
    },
    delete: (...keys: string[]) => {
      keys.forEach((key) => stored.delete(key));
      return Promise.resolve();
    },
  } as unknown as SecurityStoreService;
  const crypto = {
    hashIdentifier: (value: string) => `hash:${value}`,
  } as unknown as AuthCryptoService;

  beforeEach(() => {
    stored.clear();
    jest.restoreAllMocks();
  });

  it('exchanges the code with PKCE and verifies the returned ID token', async () => {
    const service = new OidcService(config, crypto, store);
    stored.set(
      'security:oidc-challenge:hash:challenge-id',
      JSON.stringify({
        provider: 'kakao',
        installationIdHash: 'hash:installation:mobile-installation-id',
        nonce: 'challenge-nonce',
        state: 'challenge-state',
      }),
    );
    const identity: VerifiedSocialIdentity = {
      provider: 'kakao',
      issuer: 'https://kauth.kakao.com',
      subject: 'kakao-user',
      emailVerified: false,
    };
    const verify = jest.spyOn(service, 'verify').mockResolvedValue(identity);
    const tokenRequest = jest.spyOn(axios, 'post').mockResolvedValue({
      data: { id_token: 'kakao-id-token' },
    });

    await expect(
      service.verifyKakaoAuthorizationCode({
        code: 'authorization-code',
        challengeId: 'challenge-id',
        state: 'challenge-state',
        codeVerifier: 'v'.repeat(64),
        redirectUri: 'tripmatch://auth/callback/kakao',
        installationId: 'mobile-installation-id',
      }),
    ).resolves.toBe(identity);

    const encodedForm = tokenRequest.mock.calls[0]?.[1];
    expect(typeof encodedForm).toBe('string');
    const form = new URLSearchParams(String(encodedForm));
    expect(form.get('client_secret')).toBe('server-only-client-secret');
    expect(form.get('code_verifier')).toBe('v'.repeat(64));
    expect(verify).toHaveBeenCalledWith(
      'kakao',
      'kakao-id-token',
      'challenge-id',
      'mobile-installation-id',
      'challenge-state',
    );
  });

  it('rejects a mismatched OAuth state before contacting Kakao', async () => {
    const service = new OidcService(config, crypto, store);
    stored.set(
      'security:oidc-challenge:hash:challenge-id',
      JSON.stringify({
        provider: 'kakao',
        installationIdHash: 'hash:installation:mobile-installation-id',
        nonce: 'challenge-nonce',
        state: 'challenge-state',
      }),
    );
    const tokenRequest = jest.spyOn(axios, 'post');

    await expect(
      service.verifyKakaoAuthorizationCode({
        code: 'authorization-code',
        challengeId: 'challenge-id',
        state: 'attacker-state',
        codeVerifier: 'v'.repeat(64),
        redirectUri: 'tripmatch://auth/callback/kakao',
        installationId: 'mobile-installation-id',
      }),
    ).rejects.toThrow('Invalid social login challenge');
    expect(tokenRequest).not.toHaveBeenCalled();
  });

  it('allows only the configured custom scheme for a mobile code exchange', async () => {
    const service = new OidcService(config, crypto, store);
    stored.set(
      'security:oidc-challenge:hash:challenge-id',
      JSON.stringify({
        provider: 'kakao',
        installationIdHash: 'hash:installation:mobile-installation-id',
        nonce: 'challenge-nonce',
        state: 'challenge-state',
      }),
    );
    jest.spyOn(service, 'verify').mockResolvedValue({
      provider: 'kakao',
      issuer: 'https://kauth.kakao.com',
      subject: 'kakao-mobile-user',
      emailVerified: false,
    });
    jest.spyOn(axios, 'post').mockResolvedValue({
      data: { id_token: 'kakao-mobile-id-token' },
    });

    await expect(
      service.verifyKakaoAuthorizationCode({
        code: 'authorization-code',
        challengeId: 'challenge-id',
        state: 'challenge-state',
        codeVerifier: 'v'.repeat(64),
        redirectUri: 'tripmatch://auth/callback/kakao',
        installationId: 'mobile-installation-id',
      }),
    ).resolves.toMatchObject({ subject: 'kakao-mobile-user' });
  });
});
