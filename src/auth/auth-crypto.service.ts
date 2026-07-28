import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from 'crypto';

@Injectable()
export class AuthCryptoService {
  private readonly identifierKey: Buffer;
  private readonly responseEncryptionKey: Buffer;

  constructor(private readonly config: ConfigService) {
    const configuredHashKey = this.config.get<string>('SECURITY_HASH_KEY');
    const developmentSeed = this.config.get<string>(
      'JWT_ACCESS_SECRET',
      'tourmate-development-only-secret-not-for-production',
    );
    this.identifierKey = createHash('sha256')
      .update(configuredHashKey ?? developmentSeed)
      .digest();

    const configuredEncryptionKey = this.config.get<string>(
      'REFRESH_RESPONSE_ENCRYPTION_KEY',
    );
    if (configuredEncryptionKey) {
      const decoded = Buffer.from(configuredEncryptionKey, 'base64');
      if (decoded.length !== 32) {
        throw new Error(
          'REFRESH_RESPONSE_ENCRYPTION_KEY must decode to exactly 32 bytes',
        );
      }
      this.responseEncryptionKey = decoded;
    } else {
      this.responseEncryptionKey = createHash('sha256')
        .update(`refresh-response:${developmentSeed}`)
        .digest();
    }
  }

  normalizeEmail(email: string): string {
    return email.trim().normalize('NFKC').toLowerCase();
  }

  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('base64url');
  }

  hashIdentifier(value: string): string {
    return createHmac('sha256', this.identifierKey)
      .update(value)
      .digest('base64url');
  }

  randomToken(byteLength = 32): string {
    return randomBytes(byteLength).toString('base64url');
  }

  encryptJson(value: unknown): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv(
      'aes-256-gcm',
      this.responseEncryptionKey,
      iv,
    );
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(value), 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return [iv, tag, ciphertext]
      .map((part) => part.toString('base64url'))
      .join('.');
  }

  decryptJson<T>(encoded: string): T {
    const [ivEncoded, tagEncoded, ciphertextEncoded] = encoded.split('.');
    if (!ivEncoded || !tagEncoded || !ciphertextEncoded) {
      throw new Error('Invalid encrypted payload');
    }
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.responseEncryptionKey,
      Buffer.from(ivEncoded, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tagEncoded, 'base64url'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertextEncoded, 'base64url')),
      decipher.final(),
    ]);
    return JSON.parse(plaintext.toString('utf8')) as T;
  }
}
