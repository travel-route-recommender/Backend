import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('stores and verifies passwords with Argon2id', async () => {
    const hash = await service.hash('correct horse battery staple');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    await expect(
      service.verify(hash, 'correct horse battery staple'),
    ).resolves.toBe(true);
    await expect(service.verify(hash, 'wrong password')).resolves.toBe(false);
    expect(service.needsRehash(hash)).toBe(false);
  });

  it('rejects legacy bcrypt hashes', async () => {
    const bcryptHash =
      '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
    await expect(service.verify(bcryptHash, 'password')).resolves.toBe(false);
    expect(service.needsRehash(bcryptHash)).toBe(false);
  });
});
