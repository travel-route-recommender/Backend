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

const DOC_ALLOWED_MIME = new Set([...ALLOWED_MIME, 'application/pdf']);

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/heic': '.heic',
  'image/heif': '.heif',
  'application/pdf': '.pdf',
};

type SupportedFileKind = 'jpeg' | 'png' | 'webp' | 'heif' | 'pdf';

export function detectFileKind(buffer: Buffer): SupportedFileKind | null {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return 'jpeg';
  }
  if (
    buffer.length >= 8 &&
    buffer
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'png';
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'webp';
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(4, 8).toString('ascii') === 'ftyp'
  ) {
    const brand = buffer.subarray(8, 12).toString('ascii').toLowerCase();
    if (['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand)) {
      return 'heif';
    }
  }
  if (
    buffer.length >= 5 &&
    buffer.subarray(0, 5).toString('ascii') === '%PDF-'
  ) {
    return 'pdf';
  }
  return null;
}

function expectedKindForMime(mime: string): SupportedFileKind | null {
  if (mime === 'image/jpeg') return 'jpeg';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/heic' || mime === 'image/heif') return 'heif';
  if (mime === 'application/pdf') return 'pdf';
  return null;
}

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
      throw new BadRequestException('업로드할 입장권 이미지를 선택해 주세요.');
    }
    if (!ALLOWED_MIME.has(file.mimetype)) {
      throw new BadRequestException(
        'JPG, PNG, WebP, HEIC 형식의 이미지만 업로드할 수 있습니다.',
      );
    }
    this.assertFileSignature(file);
    if (file.size > TICKET_MAX_BYTES || file.buffer.length > TICKET_MAX_BYTES) {
      throw new BadRequestException('입장권 이미지는 5MB 이하만 가능합니다.');
    }
  }

  assertDocumentFile(file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('업로드할 문서를 선택해 주세요.');
    }
    if (!DOC_ALLOWED_MIME.has(file.mimetype)) {
      throw new BadRequestException(
        'JPG, PNG, WebP, HEIC, PDF 형식만 업로드할 수 있습니다.',
      );
    }
    this.assertFileSignature(file);
    if (
      file.size > DOCUMENT_MAX_BYTES ||
      file.buffer.length > DOCUMENT_MAX_BYTES
    ) {
      throw new BadRequestException('문서는 10MB 이하만 업로드할 수 있습니다.');
    }
  }

  private assertFileSignature(file: Express.Multer.File) {
    if (!file.buffer?.length || file.size <= 0) {
      throw new BadRequestException('빈 파일은 업로드할 수 없습니다.');
    }
    const actual = detectFileKind(file.buffer);
    const expected = expectedKindForMime(file.mimetype);
    if (!actual || actual !== expected) {
      throw new BadRequestException({
        code: 'FILE_CONTENT_TYPE_MISMATCH',
        message: '파일 내용과 확장자 형식이 일치하지 않습니다.',
      });
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
    const absolutePath = path.resolve(this.uploadRoot, relative);
    // prevent path traversal
    if (!absolutePath.startsWith(`${this.uploadRoot}${path.sep}`)) return;
    try {
      await fs.unlink(absolutePath);
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: unknown }).code === 'ENOENT'
      ) {
        return;
      }
      throw error;
    }
  }
}
