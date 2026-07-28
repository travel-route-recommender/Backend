import { getServers, setServers } from 'node:dns';
import { configureDnsServers } from './dns';

describe('configureDnsServers', () => {
  const originalServers = getServers();

  afterAll(() => setServers(originalServers));

  it('does nothing when no override is configured', () => {
    expect(() => configureDnsServers()).not.toThrow();
  });

  it('accepts comma-separated DNS server addresses', () => {
    expect(() => configureDnsServers('1.1.1.1, 8.8.8.8')).not.toThrow();
    expect(getServers()).toEqual(['1.1.1.1', '8.8.8.8']);
  });

  it('rejects hostnames and malformed values', () => {
    expect(() => configureDnsServers('dns.example.com')).toThrow(
      'DNS_SERVERS must contain comma-separated IP addresses',
    );
  });
});
