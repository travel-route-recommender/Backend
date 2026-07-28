import { Injectable } from '@nestjs/common';
import { Request } from 'express';
import { ClientContext } from './auth.types';
import { ClientPlatform } from '../schemas/auth-session.schema';

export interface ClientMetadata {
  installationId?: string;
  platform?: ClientPlatform;
  deviceName?: string;
  appVersion?: string;
}

@Injectable()
export class RequestContextService {
  fromRequest(request: Request, metadata: ClientMetadata): ClientContext {
    const ip = request.ip || request.socket.remoteAddress || 'unknown';

    return {
      installationId: metadata.installationId ?? `legacy:${this.ipPrefix(ip)}`,
      platform: metadata.platform ?? 'unknown',
      deviceName: metadata.deviceName,
      appVersion: metadata.appVersion,
      ip,
      ipPrefix: this.ipPrefix(ip),
      userAgent: request.get('user-agent'),
    };
  }

  private ipPrefix(ip: string): string {
    const normalized = ip.replace(/^::ffff:/, '');
    const ipv4 = normalized.split('.');
    if (ipv4.length === 4) return `${ipv4.slice(0, 3).join('.')}.0/24`;
    const ipv6 = normalized.split(':');
    if (ipv6.length > 2) return `${ipv6.slice(0, 4).join(':')}::/64`;
    return 'unknown';
  }
}
