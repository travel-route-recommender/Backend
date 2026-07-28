import { setServers } from 'node:dns';
import { isIP } from 'node:net';

export function configureDnsServers(serialized?: string): void {
  if (!serialized?.trim()) return;

  const servers = serialized
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (servers.length === 0 || servers.some((server) => isIP(server) === 0)) {
    throw new Error('DNS_SERVERS must contain comma-separated IP addresses');
  }

  setServers(servers);
}
