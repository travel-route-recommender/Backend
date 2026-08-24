import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

const DOC_ALLOWED_MIME = new Set([
  ...ALLOWED_MIME,
  'application/pdf',
]);

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/heic': '.heic',
  'image/heif': '.heif',
  'application/pdf': '.pdf',
};

export const TICKET_MAX_BYTES = 5 * 1024 * 1024;
export const TICKET_MAX_PER_ITEM = 10;
export const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;

@Injectable()
export class LocalUploadService implements OnModuleInit {
  private readonly uploadRoot: string;

  constructor(private readonly config: ConfigService) {
    this.uploadRoot = path.resolve(
      process.cwd(),
      this.config.get<string>('UPLOAD_DIR', 'uploads'),
    );
  }

  async onModuleInit() {
    await fs.mkdir(path.join(this.uploadRoot, 'tickets'), { recursive: true });
    await fs.mkdir(path.join(this.uploadRoot, 'documents'), {
      recursive: true,
    });
  }

  getUploadRoot() {
    return this.uploadRoot;
  }

  assertTicketImage(file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('image 파일이 필요합니다');
    }
    if (!ALLOWED_MIME.has(file.mimetype)) {
      throw new BadRequestException(
        '지원 형식: jpeg, png, webp, heic (이미지 파일만)',
      );
    }
    if (file.size > TICKET_MAX_BYTES) {
      throw new BadRequestException('파일 크기는 5MB 이하여야 합니다');
    }
  }

  assertDocumentFile(file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('file 파일이 필요합니다');
    }
    if (!DOC_ALLOWED_MIME.has(file.mimetype)) {
      throw new BadRequestException(
        '지원 형식: jpeg, png, webp, heic, pdf',
      );
    }
    if (file.size > DOCUMENT_MAX_BYTES) {
      throw new BadRequestException('파일 크기는 10MB 이하여야 합니다');
    }
  }

  /**
   * Saves buffer under uploads/tickets/{roomId}/{id}{ext}
   * Returns public URL path starting with /uploads/...
   */
  async saveTicketImage(
    roomId: string,
    file: Express.Multer.File,
  ): Promise<{ ticketId: string; imageUrl: string; absolutePath: string }> {
    this.assertTicketImage(file);

    const ticketId = randomUUID();
    const ext =
      EXT_BY_MIME[file.mimetype] ??
      (path.extname(file.originalname).toLowerCase() || '.bin');
    const dir = path.join(this.uploadRoot, 'tickets', roomId);
    await fs.mkdir(dir, { recursive: true });

    const filename = `${ticketId}${ext}`;
    const absolutePath = path.join(dir, filename);
    await fs.writeFile(absolutePath, file.buffer);

    return {
      ticketId,
      imageUrl: `/uploads/tickets/${roomId}/${filename}`,
      absolutePath,
    };
  }

  async saveRoomDocument(
    roomId: string,
    file: Express.Multer.File,
  ): Promise<{
    documentId: string;
    fileUrl: string;
    absolutePath: string;
  }> {
    this.assertDocumentFile(file);

    const documentId = randomUUID();
    const ext =
      EXT_BY_MIME[file.mimetype] ??
      (path.extname(file.originalname).toLowerCase() || '.bin');
    const dir = path.join(this.uploadRoot, 'documents', roomId);
    await fs.mkdir(dir, { recursive: true });

    const filename = `${documentId}${ext}`;
    const absolutePath = path.join(dir, filename);
    await fs.writeFile(absolutePath, file.buffer);

    return {
      documentId,
      fileUrl: `/uploads/documents/${roomId}/${filename}`,
      absolutePath,
    };
  }

  async deleteByPublicUrl(imageUrl: string) {
    if (!imageUrl?.startsWith('/uploads/')) return;
    const relative = imageUrl.replace(/^\/uploads\//, '');
    const absolutePath = path.join(this.uploadRoot, relative);
    // prevent path traversal
    if (!absolutePath.startsWith(this.uploadRoot)) return;
    try {
      await fs.unlink(absolutePath);
    } catch {
      // already gone
    }
  }
}

