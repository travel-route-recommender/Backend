import { BadRequestException, Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

@Injectable()
export class PasswordService {
  private readonly dummyHashPromise = this.hash(
    'not-a-real-password-used-only-to-equalize-login-timing',
  );

  hash(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });
  }

  assertPolicy(password: string, email?: string): void {
    const normalized = password.normalize('NFKC').toLowerCase();
    const commonPasswords = new Set([
      'password1234',
      'qwerty123456',
      '123456789012',
      'letmein123456',
      'tourmate1234',
    ]);
    const emailLocalPart = email?.split('@')[0]?.toLowerCase();
    if (
      commonPasswords.has(normalized) ||
      (/^(.)\1+$/.test(normalized) && normalized.length >= 12) ||
      (emailLocalPart &&
        emailLocalPart.length >= 4 &&
        normalized.includes(emailLocalPart))
    ) {
      throw new BadRequestException('Choose a less predictable password');
    }
  }

  async verify(passwordHash: string, password: string): Promise<boolean> {
    if (!passwordHash.startsWith('$argon2id$')) return false;
    return argon2.verify(passwordHash, password);
  }

  needsRehash(passwordHash: string): boolean {
    return passwordHash.startsWith('$argon2id$')
      ? argon2.needsRehash(passwordHash, {
          memoryCost: 19_456,
          timeCost: 2,
          parallelism: 1,
        })
      : false;
  }

  async consumeDummyVerification(password: string): Promise<void> {
    const dummyHash = await this.dummyHashPromise;
    await argon2.verify(dummyHash, password).catch(() => false);
  }
}
