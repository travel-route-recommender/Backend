import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { createReadStream, existsSync } from 'fs';
import { promises as fs } from 'fs';
import * as path from 'path';
import { LocalUploadService } from './local-upload.service';

type SignedPayload = {
  path: string;
  roomId: string;
  exp: number;
};

@Injectable()
export class SignedUrlService {
  private readonly secret: string;
  private readonly defaultTtlSec: number;
  private readonly appBaseUrl: string;

  constructor(
    private readonly config: ConfigService,
    private readonly uploads: LocalUploadService,
  ) {
    this.secret =
      this.config.get<string>('UPLOAD_SIGNING_SECRET') ||
      this.config.get<string>('JWT_ACCESS_SECRET') ||
      'dev-upload-signing-secret';
    this.defaultTtlSec = Number(
      this.config.get<string>('UPLOAD_SIGNED_URL_TTL_SEC', '900'),
    );
    this.appBaseUrl = this.config
      .get<string>('APP_BASE_URL', 'http://localhost:3000')
      .replace(/\/$/, '');
  }

  private b64url(input: Buffer | string) {
    const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
    return buf
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  private fromB64url(input: string) {
    const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
    const b64 = input.replace(/-/g, '+').replace(/_/g, '/') + pad;
    return Buffer.from(b64, 'base64');
  }

  private signRaw(data: string) {
    return this.b64url(
      createHmac('sha256', this.secret).update(data).digest(),
    );
  }

  /**
   * Creates a short-lived download token for a /uploads/... path.
   * Download via GET /api/v1/files/download?token=...
   */
  createDownloadUrl(opts: {
    publicPath: string;
    roomId: string;
    ttlSec?: number;
  }) {
    if (!opts.publicPath.startsWith('/uploads/')) {
      throw new ForbiddenException('서명 가능한 경로가 아닙니다');
    }
    const exp =
      Math.floor(Date.now() / 1000) + (opts.ttlSec ?? this.defaultTtlSec);
    const payload: SignedPayload = {
      path: opts.publicPath,
      roomId: opts.roomId,
      exp,
    };
    const body = this.b64url(JSON.stringify(payload));
    const sig = this.signRaw(body);
    const token = `${body}.${sig}`;
    return {
      token,
      url: `${this.appBaseUrl}/api/v1/files/download?token=${encodeURIComponent(token)}`,
      path: opts.publicPath,
      expiresAt: new Date(exp * 1000).toISOString(),
      expiresInSec: opts.ttlSec ?? this.defaultTtlSec,
    };
  }

  verifyToken(token: string): SignedPayload {
    const [body, sig] = token.split('.');
    if (!body || !sig) {
      throw new UnauthorizedException('Invalid download token');
    }
    const expected = this.signRaw(body);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Invalid download token');
    }
    let payload: SignedPayload;
    try {
      payload = JSON.parse(this.fromB64url(body).toString('utf8'));
    } catch {
      throw new UnauthorizedException('Invalid download token');
    }
    if (!payload?.path || !payload.roomId || !payload.exp) {
      throw new UnauthorizedException('Invalid download token');
    }
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException({
        code: 'DOWNLOAD_TOKEN_EXPIRED',
        message: '다운로드 링크가 만료되었습니다. 다시 발급하세요.',
      });
    }
    if (!payload.path.startsWith('/uploads/')) {
      throw new ForbiddenException('Invalid path');
    }
    return payload;
  }

  resolveAbsolutePath(publicPath: string) {
    const relative = publicPath.replace(/^\/uploads\//, '');
    const absolutePath = path.join(this.uploads.getUploadRoot(), relative);
    if (!absolutePath.startsWith(this.uploads.getUploadRoot())) {
      throw new ForbiddenException('Invalid path');
    }
    if (!existsSync(absolutePath)) {
      throw new NotFoundException('File not found');
    }
    return absolutePath;
  }

  async openDownloadStream(token: string) {
    const payload = this.verifyToken(token);
    const absolutePath = this.resolveAbsolutePath(payload.path);
    const stat = await fs.stat(absolutePath);
    return {
      stream: createReadStream(absolutePath),
      absolutePath,
      publicPath: payload.path,
      roomId: payload.roomId,
      size: stat.size,
      filename: path.basename(absolutePath),
    };
  }
}
