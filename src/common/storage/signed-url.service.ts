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

function isSignedPayload(value: unknown): value is SignedPayload {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.path === 'string' &&
    typeof candidate.roomId === 'string' &&
    typeof candidate.exp === 'number' &&
    Number.isFinite(candidate.exp)
  );
}

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
    const pad =
      input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
    const b64 = input.replace(/-/g, '+').replace(/_/g, '/') + pad;
    return Buffer.from(b64, 'base64');
  }

  private signRaw(data: string) {
    return this.b64url(createHmac('sha256', this.secret).update(data).digest());
  }

  private assertRoomPublicPath(publicPath: string, roomId: string) {
    const normalized = path.posix.normalize(publicPath);
    const allowedPrefixes = [
      `/uploads/tickets/${roomId}/`,
      `/uploads/documents/${roomId}/`,
    ];
    const prefix = allowedPrefixes.find((candidate) =>
      normalized.startsWith(candidate),
    );
    const filename = prefix ? normalized.slice(prefix.length) : '';
    if (
      normalized !== publicPath ||
      publicPath.includes('\\') ||
      !prefix ||
      !filename ||
      filename.includes('/')
    ) {
      throw new ForbiddenException('다운로드할 수 없는 여행방 파일입니다.');
    }
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
    this.assertRoomPublicPath(opts.publicPath, opts.roomId);
    const requestedTtl = opts.ttlSec ?? this.defaultTtlSec;
    const ttlSec =
      Number.isFinite(requestedTtl) && requestedTtl >= 60
        ? Math.min(Math.floor(requestedTtl), 86_400)
        : 900;
    const exp = Math.floor(Date.now() / 1000) + ttlSec;
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
      expiresInSec: ttlSec,
    };
  }

  verifyToken(token: unknown): SignedPayload {
    if (
      typeof token !== 'string' ||
      token.length === 0 ||
      token.length > 4096
    ) {
      throw this.invalidToken();
    }
    const parts = token.split('.');
    if (parts.length !== 2) {
      throw this.invalidToken();
    }
    const [body, sig] = parts;
    if (!body || !sig) throw this.invalidToken();
    const expected = this.signRaw(body);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw this.invalidToken();
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(this.fromB64url(body).toString('utf8')) as unknown;
    } catch {
      throw this.invalidToken();
    }
    if (!isSignedPayload(parsed) || !parsed.path || !parsed.roomId) {
      throw this.invalidToken();
    }
    const payload = parsed;
    if (payload.exp <= Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException({
        code: 'DOWNLOAD_TOKEN_EXPIRED',
        message: '다운로드 링크가 만료되었습니다. 다시 발급하세요.',
      });
    }
    this.assertRoomPublicPath(payload.path, payload.roomId);
    return payload;
  }

  resolveAbsolutePath(publicPath: string) {
    const relative = publicPath.replace(/^\/uploads\//, '');
    const uploadRoot = path.resolve(this.uploads.getUploadRoot());
    const absolutePath = path.resolve(uploadRoot, relative);
    if (!absolutePath.startsWith(`${uploadRoot}${path.sep}`)) {
      throw new ForbiddenException('다운로드 파일 경로가 올바르지 않습니다.');
    }
    if (!existsSync(absolutePath)) {
      throw new NotFoundException('다운로드할 파일을 찾을 수 없습니다.');
    }
    return absolutePath;
  }

  async openDownloadStream(token: unknown) {
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

  private invalidToken() {
    return new UnauthorizedException({
      code: 'INVALID_DOWNLOAD_TOKEN',
      message: '다운로드 링크가 올바르지 않습니다. 다시 발급해 주세요.',
    });
  }
}
